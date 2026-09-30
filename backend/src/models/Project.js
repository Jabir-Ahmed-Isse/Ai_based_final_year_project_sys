const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  abstract: {
    type: String,
    required: true
  },
  features: [{
    type: String,
    required: true
  }],
  problemStatement: {
    type: String,
    default: ''
  },
  objectives: [String],
  expectedOutputs: [String],
  toolsOrMethods: [String],
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'changes_requested', 'in_progress', 'completed'],
    default: 'draft'
  },
  similarityScore: {
    type: Number,
    default: 0
  },
  similarityRisk: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low'
  },
  similarityLabel: {
    type: String,
    default: 'Low similarity'
  },
  similarityReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimilarityReport'
  },
  similarityReport: {
    overallScore: Number,
    displayedScore: Number,
    rawCosine: Number,
    riskLevel: String,
    similarityLabel: String,
    modelVersion: String,
    combinedText: String,
    recordedProjectCount: Number,
    fieldWeights: mongoose.Schema.Types.Mixed,
    modelResults: mongoose.Schema.Types.Mixed,
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
    similarProjects: [{
      projectId: mongoose.Schema.Types.ObjectId,
      title: String,
      description: String,
      studentName: String,
      technologies: [String],
      rawCosine: Number,
      similarity: Number,
      score: Number,
      displayedPercentage: Number,
      similarityLabel: String,
      riskLevel: String,
      matchedSections: [String],
      reason: String,
      modelScores: mongoose.Schema.Types.Mixed,
      fieldScores: mongoose.Schema.Types.Mixed
    }]
  },
  semanticEmbedding: {
    model: String,
    textHash: { type: String, index: true },
    combinedText: String,
    vector: [Number],
    dimensions: Number,
    generatedAt: Date
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
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
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
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
  department: {
    type: String,
    default: ''
  },
  keywords: [String],
  technologies: [String],
  isTestData: { type: Boolean, default: false, index: true },
  testDataTag: { type: String, default: '', index: true },
  syntheticContent: { type: Boolean, default: false },
  importRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchImportRun', index: true },
  sourceFile: String,
  sourceWorksheet: String,
  sourceRow: Number,
  datasetVersion: String,
  descriptionVersion: String,
  normalizedTitle: { type: String, index: true },
  contentHash: { type: String, index: true },
  archivedStudentName: String,
  archivedYear: Number,
  submissionDate: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  feedback: [{
    from: {
      type: String,
      enum: ['supervisor', 'admin', 'system']
    },
    message: String,
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
projectSchema.index({ title: 'text', abstract: 'text', 'features': 'text' });
projectSchema.index({ student: 1, status: 1 });
projectSchema.index({ supervisor: 1, status: 1 });
projectSchema.index({ department: 1, status: 1 });
projectSchema.index({ facultyId: 1, departmentId: 1, status: 1 });
projectSchema.index({ categoryId: 1, status: 1 });
projectSchema.index({ researchDomainIds: 1, status: 1 });

module.exports = mongoose.model('Project', projectSchema);
