const mongoose = require('mongoose');

const modelResult = new mongoose.Schema({
  model_name: String, model_version: String, field_scores: mongoose.Schema.Types.Mixed,
  overall_score: Number, risk_level: String, processing_time_ms: Number,
  model_loading_time_ms: Number, fallback_used: Boolean, device: String
}, { _id: false });

const schema = new mongoose.Schema({
  firstProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  secondProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  models: {
    tfidf: modelResult,
    bert_cross_encoder: modelResult,
    sentence_bert: modelResult
  },
  missingFields: mongoose.Schema.Types.Mixed,
  fieldWeights: mongoose.Schema.Types.Mixed,
  riskThresholds: mongoose.Schema.Types.Mixed,
  agreementThresholds: mongoose.Schema.Types.Mixed,
  agreement: mongoose.Schema.Types.Mixed,
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ firstProjectId: 1, secondProjectId: 1, createdAt: -1 });
module.exports = mongoose.model('ProjectModelComparison', schema);
