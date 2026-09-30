const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'default' },
  fieldWeights: {
    title: { type: Number, default: 0.20 },
    description: { type: Number, default: 0.20 },
    problem_statement: { type: Number, default: 0.20 },
    research_objectives: { type: Number, default: 0.15 },
    features: { type: Number, default: 0.15 },
    technologies_tools: { type: Number, default: 0.10 }
  },
  riskThresholds: { medium: { type: Number, default: 40 }, high: { type: Number, default: 70 } },
  agreementThresholds: { strong: { type: Number, default: 5 }, moderate: { type: Number, default: 15 } },
  classificationThresholds: {
    tfidf: { type: Number, default: 70 },
    sentence_bert: { type: Number, default: 70 },
    bge_m3: { type: Number, default: 70 }
  },
  significanceLevel: { type: Number, default: 0.05 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ResearchConfiguration', schema);
