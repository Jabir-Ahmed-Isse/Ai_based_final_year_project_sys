const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  firstProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  secondProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  relationLabel: { type: Number, enum: [0, 1, 2], required: true },
  binaryLabel: { type: Number, enum: [0, 1] },
  humanSimilarityPercentage: { type: Number, min: 0, max: 100 },
  modelName: { type: String, enum: ['tfidf', 'sentence_bert', 'bge_m3'], required: true, index: true },
  evaluatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  evaluatorRole: String,
  notes: { type: String, default: '' },
  datasetName: { type: String, required: true, index: true },
  experimentName: { type: String, default: '' },
  annotationStatus: { type: String, enum: ['draft', 'submitted'], default: 'submitted' },
  evaluationDate: { type: Date, default: Date.now }
}, { timestamps: true });

schema.pre('validate', function() {
  if (this.binaryLabel == null && this.relationLabel != null) {
    this.binaryLabel = this.relationLabel > 0 ? 1 : 0;
  }
  if (String(this.firstProjectId) > String(this.secondProjectId)) {
    [this.firstProjectId, this.secondProjectId] = [this.secondProjectId, this.firstProjectId];
  }
});

schema.index({ firstProjectId: 1, secondProjectId: 1, evaluatorId: 1, datasetName: 1, modelName: 1 }, { unique: true });
module.exports = mongoose.model('HumanEvaluation', schema);
