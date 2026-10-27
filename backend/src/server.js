import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { WebSocketServer, WebSocket } from 'ws';
import { seedWorkspace, getTree, applyOperation, getHistory, stateAt } from './services/workspaceService.js';

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/conflict_free_workspace';
const app = express(); app.use(cors()); app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'Conflict-Free Workspace', time: new Date().toISOString() }));

app.get('/api/workspaces/:id/tree', async (req, res) => { try { await seedWorkspace(req.params.id); res.json(await getTree(req.params.id)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/workspaces/:id/history', async (req, res) => { try { res.json(await getHistory(req.params.id)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/workspaces/:id/state', async (req, res) => { try { if (!req.query.at) return res.status(400).json({ error: 'Query parameter at is required' }); res.json({ nodes: await stateAt(req.params.id, req.query.at) }); } catch (e) { res.status(500).json({ error: e.message }); } });
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const rooms = new Map();
server.on('upgrade', (req, socket, head) => { const url = new URL(req.url, 'http://localhost'); if (url.pathname !== '/ws') { socket.destroy(); return; } wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
function broadcast(room, data, except) { for (const client of rooms.get(room) || []) if (client !== except && client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); }
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost'); const workspaceId = url.searchParams.get('workspace') || 'demo'; const actorId = url.searchParams.get('actor') || 'guest';
  if (!rooms.has(workspaceId)) rooms.set(workspaceId, new Set()); rooms.get(workspaceId).add(ws); ws.workspaceId = workspaceId; ws.actorId = actorId;
  ws.send(JSON.stringify({ type: 'CONNECTED', workspaceId, actorId }));
  ws.on('message', async (raw, isBinary) => {
    try {
      // ws supports binary frames. This protocol accepts JSON text or UTF-8 JSON in a binary frame.
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw); const message = JSON.parse(text);
      if (message.type === 'PING') { ws.send(JSON.stringify({ type: 'PONG', time: Date.now() })); return; }
      if (message.type === 'SYNC') { await seedWorkspace(workspaceId); ws.send(JSON.stringify({ type: 'SYNC_STATE', ...(await getTree(workspaceId)), binaryFrame: isBinary })); return; }
      if (message.type === 'OPERATION') {
        const result = await applyOperation(workspaceId, { ...message.operation, actorId });
        ws.send(JSON.stringify({ type: 'OPERATION_RESULT', clientOpId: message.clientOpId, status: result.type, ...result }));
        if (result.type === 'ACK') broadcast(workspaceId, { type: 'REMOTE_OPERATION', operation: message.operation, result, serverTime: Date.now() }, ws);
      }
    } catch (error) { ws.send(JSON.stringify({ type: 'ERROR', message: error.message })); }
  });
  ws.on('close', () => { rooms.get(workspaceId)?.delete(ws); if (!rooms.get(workspaceId)?.size) rooms.delete(workspaceId); });
});
await mongoose.connect(MONGODB_URI);
await seedWorkspace('demo');
server.listen(PORT, () => console.log(`Workspace API + WebSocket listening on http://localhost:${PORT}`));
