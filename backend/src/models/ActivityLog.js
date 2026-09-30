const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  userRole: String,
  actionType: { type: String, required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  modelName: String,
  modelVersion: String,
  experimentRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchExperimentRun', index: true },
  importRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchImportRun', index: true },
  ipAddress: String,
  status: { type: String, enum: ['success', 'failure', 'warning'], default: 'success' },
  errorMessage: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

schema.index({ actionType: 1, createdAt: -1 });
module.exports = mongoose.model('ActivityLog', schema);
