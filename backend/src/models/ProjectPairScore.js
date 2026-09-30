const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  experimentRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchExperimentRun', required: true, index: true },
  firstProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  secondProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  firstProjectTitle: String,
  secondProjectTitle: String,
  modelName: { type: String, required: true },
  modelVersion: String,
  datasetVersion: String,
  descriptionVersion: String,
  fieldScores: mongoose.Schema.Types.Mixed,
  weightedOverallScore: Number,
  unweightedCombinedScore: Number,
  riskLevel: String,
  executionTimeMs: Number,
  embeddingDimension: Number,
  embeddingConfiguration: mongoose.Schema.Types.Mixed,
  device: String,
  batchSize: Number
}, { timestamps: true });

schema.index(
  { experimentRunId: 1, modelName: 1, firstProjectId: 1, secondProjectId: 1 },
  { unique: true }
);
module.exports = mongoose.model('ProjectPairScore', schema);
