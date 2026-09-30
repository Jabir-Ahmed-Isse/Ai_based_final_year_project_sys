const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  firstProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  secondProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  datasetName: { type: String, required: true, index: true },
  modelName: { type: String, enum: ['tfidf', 'sentence_bert', 'bge_m3'], required: true, index: true },
  annotatorCount: { type: Number, required: true },
  relationLabel: { type: Number, enum: [0, 1, 2], required: true },
  binaryLabel: { type: Number, enum: [0, 1], required: true },
  humanSimilarityPercentage: { type: Number, min: 0, max: 100 },
  agreementRatio: { type: Number, min: 0, max: 1 },
  labelCounts: {
    different: { type: Number, default: 0 },
    partiallyRelated: { type: Number, default: 0 },
    highlySimilar: { type: Number, default: 0 }
  },
  status: { type: String, enum: ['needs_more_labels', 'consensus', 'adjudication_required'], required: true },
  computedAt: { type: Date, default: Date.now }
}, { timestamps: true });

schema.index({ firstProjectId: 1, secondProjectId: 1, datasetName: 1, modelName: 1 }, { unique: true });
module.exports = mongoose.model('AnnotationConsensus', schema);
