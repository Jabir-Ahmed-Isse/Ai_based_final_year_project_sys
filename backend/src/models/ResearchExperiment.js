const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  datasetName: { type: String, required: true, index: true },
  configuration: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['draft', 'running', 'completed', 'failed'], default: 'draft' },
  results: mongoose.Schema.Types.Mixed,
  statisticalTests: [mongoose.Schema.Types.Mixed],
  startedAt: Date, completedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('ResearchExperiment', schema);
