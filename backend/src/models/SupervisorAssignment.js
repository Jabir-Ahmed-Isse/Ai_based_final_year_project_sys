const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  experimentRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchExperimentRun', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
  recommendedSupervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedSupervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  semanticRank: Number,
  adjustedRank: Number,
  manualOverride: { type: Boolean, default: false },
  capacitySnapshot: mongoose.Schema.Types.Mixed,
  explanation: String
}, { timestamps: true });

module.exports = mongoose.model('SupervisorAssignment', schema);
