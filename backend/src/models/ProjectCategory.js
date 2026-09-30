const mongoose = require('mongoose');

const projectCategorySchema = new mongoose.Schema({
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true,
    index: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  expectedOutputs: [String],
  requiredProposalFields: [String],
  similarityWeights: {
    title: { type: Number, default: 0.30 },
    abstract: { type: Number, default: 0.35 },
    problemStatement: { type: Number, default: 0.15 },
    objectives: { type: Number, default: 0.10 },
    keywords: { type: Number, default: 0.10 }
  },
  outputLabel: {
    type: String,
    default: 'Expected outputs'
  },
  toolsLabel: {
    type: String,
    default: 'Tools, methods, or technologies'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

projectCategorySchema.index({ facultyId: 1, departmentId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ProjectCategory', projectCategorySchema);
