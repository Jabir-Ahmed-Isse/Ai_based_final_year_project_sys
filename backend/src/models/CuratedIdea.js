const mongoose = require('mongoose');

const curatedIdeaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  technologies: [{
    type: String
  }],
  toolsOrMethods: [{
    type: String
  }],
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    index: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    index: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProjectCategory',
    index: true
  },
  researchDomainIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ResearchDomain',
    index: true
  }],
  category: {
    type: String,
    default: 'Other'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for searching
curatedIdeaSchema.index({ title: 'text', description: 'text', category: 'text' });
curatedIdeaSchema.index({ facultyId: 1, departmentId: 1, isActive: 1 });
curatedIdeaSchema.index({ researchDomainIds: 1, isActive: 1 });

module.exports = mongoose.model('CuratedIdea', curatedIdeaSchema);
