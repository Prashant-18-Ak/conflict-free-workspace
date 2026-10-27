# Orbit: Conflict-Free Real-Time Workspace

## 1. Abstract
Orbit is a MERN-based collaborative workspace prototype for mind-map style data. It demonstrates a MongoDB graph representation, real-time communication through the `ws` WebSocket library, optimistic frontend operations, offline operation queuing, recovery of edits whose parent was deleted, viewport virtualization, and a change-log based history view.

## 2. Problem Statement
Collaborative graph editors must preserve relationships and user edits even when multiple users edit concurrently or disconnect. Large graphs also create frontend rendering pressure, while time-travel requires an auditable record of changes.

## 3. Objectives
- Store hierarchical graph nodes efficiently in MongoDB.
- Retrieve descendants using an aggregation pipeline and `$graphLookup`.
- Synchronize operations through WebSockets.
- Recover offline-created children into Lost & Found when their parent no longer exists.
- Render only viewport-visible nodes using HTML elements rather than Canvas.
- Record accepted changes and expose a time-based history view.

## 4. Technology Stack
- Frontend: React 18, Vite, Lucide React, CSS.
- Backend: Node.js, Express, `ws`.
- Database: MongoDB, Mongoose.
- Communication: WebSocket messages using JSON; the server also accepts UTF-8 JSON in binary frames.

## 5. Architecture
The React client maintains an optimistic local graph and sends operations over a WebSocket connection. Express provides tree, history, historical-state and health endpoints. The WebSocket server validates and applies operations through the workspace service, persists node changes in MongoDB, appends a change-log record, acknowledges the originating client, and broadcasts successful changes to other connected clients.

## 6. Data Model
`WorkspaceNode` stores `workspaceId`, `nodeId`, `parentId`, title, kind, coordinates, deletion state, timestamps and version. A compound unique index on `(workspaceId, nodeId)` prevents duplicate IDs within a workspace. An index on `(workspaceId, parentId, deleted)` supports child retrieval. `ChangeLog` stores operation ID, actor, type, timestamp, node ID, before/after state and metadata.

## 7. Conflict Recovery Algorithm
1. A disconnected client queues its CREATE operation locally.
2. On reconnection, it sends the queued operation to the server.
3. The server checks whether the requested parent exists and is not deleted.
4. If the parent is unavailable, the server changes the new node's parent to `lost-found` and creates the Lost & Found folder if necessary.
5. The server persists the node and records a `CONFLICT_RECOVERY` log entry, including the original parent ID.
6. The server acknowledges the result, allowing the UI to show the recovered node.

Deletion is soft deletion: a node is marked deleted rather than physically removed, preserving information for recovery and history.

## 8. Virtualization
The canvas estimates its visible rectangle from scroll offsets and client dimensions. It renders nodes intersecting that rectangle with an additional 160-pixel overscan margin. This limits mounted DOM nodes as the graph grows. The current prototype virtualizes nodes; a production version should also spatially index and virtualize edges.

## 9. History / Time Travel
Each accepted mutation creates a change-log entry containing before/after values. The UI lets the user select a timestamp and requests a reconstructed state from the backend. This implementation is a prototype; robust historical guarantees require deterministic event replay, explicit seed events, periodic snapshots, and tests for concurrent edits.

## 10. Running the Project
1. Install Node.js 18+ and run MongoDB.
2. Copy `backend/.env.example` to `backend/.env` and configure `MONGODB_URI` if necessary.
3. From the project root run `npm install`, then `npm run install:all`.
4. Run `npm run dev` and open the Vite URL (normally `http://localhost:5173`).
5. Check `http://localhost:4000/api/health` for backend status.

## 11. Test / Demo Plan
- Verify health endpoint and initial demo workspace.
- Create, rename and delete a node; inspect the change log.
- Toggle offline simulation, create a node, then reconnect and verify queued sync.
- Send a CREATE with a deleted parent and verify Lost & Found recovery.
- Scroll/search the canvas and observe the visible/total node count.
- Select a timestamp in the history panel and inspect the historical view.
- Connect two browser sessions to the same workspace and verify remote updates are broadcast.

## 12. Limitations and Future Enhancements
This is a deadline-focused prototype. It does not yet include authentication, authorization, transaction-based multi-document operations, full binary serialization, robust conflict resolution for concurrent renames/moves, or automated integration tests. The historical-state reconstruction should be strengthened with snapshotting and deterministic replay. Production readiness would also require schema validation, rate limiting, monitoring, accessibility review, and load testing with 10,000+ nodes.

## 13. Conclusion
Orbit provides a working architecture and implementation baseline for the four core challenges in the project brief: graph persistence, offline conflict recovery, DOM virtualization and change-log history. The included demo and setup instructions support local evaluation and further extension.
