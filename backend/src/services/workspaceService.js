import { randomUUID } from 'node:crypto';
import WorkspaceNode from '../models/Node.js';
import ChangeLog from '../models/ChangeLog.js';

const plain = doc => doc ? doc.toObject() : null;
const safeNode = n => ({ nodeId: n.nodeId, parentId: n.parentId, title: n.title, kind: n.kind, x: n.x, y: n.y, deleted: n.deleted, version: n.version, updatedAt: n.updatedAt });

export async function seedWorkspace(workspaceId) {
  const count = await WorkspaceNode.countDocuments({ workspaceId });
  if (count) return;
  const seed = [
    { nodeId: 'root', parentId: null, title: 'Product workspace', kind: 'folder', x: 390, y: 60 },
    { nodeId: 'roadmap', parentId: 'root', title: 'Roadmap', kind: 'folder', x: 130, y: 220 },
    { nodeId: 'research', parentId: 'root', title: 'Research', kind: 'folder', x: 390, y: 220 },
    { nodeId: 'launch', parentId: 'root', title: 'Launch plan', kind: 'folder', x: 650, y: 220 },
    { nodeId: 'interviews', parentId: 'research', title: 'User interviews', kind: 'note', x: 310, y: 390 },
    { nodeId: 'milestones', parentId: 'roadmap', title: 'Milestones', kind: 'note', x: 80, y: 390 },
    { nodeId: 'campaign', parentId: 'launch', title: 'Campaign brief', kind: 'note', x: 650, y: 390 }
  ];
  const inserted = await WorkspaceNode.insertMany(seed.map(n => ({ ...n, workspaceId })));
  await ChangeLog.insertMany(inserted.map(n => ({ workspaceId, opId: randomUUID(), actorId: 'system', type: 'CREATE', nodeId: n.nodeId, timestamp: n.createdAt || new Date(), after: safeNode(plain(n)), metadata: { seed: true } })));
}

export async function getTree(workspaceId) {
  // $graphLookup resolves descendants in MongoDB rather than recursively querying from Node.
  const roots = await WorkspaceNode.aggregate([
    { $match: { workspaceId, parentId: null, deleted: false } },
    { $graphLookup: { from: WorkspaceNode.collection.name, startWith: '$nodeId', connectFromField: 'nodeId', connectToField: 'parentId', as: 'descendants', restrictSearchWithMatch: { workspaceId, deleted: false }, depthField: 'depth' } },
    { $project: { _id: 0, root: '$$ROOT', descendants: 1 } }
  ]);
  const docs = await WorkspaceNode.find({ workspaceId, deleted: false }).lean();
  const map = new Map(docs.map(n => [n.nodeId, safeNode(n)]));
  return { nodes: [...map.values()], graphLookupCount: roots.reduce((n, r) => n + r.descendants.length, 0) };
}

async function logChange(data) { return ChangeLog.create({ opId: randomUUID(), timestamp: new Date(), ...data }); }

export async function applyOperation(workspaceId, operation) {
  const { type, nodeId, actorId = 'anonymous', payload = {} } = operation;
  if (!type || !nodeId) throw new Error('Operation requires type and nodeId');
  const current = await WorkspaceNode.findOne({ workspaceId, nodeId });
  if (type === 'CREATE') {
    if (current && !current.deleted) return { type: 'ACK', node: safeNode(plain(current)), duplicate: true };
    let parentId = payload.parentId ?? null;
    let recovery = false;
    if (parentId) {
      const parent = await WorkspaceNode.findOne({ workspaceId, nodeId: parentId, deleted: false });
      if (!parent) { parentId = 'lost-found'; recovery = true; }
    }
    if (parentId === 'lost-found') {
      try {
        await WorkspaceNode.updateOne(
          { workspaceId, nodeId: 'lost-found' },
          {
            $setOnInsert: {
              parentId: null,
              title: 'Lost & Found',
              kind: 'folder',
              x: 40,
              y: 540,
              deleted: false,
              version: 1
            }
          },
          { upsert: true }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;

        const existing = await WorkspaceNode.findOne({
          workspaceId,
          nodeId: 'lost-found'
        });

        if (!existing) throw error;
      }
    }
    const node = await WorkspaceNode.findOneAndUpdate({ workspaceId, nodeId }, { $set: { workspaceId, nodeId, parentId, title: payload.title || 'Untitled node', kind: payload.kind || 'note', x: payload.x ?? 100, y: payload.y ?? 100, deleted: false, deletedAt: null, updatedAt: new Date() }, $inc: { version: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await logChange({ workspaceId, actorId, type: recovery ? 'CONFLICT_RECOVERY' : 'CREATE', nodeId, after: safeNode(plain(node)), metadata: recovery ? { reason: 'Parent was deleted while client was offline', originalParentId: payload.parentId, recoveredTo: 'lost-found' } : {} });
    return { type: 'ACK', node: safeNode(plain(node)), recovered: recovery };
  }
  if (!current) return { type: 'REJECT', nodeId, reason: 'Node not found' };
  if (type === 'UPDATE') {
    const before = safeNode(plain(current));
    const allowed = {};
    for (const k of ['title', 'kind', 'x', 'y', 'parentId']) if (payload[k] !== undefined) allowed[k] = payload[k];
    const node = await WorkspaceNode.findOneAndUpdate({ workspaceId, nodeId }, { $set: { ...allowed, updatedAt: new Date() }, $inc: { version: 1 } }, { new: true });
    await logChange({ workspaceId, actorId, type, nodeId, before, after: safeNode(plain(node)) });
    return { type: 'ACK', node: safeNode(plain(node)) };
  }
  if (type === 'DELETE') {
    const before = safeNode(plain(current));
    const now = new Date();

    const node = await WorkspaceNode.findOneAndUpdate(
      { workspaceId, nodeId, deleted: false },
      {
        $set: {
          deleted: true,
          deletedAt: now,
          updatedAt: now
        },
        $inc: { version: 1 }
      },
      { new: true }
    );

    if (!node) {
      return { type: 'REJECT', nodeId, reason: 'Node already deleted' };
    }

    await logChange({
      workspaceId,
      actorId,
      type: 'DELETE',
      nodeId,
      before,
      after: safeNode(plain(node))
    });

    if (current.kind === 'folder') {
      // Find all active descendants before changing their relationships.
      const descendants = await WorkspaceNode.aggregate([
        {
          $match: {
            workspaceId,
            nodeId,
            deleted: true
          }
        },
        {
          $graphLookup: {
            from: WorkspaceNode.collection.name,
            startWith: '$nodeId',
            connectFromField: 'nodeId',
            connectToField: 'parentId',
            as: 'descendants',
            restrictSearchWithMatch: {
              workspaceId,
              deleted: false
            },
            depthField: 'depth'
          }
        }
      ]);

      const children = (descendants[0]?.descendants || [])
        .filter(child => child.nodeId !== 'lost-found');

      if (children.length > 0) {
        await WorkspaceNode.updateOne(
          { workspaceId, nodeId: 'lost-found' },
          {
            $setOnInsert: {
              parentId: null,
              title: 'Lost & Found',
              kind: 'folder',
              x: 40,
              y: 540,
              deleted: false,
              version: 1
            }
          },
          { upsert: true }
        );

        // Move each top-level descendant into Lost & Found.
        // Descendants beneath those nodes retain their relationships.
        const childIds = new Set(children.map(child => child.nodeId));

        for (const child of children) {
          if (childIds.has(child.parentId)) continue;

          const beforeChild = safeNode(child);

          const recovered = await WorkspaceNode.findOneAndUpdate(
            {
              workspaceId,
              nodeId: child.nodeId,
              deleted: false
            },
            {
              $set: {
                parentId: 'lost-found',
                updatedAt: new Date()
              },
              $inc: { version: 1 }
            },
            { new: true }
          );

          if (recovered) {
            await logChange({
              workspaceId,
              actorId,
              type: 'CONFLICT_RECOVERY',
              nodeId: child.nodeId,
              before: beforeChild,
              after: safeNode(plain(recovered)),
              metadata: {
                reason: 'Ancestor folder was deleted',
                originalParentId: child.parentId,
                deletedFolderId: nodeId,
                recoveredTo: 'lost-found'
              }
            });
          }
        }
      }
    }

    return { type: 'ACK', node: safeNode(plain(node)) };
  }
  if (type === 'RESTORE') {
    const before = safeNode(plain(current));
    const node = await WorkspaceNode.findOneAndUpdate({ workspaceId, nodeId }, { $set: { deleted: false, deletedAt: null, updatedAt: new Date() }, $inc: { version: 1 } }, { new: true });
    await logChange({ workspaceId, actorId, type, nodeId, before, after: safeNode(plain(node)) });
    return { type: 'ACK', node: safeNode(plain(node)) };
  }
  throw new Error(`Unsupported operation: ${type}`);
}

export async function getHistory(workspaceId) {
  return ChangeLog.find({ workspaceId }).sort({ timestamp: 1 }).limit(2000).lean();
}

export async function stateAt(workspaceId, at) {
  // Replay the latest known state for each node at the requested timestamp.
  const changes = await ChangeLog.find({ workspaceId, timestamp: { $lte: new Date(at) } }).sort({ timestamp: 1 }).lean();
  const state = new Map();
  for (const c of changes) {
    if (c.after && c.after.nodeId) state.set(c.nodeId, c.after);
    else if (c.type === 'CREATE' && c.nodeId === 'root') { /* seed marker */ }
  }
  // Merge current records created before the log feature/seed event, using their creation time.
  const created = await WorkspaceNode.find({ workspaceId, createdAt: { $lte: new Date(at) } }).lean();
  for (const n of created) if (!state.has(n.nodeId)) state.set(n.nodeId, safeNode(n));
  return [...state.values()].filter(n => !n.deleted);
}
