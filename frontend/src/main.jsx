import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownLeft, ArrowUpRight, Clock3, Cloud, Command, FilePlus2, Folder, GitBranch, History, Layers3, Network, Plus, Radio, Search, Settings2, Share2, ShieldCheck, Trash2, Wifi, WifiOff, Zap } from 'lucide-react';
import './style.css';

const API = 'http://localhost:4000';
const WORKSPACE = 'demo';
const initialNodes = [
  { nodeId: 'root', parentId: null, title: 'Product workspace', kind: 'folder', x: 440, y: 64, version: 1 },
  { nodeId: 'roadmap', parentId: 'root', title: 'Roadmap', kind: 'folder', x: 150, y: 220, version: 1 },
  { nodeId: 'research', parentId: 'root', title: 'Research', kind: 'folder', x: 440, y: 220, version: 1 },
  { nodeId: 'launch', parentId: 'root', title: 'Launch plan', kind: 'folder', x: 730, y: 220, version: 1 },
  { nodeId: 'interviews', parentId: 'research', title: 'User interviews', kind: 'note', x: 355, y: 390, version: 1 },
  { nodeId: 'milestones', parentId: 'roadmap', title: 'Milestones', kind: 'note', x: 65, y: 390, version: 1 },
  { nodeId: 'campaign', parentId: 'launch', title: 'Campaign brief', kind: 'note', x: 730, y: 390, version: 1 }
];
const palette = { folder: '#8c7cff', file: '#53c8b4', note: '#f0b86a' };

function App() {
  const [nodes, setNodes] = useState(initialNodes);
const [testMode, setTestMode] = useState(false); const [connected, setConnected] = useState(false); const [history, setHistory] = useState([]); const [selected, setSelected] = useState('research'); const [query, setQuery] = useState(''); const [showHistory, setShowHistory] = useState(false); const [historyAt, setHistoryAt] = useState(''); const [historyNodes, setHistoryNodes] = useState(null); const [offline, setOffline] = useState(false); const [pending, setPending] = useState([]); const [notice, setNotice] = useState('Workspace synced'); const [viewMode, setViewMode] = useState('mindmap'); const [showActivity, setShowActivity] = useState(false); const [showShare, setShowShare] = useState(false); const [showProfile, setShowProfile] = useState(false); const searchInput = useRef(null);
  const ws = useRef(null); const seq = useRef(0); const queue = useRef([]); const viewport = useRef(null); const drag = useRef(null);
  const liveNodes = historyNodes || nodes;

const testNodes = useMemo(() => {
  if (!testMode) return liveNodes;

  const generated = Array.from({ length: 10000 }, (_, i) => ({
    nodeId: `perf-test-${i}`,
    parentId: i === 0 ? 'root' : null,
    title: `Performance Test ${i + 1}`,
    kind: i % 3 === 0 ? 'folder' : 'note',
    x: (i % 100) * 220,
    y: Math.floor(i / 100) * 120,
    version: 1
  }));

  return [...liveNodes, ...generated];
}, [testMode, liveNodes]);
  const filtered = useMemo(
  () =>
    testNodes.filter(
      n => !n.deleted && n.title.toLowerCase().includes(query.toLowerCase())
    ),
  [testNodes, query]
);
  const selectedNode = liveNodes.find(n => n.nodeId === selected && !n.deleted) || liveNodes.find(n => !n.deleted);
  const send = (operation) => {
    const clientOpId = `op-${Date.now()}-${++seq.current}`;
    const item = { clientOpId, operation };
    // Optimistic update: update local state before server acknowledgement, then rollback on rejection.
    if (operation.type === 'CREATE') setNodes(prev => [...prev.filter(n => n.nodeId !== operation.nodeId), { nodeId: operation.nodeId, parentId: operation.payload.parentId, title: operation.payload.title, kind: operation.payload.kind, x: operation.payload.x, y: operation.payload.y, version: 1 }]);
    if (operation.type === 'UPDATE') setNodes(prev => prev.map(n => n.nodeId === operation.nodeId ? { ...n, ...operation.payload, version: (n.version || 1) + 1 } : n));
    if (operation.type === 'DELETE') setNodes(prev => prev.map(n => n.nodeId === operation.nodeId ? { ...n, deleted: true } : n));
    setPending(p => [...p, clientOpId]);
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || offline) { queue.current.push(item); setNotice('Saved locally · waiting to sync'); return; }
    ws.current.send(JSON.stringify({ type: 'OPERATION', clientOpId, operation }));
  };
  const connect = useCallback(() => {
    if (ws.current && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.current.readyState)) return;
    const socket = new WebSocket(`ws://localhost:4000/ws?workspace=${WORKSPACE}&actor=prashant-${Math.random().toString(36).slice(2, 6)}`); ws.current = socket;
    socket.onopen = () => { setConnected(true); setNotice('Connected · live sync enabled'); socket.send(JSON.stringify({ type: 'SYNC' })); };
    socket.onclose = () => { setConnected(false); setNotice('Disconnected · edits are queued locally'); };
    socket.onerror = () => { setConnected(false); setNotice('Backend unavailable · local demo mode'); };
    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'SYNC_STATE') { if (msg.nodes?.length) setNodes(msg.nodes); }
      if (msg.type === 'OPERATION_RESULT') {
        setPending(p => p.filter(id => id !== msg.clientOpId));
        if (msg.status === 'ACK' && msg.node) {
          setNodes(prev => [
            ...prev.filter(n => n.nodeId !== msg.node.nodeId),
            msg.node
          ]);

          if (msg.recovered) {
            setNotice('Conflict resolved · item moved to Lost & Found');
          }
        }

        if (msg.status === 'REJECT' || msg.reason) {
          setNotice(`Operation rejected: ${msg.reason || 'Unknown reason'}`);
        }
      }
      if (msg.type === 'REMOTE_OPERATION' && msg.result?.node) { setNodes(prev => [...prev.filter(n => n.nodeId !== msg.result.node.nodeId), msg.result.node]); setNotice('Remote edit received'); }
      if (msg.type === 'ERROR') setNotice(msg.message);
    };
  }, []);
  useEffect(() => { connect(); fetch(`${API}/api/workspaces/${WORKSPACE}/tree`).then(r => r.json()).then(d => { if (d.nodes?.length) setNodes(d.nodes) }).catch(() => { }); fetch(`${API}/api/workspaces/${WORKSPACE}/history`).then(r => r.json()).then(setHistory).catch(() => { }); return () => ws.current?.close(); }, [connect]);
  useEffect(() => { if (connected && !offline && queue.current.length) { const q = [...queue.current]; queue.current = []; q.forEach(i => ws.current?.send(JSON.stringify({ type: 'OPERATION', ...i }))); setNotice(`Synced ${q.length} queued operation(s)`); } }, [connected, offline]);
  const addNode = (kind = 'note', title = 'New idea') => {
    const id = `node-${Date.now().toString(36)}`;
    const parent = selectedNode?.nodeId || 'root';

    send({
      type: 'CREATE',
      nodeId: id,
      payload: {
        parentId: parent,
        title,
        kind,
        x: 100 + Math.round(Math.random() * 500),
        y: 490
      }
    });

    setSelected(id);
    setHistoryNodes(null);
  };
  const rename = () => { if (!selectedNode) return; const title = prompt('Rename node', selectedNode.title); if (title?.trim()) { send({ type: 'UPDATE', nodeId: selectedNode.nodeId, payload: { title: title.trim() } }); setHistoryNodes(null); } };
  const remove = () => { if (!selectedNode || selectedNode.nodeId === 'root') return; send({ type: 'DELETE', nodeId: selectedNode.nodeId, payload: {} }); setHistoryNodes(null); setSelected('root'); };
  const loadHistory = async (value) => { setHistoryAt(value); if (!value) { setHistoryNodes(null); return; } try { const r = await fetch(`${API}/api/workspaces/${WORKSPACE}/state?at=${encodeURIComponent(value)}`); const d = await r.json(); if (d.nodes) setHistoryNodes(d.nodes); } catch { setHistoryNodes(nodes); } };
  const onPointerDown = (e, n) => { if (historyNodes) return; drag.current = { id: n.nodeId, startX: e.clientX, startY: e.clientY, x: n.x, y: n.y, moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); setSelected(n.nodeId); };
  const onPointerMove = e => { if (!drag.current) return; const d = drag.current; const dx = e.clientX - d.startX, dy = e.clientY - d.startY; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true; setNodes(prev => prev.map(n => n.nodeId === d.id ? { ...n, x: d.x + dx, y: d.y + dy } : n)); };
  const onPointerUp = () => { if (drag.current?.moved) { const n = nodes.find(x => x.nodeId === drag.current.id); if (n) send({ type: 'UPDATE', nodeId: n.nodeId, payload: { x: n.x, y: n.y } }); } drag.current = null; };
  // Virtualization: only nodes intersecting the visible viewport plus a 160px overscan are mounted.
  // Virtualization: render only nodes inside the visible viewport
  // plus a 160px overscan area.
  const [viewportSize, setViewportSize] = useState(0);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;

    const updateViewport = () => {
      setViewportSize(el.scrollTop + el.scrollLeft);
    };

    el.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);

    return () => {
      el.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const visible = useMemo(() => {
    const el = viewport.current;
    if (!el) return filtered;

    const left = el.scrollLeft - 160;
    const top = el.scrollTop - 160;
    const right = el.scrollLeft + el.clientWidth + 160;
    const bottom = el.scrollTop + el.clientHeight + 160;

    return filtered.filter(
      n =>
        n.x + 180 > left &&
        n.x < right &&
        n.y + 90 > top &&
        n.y < bottom
    );
  }, [filtered, viewportSize]);

  const positions = new Map(liveNodes.map(n => [n.nodeId, n]));

  const edges = filtered
    .filter(
      n =>
        n.parentId &&
        positions.has(n.parentId) &&
        !positions.get(n.parentId).deleted
    )
    .map(n => ({
      from: positions.get(n.parentId),
      to: n
    }));
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-icon"><Network size={20} /></div><div><b>orbit</b><span>WORKSPACE OS</span></div></div><div className="workspace-switch"><div className="workspace-avatar">P</div><div><strong>Product Studio</strong><small>Free workspace</small></div><span className="dots">•••</span></div>
      <div className="nav-label">WORKSPACE</div><button className="nav-item active"><Layers3 size={17} /> Canvas <span className="nav-count">1</span></button><button className="nav-item" onClick={() => setShowHistory(!showHistory)}><History size={17} /> Version history</button><button className={`nav-item ${showActivity ? 'active' : ''}`} onClick={() => { setShowActivity(v => !v); setShowHistory(false); }}><Activity size={17} /> Activity</button><div className="nav-label space-top">YOUR BOARDS <button onClick={addNode}><Plus size={14} /></button></div><div className="board-link"><span className="board-dot purple" />Product workspace</div><div className="board-link"><span className="board-dot green" />Research map</div><div className="board-link"><span className="board-dot orange" />Launch planning</div>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-spark"><Zap size={16} /></div><b>Make room for big ideas</b><p>Your team is building something great.</p><button onClick={() => setNotice('You are on the demo plan')}>Explore workspace <ArrowUpRight size={13} /></button></div><button className="profile" onClick={() => setShowProfile(v => !v)} style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer' }}><div className="profile-avatar">PK</div><div><strong>Prashant Kumar</strong><small>Workspace owner</small></div><Settings2 size={16} /></button></div>
    </aside>
    <main className="main"><header className="topbar"><div className="breadcrumb">Product Studio <span>/</span> <b>Product workspace</b> <span className="live-dot" /></div><div className="top-actions"><div className={`connection ${connected && !offline ? 'online' : ''}`}><span /> {offline ? 'Offline mode' : connected ? 'Live sync' : 'Local mode'}</div><button className="icon-btn" title="Search" onClick={() => searchInput.current?.focus()}><Search size={17} /></button><button className="share-btn" onClick={() => setShowShare(true)}><Share2 size={15} /> Share</button><button className="profile-avatar small" title="Profile" onClick={() => setShowProfile(v => !v)}>PK</button></div></header>
      <section className="page-head"><div><div className="eyebrow"><span className="eyebrow-line" /> TEAM CANVAS</div><h1>Product workspace <span className="edit-icon">✎</span></h1><p className="subtitle">A shared space for ideas to take shape.</p><div className="meta-row"><span><GitBranch size={14} /> {nodes.filter(n => !n.deleted).length} nodes</span><span><Clock3 size={14} /> Updated just now</span><span className="avatars"><i>PK</i><i>JD</i><i>AM</i><em>+2</em></span><span className="muted">5 collaborators</span></div></div><div className="head-actions">
        <button
          className="secondary-btn"
          onClick={() => {
            setShowHistory(!showHistory);
            setHistoryNodes(null);
          }}
        >
          <History size={15} /> History
        </button>

        <div className="add-menu">
          <button
            className="primary-btn"
            onClick={() => {
              const choice = prompt(
                'Create what?\n1. Idea\n2. File\n3. Folder'
              );

              if (choice === '1') addNode('note', 'New idea');
              else if (choice === '2') addNode('file', 'New file');
              else if (choice === '3') addNode('folder', 'New folder');
            }}
          >
            <Plus size={16} /> Add new
          </button>
        </div>
      </div></section>
      <section className="toolbar"><div className="tool-tabs"><button className={`tool-tab ${viewMode === 'mindmap' ? 'active' : ''}`} onClick={() => setViewMode('mindmap')}><Network size={15} /> Mind map</button><button className={`tool-tab ${viewMode === 'board' ? 'active' : ''}`} onClick={() => setViewMode('board')}><Layers3 size={15} /> Board</button><button className={`tool-tab ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>☷ List</button></div><div className="toolbar-right"><label className="search-box"><Search size={15} /><input ref={searchInput} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find anything..." /></label><button className="tiny-btn" onClick={() => setOffline(!offline)} title="Toggle offline simulation">{offline ? <WifiOff size={16} /> : <Wifi size={16} />}</button><button
  className="tiny-btn"
  onClick={() => {
    setTestMode(value => !value);
    setQuery('');
    setHistoryNodes(null);
    setNotice(
      testMode
        ? 'Performance test disabled'
        : 'Performance test enabled · 10,000 temporary nodes'
    );
  }}
  title="Toggle 10,000-node performance test"
>
  <Command size={16} />
</button></div></section>
      {showHistory && <div className="history-panel"><div className="history-top"><div><b><History size={16} /> Time travel</b><p>Preview the workspace at an earlier point in time.</p></div><button className="close-history" onClick={() => { setShowHistory(false); setHistoryNodes(null); setHistoryAt('') }}>×</button></div><div className="history-controls"><input aria-label="History timestamp" type="datetime-local" value={historyAt} onChange={e => loadHistory(e.target.value)} /><span>{history.length} recorded changes</span><button onClick={() => { setHistoryAt(''); setHistoryNodes(null) }}>Return to present</button></div>{history.slice(-4).reverse().map(h => <div className="history-entry" key={h._id}><span className="history-dot" /><div><b>{h.type.replace('_', ' ')}</b><small>{h.after?.title || h.nodeId} · {new Date(h.timestamp).toLocaleString()}</small></div></div>)}</div>}
      {showActivity && <div className="history-panel"><div className="history-top"><div><b><Activity size={16} /> Recent activity</b><p>Recent changes recorded for this workspace.</p></div><button className="close-history" onClick={() => setShowActivity(false)}>×</button></div>{history.length ? history.slice(-12).reverse().map((h, i) => <div className="history-entry" key={h._id || `${h.nodeId}-${h.timestamp}-${i}`}><span className="history-dot" /><div><b>{String(h.type || 'CHANGE').replaceAll('_', ' ')}</b><small>{h.after?.title || h.nodeId || 'Workspace'} · {h.timestamp ? new Date(h.timestamp).toLocaleString() : 'Recent'}</small></div></div>) : <p>No recorded activity yet. Create or edit a workspace item to see activity here.</p>}</div>}
      <section className="canvas-layout"><div className="canvas" ref={viewport} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}><div className="canvas-grid" /><div className="canvas-label"><span className="label-mark" /> PRODUCT STRATEGY <span className="label-separator">/</span> MIND MAP</div>{viewMode === 'board' ? <div className="canvas-content" style={{ width: '100%', minWidth: 760, minHeight: 760, padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 18, alignContent: 'start' }}>{['Folders', 'Ideas', 'Files'].map((group, idx) => { const kinds = ['folder', 'note', 'file']; const items = filtered.filter(n => n.kind === kinds[idx]); return <section key={group} style={{ background: '#f6f5fb', border: '1px solid #e8e5f4', borderRadius: 12, padding: 14, minHeight: 200 }}><h3 style={{ margin: '0 0 14px', fontSize: 14 }}>{group} <span style={{ color: '#888', fontWeight: 400 }}>({items.length})</span></h3>{items.map(n => <button key={n.nodeId} onClick={() => setSelected(n.nodeId)} style={{ display: 'block', textAlign: 'left', width: '100%', marginBottom: 10, padding: 12, background: selected === n.nodeId ? '#eeeaff' : '#fff', border: '1px solid #e6e3ee', borderRadius: 9, cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 13 }}>{n.title}</strong><small style={{ color: '#888' }}>{n.kind} · v{n.version || 1}</small></button>)}</section> })}</div> : viewMode === 'list' ? <div className="canvas-content" style={{ width: '100%', minWidth: 760, minHeight: 760, padding: 24, background: '#fff' }}><h3 style={{ marginTop: 0 }}>Workspace items</h3><div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 1fr 1fr 1fr', gap: 12, padding: '12px 10px', borderBottom: '1px solid #eee', color: '#777', fontSize: 11, fontWeight: 700 }}><span>NAME</span><span>TYPE</span><span>PARENT</span><span>VERSION</span></div>{filtered.map(n => <button key={n.nodeId} onClick={() => setSelected(n.nodeId)} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 1fr 1fr 1fr', gap: 12, width: '100%', textAlign: 'left', padding: '14px 10px', background: selected === n.nodeId ? '#f3f0ff' : '#fff', border: 0, borderBottom: '1px solid #f0eef5', cursor: 'pointer', color: '#29283a' }}><strong>{n.title}</strong><span>{n.kind}</span><span>{n.parentId || 'Workspace root'}</span><span>v{n.version || 1}</span></button>)}{filtered.length === 0 && <p>No items match “{query}”.</p>}</div> : <div className="canvas-content" style={{ width: 1100, height: 760 }}>
        <svg className="edges" width="1100" height="760" aria-hidden="true">{edges.map(e => <g key={`${e.from.nodeId}-${e.to.nodeId}`}><path d={`M ${e.from.x + 88} ${e.from.y + 44} C ${e.from.x + 88} ${(e.from.y + e.to.y) / 2 + 20}, ${e.to.x + 88} ${(e.from.y + e.to.y) / 2 - 20}, ${e.to.x + 88} ${e.to.y + 8}`} fill="none" stroke={selected === e.to.nodeId ? '#8c7cff' : '#d8d9e3'} strokeWidth={selected === e.to.nodeId ? 2 : 1.5} /></g>)}</svg>
        {visible.filter(n => !n.deleted).map(n => <div key={n.nodeId} className={`mind-node ${selected === n.nodeId ? 'selected' : ''} ${n.kind}`} style={{ left: n.x, top: n.y, '--node-color': palette[n.kind] || palette.note }} onPointerDown={e => onPointerDown(e, n)} onDoubleClick={() => { setSelected(n.nodeId); rename() }}><div className="node-top"><span className="node-kind-icon">{n.kind === 'folder' ? <Folder size={15} /> : <FilePlus2 size={15} />}</span><span className="node-type">{n.kind === 'folder' ? 'FOLDER' : 'IDEA'}</span><span className="node-menu">···</span></div><strong>{n.title}</strong><div className="node-bottom"><span className="node-status"><i /> In progress</span><span className="node-owner">{n.nodeId === 'root' ? 'PK' : n.nodeId.slice(0, 2).toUpperCase()}</span></div></div>)}
        {visible.length === 0 && <div className="empty-search">No nodes match “{query}”</div>}
      </div>}<div className="canvas-tools"><button title="Zoom out" onClick={() => { if (viewport.current) viewport.current.style.zoom = '0.9' }}>−</button><span>100%</span><button title="Zoom in" onClick={() => { if (viewport.current) viewport.current.style.zoom = '1.1' }}>+</button><i /><button title="Fit view" onClick={() => { if (viewport.current) { viewport.current.style.zoom = '1'; viewport.current.scrollTo({ top: 0, left: 0, behavior: 'smooth' }) } }}>⛶</button></div><div className="minimap"><div className="mini-title">MINIMAP <span>⌃</span></div><div className="mini-map-inner">{filtered.map(n => <i key={n.nodeId} style={{ left: `${n.x / 11}%`, top: `${n.y / 8}%`, background: palette[n.kind] }} />)}<div className="mini-view" /></div></div><div className="canvas-footer"><span><span className="keycap">⌘</span> + drag to pan</span><span><span className="keycap">Double click</span> to edit</span><span className="zoom-footer">{visible.length} visible / {filtered.length} total</span></div></div>
        <aside className="inspector"><div className="inspector-head"><span>DETAILS</span><button onClick={() => setSelected('root')}>↗</button></div>{selectedNode ? <><div className="detail-icon" style={{ '--node-color': palette[selectedNode.kind] }}>{selectedNode.kind === 'folder' ? <Folder size={23} /> : <FilePlus2 size={23} />}</div><div className="detail-type">{selectedNode.kind.toUpperCase()}</div><h2>{selectedNode.title}</h2><p className="detail-description">A workspace item shared with your team. Changes sync in real time when connected.</p><div className="detail-field"><label>NAME</label><div className="field-value">{selectedNode.title}<button onClick={rename}>✎</button></div></div><div className="detail-field"><label>TYPE</label><div className="field-value">{selectedNode.kind}<span className="field-badge">Editable</span></div></div><div className="detail-field"><label>PARENT</label><div className="field-value">{selectedNode.parentId || 'Workspace root'}</div></div><div className="detail-field"><label>VERSION</label><div className="field-value">v{selectedNode.version || 1}<span className="field-badge">Latest</span></div></div><div className="detail-actions"><button className="secondary-btn" onClick={rename}>Rename</button><button className="delete-btn" onClick={remove} disabled={selectedNode.nodeId === 'root'}><Trash2 size={14} /></button></div></> : <p>Select a node to inspect details.</p>}<div className="sync-card"><div className="sync-icon"><ShieldCheck size={17} /></div><div><b>Conflict protection</b><p>Offline edits are queued and recovered if their parent was deleted.</p></div></div></aside>
      </section>
      {showShare && <div onClick={() => setShowShare(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(28,24,48,.25)', display: 'grid', placeItems: 'center', padding: 20 }}><div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share workspace" style={{ width: 'min(440px, 100%)', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(30,20,60,.2)' }}><h2 style={{ marginTop: 0 }}>Share workspace</h2><p style={{ color: '#777', fontSize: 14 }}>Share this workspace URL with someone using the same running application.</p><input readOnly value={location.href} style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1px solid #e4e1ee', borderRadius: 8 }} /><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button className="secondary-btn" onClick={() => setShowShare(false)}>Close</button><button className="primary-btn" onClick={async () => { try { await navigator.clipboard.writeText(location.href); setNotice('Workspace link copied'); } catch { setNotice('Select and copy the workspace link'); } }}>Copy link</button></div><small style={{ display: 'block', marginTop: 12, color: '#999' }}>Note: this copies the local app address; it does not publish the workspace to the internet.</small></div></div>}
      {showProfile && <div style={{ position: 'fixed', zIndex: 60, top: 64, right: 24, width: 230, padding: 16, background: '#fff', border: '1px solid #ece9f4', borderRadius: 12, boxShadow: '0 12px 35px rgba(30,20,60,.14)' }}><div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}><div className="profile-avatar">PK</div><div><strong>Prashant Kumar</strong><small style={{ display: 'block', color: '#888', marginTop: 3 }}>Workspace owner</small></div></div><button onClick={() => { setShowProfile(false); setNotice('Signed in as Prashant Kumar · demo profile'); }} style={{ width: '100%', padding: 10, textAlign: 'left', border: '1px solid #eeeaf5', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>Profile details</button><button onClick={() => { setShowProfile(false); setNotice('Settings are not configured in this demo'); }} style={{ width: '100%', padding: 10, marginTop: 8, textAlign: 'left', border: '1px solid #eeeaf5', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>Settings</button><button onClick={() => setShowProfile(false)} style={{ width: '100%', padding: 10, marginTop: 8, border: 0, borderRadius: 8, background: '#f6f4fb', cursor: 'pointer' }}>Close</button></div>}
      <footer className="statusbar"><div><span className={`status-pip ${connected && !offline ? 'green-pip' : ''}`} />{notice}</div><div><span><Cloud size={13} /> Autosave {connected && !offline ? 'on' : 'paused'}</span><span>·</span><span>All changes tracked</span><span>·</span><span>Orbit v1.0</span></div></footer>
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App />);
