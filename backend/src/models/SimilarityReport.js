const mongoose = require('mongoose');

const similarityReportSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  academicContext: {
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory' },
    researchDomainIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ResearchDomain' }]
  },
  overallScore: {
    type: Number,
    default: 0
  },
  displayedScore: {
    type: Number,
    default: 0
  },
  rawCosine: {
    type: Number,
    default: 0
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low'
  },
  similarityLabel: {
    type: String,
    default: 'Low similarity'
  },
  breakdown: {
    semantic: Number,
    title: Number,
    description: Number,
    abstract: Number,
    problemStatement: Number,
    objectives: Number,
    researchObjectives: Number,
    keywords: Number,
    features: Number,
    technologiesAndTools: Number
  },
  recordedProjectCount: Number,
  fieldWeights: mongoose.Schema.Types.Mixed,
  modelResults: mongoose.Schema.Types.Mixed,
  matchedProjects: [{
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    title: String,
    description: String,
    studentName: String,
    technologies: [String],
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory' },
    rawCosine: Number,
    score: Number,
    displayedPercentage: Number,
    similarityLabel: String,
    riskLevel: String,
    matchedSections: [String],
    reason: String,
    modelScores: mongoose.Schema.Types.Mixed,
    fieldScores: mongoose.Schema.Types.Mixed
  }],
  modelVersion: {
    type: String,
    default: 'Xenova/all-MiniLM-L6-v2'
  },
  combinedText: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SimilarityReport', similarityReportSchema);
