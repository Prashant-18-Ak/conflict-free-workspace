import mongoose from 'mongoose';

const nodeSchema = new mongoose.Schema({
  workspaceId: { type: String, required: true, index: true },
  nodeId: { type: String, required: true },
  parentId: { type: String, default: null, index: true },
  title: { type: String, default: 'Untitled node' },
  kind: { type: String, enum: ['folder', 'file', 'note'], default: 'note' },
  x: { type: Number, default: 80 },
  y: { type: Number, default: 80 },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
  version: { type: Number, default: 1 }
}, { timestamps: true });

nodeSchema.index({ workspaceId: 1, nodeId: 1 }, { unique: true });
nodeSchema.index({ workspaceId: 1, parentId: 1, deleted: 1 });
export default mongoose.model('WorkspaceNode', nodeSchema);
