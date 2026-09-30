const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  experimentRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchExperimentRun', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  modelName: { type: String, required: true },
  modelVersion: String,
  datasetVersion: String,
  descriptionVersion: String,
  semanticExpertiseScore: Number,
  technologyScore: Number,
  skillsScore: Number,
  previousProjectScore: Number,
  publicationKeywordScore: Number,
  workloadAvailabilityScore: Number,
  pureSemanticScore: Number,
  finalAdjustedScore: Number,
  semanticRank: Number,
  adjustedRank: Number,
  eligible: Boolean,
  matchedKeywords: [String],
  matchedTechnologies: [String],
  explanation: String,
  executionTimeMs: Number
}, { timestamps: true });

schema.index(
  { experimentRunId: 1, modelName: 1, projectId: 1, supervisorId: 1 },
  { unique: true }
);
module.exports = mongoose.model('SupervisorMatchScore', schema);
