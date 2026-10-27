# Orbit — Conflict-Free Real-Time Workspace

A MERN project prototype implementing a collaborative mind-map workspace, built around the four requirements in the EdiGlobe brief: graph storage and aggregation, offline conflict recovery, React virtualization, and time-travel history. It uses **MongoDB + Express + React + Node.js**, with the `ws` WebSocket library (not Socket.IO).

## Features
- **Graph data model:** each node is a MongoDB document with `nodeId` and `parentId`; indexes support parent-child lookups. `getTree()` uses MongoDB `$graphLookup` to retrieve descendants without issuing a query for every level.
- **Offline conflict recovery:** client operations are queued while offline. If a queued CREATE arrives after its parent was deleted, the server detects the missing/deleted parent and moves the new node to a `Lost & Found` folder instead of dropping the work. Deletion is soft deletion, so records and history remain available.
- **Virtualized React canvas:** only nodes within the visible viewport plus overscan are mounted as HTML elements. No Canvas element is used. The UI shows visible/total counts.
- **Time travel:** each accepted mutation is recorded in `ChangeLog`; the UI exposes a timestamp selector and history list.
- **WebSocket protocol:** `ws` handles live operations. JSON can arrive as a text frame or as UTF-8 JSON in a binary frame; the server marks sync replies received through a binary frame. This is a lightweight binary-compatible protocol, not a custom compressed binary encoding.
- **Optimistic updates:** local state is updated before server acknowledgement, and operations are queued during offline mode.

## Requirements
- Node.js 18+ (20+ recommended)
- MongoDB Community Server running locally, or a MongoDB connection string

## Run locally
1. Start MongoDB.
2. In a terminal at this project root:
   ```bash
   npm install
   npm run install:all
   ```
3. Copy `backend/.env.example` to `backend/.env` and adjust `MONGODB_URI` if needed.
4. Start both apps:
   ```bash
   npm run dev
   ```
5. Open the Vite URL shown in the terminal (usually `http://localhost:5173`). Backend health: `http://localhost:4000/api/health`.

Alternatively run separately with `npm --prefix backend run dev` and `npm --prefix frontend run dev`.

## WebSocket messages
Connect to `ws://localhost:4000/ws?workspace=demo&actor=user-1`.
- Client: `{ "type":"SYNC" }`
- Client: `{ "type":"OPERATION", "clientOpId":"op-1", "operation":{"type":"CREATE|UPDATE|DELETE|RESTORE", "nodeId":"id", "payload":{...}} }`
- Server: `CONNECTED`, `SYNC_STATE`, `OPERATION_RESULT`, `REMOTE_OPERATION`, or `ERROR`.

## API
- `GET /api/health`
- `GET /api/workspaces/:id/tree`
- `GET /api/workspaces/:id/history`
- `GET /api/workspaces/:id/state?at=ISO_TIMESTAMP`

## Demonstration checklist
1. Start the application with MongoDB.
2. Add an idea and rename it (double-click a node or use Rename in Details).
3. Toggle the Wi-Fi icon to simulate offline mode, add an idea, then toggle it back on. The queued operation is sent when reconnected.
4. For the Lost & Found scenario, queue a CREATE whose `payload.parentId` points to a folder that has been deleted on the server; reconnecting triggers server-side recovery into `lost-found`.
5. Use History to inspect the change log and select a timestamp to request a historical view.
6. Search the canvas and note the `visible / total` counter; only viewport-intersecting nodes plus overscan are rendered.

## Important implementation notes / limitations
This is a deadline-focused, demonstrable prototype, not a production multi-tenant service. Add authentication/authorization, schema validation, rate limiting, transactions, and integration tests before production use. Historical replay is an initial implementation: the change log preserves before/after values for accepted operations, but complete, deterministic historical reconstruction for all seeded records and concurrent operations should be strengthened with periodic snapshots and replay tests. The UI's offline toggle simulates offline state in the application; it does not disable the machine's network connection. The virtualized canvas is a viewport demo with absolute-positioned HTML nodes; a production graph editor would also virtualize edges and add spatial indexing.
