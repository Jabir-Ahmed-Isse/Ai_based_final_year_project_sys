const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['project_similarity', 'supervisor_matching'], required: true },
  datasetTag: { type: String, default: 'RESEARCH_EXPERIMENT' },
  datasetVersion: String,
  descriptionVersion: String,
  randomSeed: { type: Number, default: 42 },
  models: [String],
  configuration: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued', index: true },
  progress: {
    completed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 }
  },
  resultCounts: mongoose.Schema.Types.Mixed,
  hardware: mongoose.Schema.Types.Mixed,
  errorMessages: [String],
  startedAt: Date,
  completedAt: Date,
  durationMs: Number
}, { timestamps: true });

module.exports = mongoose.model('ResearchExperimentRun', schema);
