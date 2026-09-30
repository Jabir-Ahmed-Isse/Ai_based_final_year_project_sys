const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  title: { type: String, required: true },
  experimentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchExperiment', required: true, index: true },
  reportType: { type: String, default: 'model-comparison' },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  configuration: mongoose.Schema.Types.Mixed,
  summaryResults: mongoose.Schema.Types.Mixed,
  sections: mongoose.Schema.Types.Mixed,
  exportReferences: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' }
}, { timestamps: true });
module.exports = mongoose.model('GeneratedResearchReport', schema);
