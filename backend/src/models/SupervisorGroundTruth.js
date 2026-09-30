const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  relevanceGrade: { type: Number, enum: [0, 1, 2, 3], required: true },
  annotatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  annotationReason: { type: String, default: '' },
  annotationSource: { type: String, enum: ['human_reviewed', 'model_suggestion', 'bulk_accepted_suggestion'], default: 'human_reviewed' },
  suggestionBasis: { type: String, default: '' },
  datasetName: { type: String, required: true, index: true },
  modelName: { type: String, enum: ['tfidf', 'sentence_bert', 'bge_m3'], required: true, index: true },
  consensusRelevanceGrade: { type: Number, enum: [0, 1, 2, 3] },
  annotationStatus: { type: String, enum: ['draft', 'submitted'], default: 'submitted' }
}, { timestamps: true });

schema.index({ projectId: 1, supervisorId: 1, annotatorId: 1, datasetName: 1, modelName: 1 }, { unique: true });
module.exports = mongoose.model('SupervisorGroundTruth', schema);
