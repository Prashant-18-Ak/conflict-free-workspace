import mongoose from 'mongoose';
const changeLogSchema = new mongoose.Schema({
  workspaceId: { type: String, required: true, index: true },
  opId: { type: String, required: true },
  actorId: { type: String, default: 'anonymous' },
  type: { type: String, enum: ['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'CONFLICT_RECOVERY'], required: true },
  nodeId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: false });
changeLogSchema.index({ workspaceId: 1, timestamp: 1 });
changeLogSchema.index({ workspaceId: 1, opId: 1 }, { unique: true });
export default mongoose.model('ChangeLog', changeLogSchema);
