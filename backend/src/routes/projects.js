const express = require('express');
const { check, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const Project = require('../models/Project');
const User = require('../models/User');
const Department = require('../models/Department');
const SimilarityReport = require('../models/SimilarityReport');
const { ensureProjectEmbedding } = require('../services/similarityService');

const router = express.Router();
const PROJECT_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'changes_requested', 'in_progress', 'completed'];
const RESEARCH_DATASET_TAG = 'RESEARCH_EXPERIMENT';
const researchAiBase = process.env.PYTHON_AI_URL || process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001/api/ai';
const RESEARCH_FIELD_WEIGHTS = {
  title: 0.20,
  description: 0.20,
  problem_statement: 0.20,
  research_objectives: 0.15,
  features: 0.15,
  technologies_tools: 0.10
};
const RESEARCH_MODELS = ['tfidf', 'sentence_bert', 'bge_m3'];

const average = values => values.length
  ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
  : 0;
const riskFromScore = score => score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low';

async function calculateRecordedProposalSimilarity(proposal) {
  const recordedProjects = await Project.find({ testDataTag: RESEARCH_DATASET_TAG })
    .sort({ sourceRow: 1 })
    .select([
      'title', 'abstract', 'problemStatement', 'objectives', 'features',
      'expectedOutputs', 'toolsOrMethods', 'technologies', 'sourceRow',
      'facultyId', 'departmentId', 'categoryId', 'student', 'archivedStudentName'
    ].join(' '))
    .populate('student', 'name')
    .lean();

  if (!recordedProjects.length) {
    const error = new Error('The recorded research project dataset is empty');
    error.status = 404;
    throw error;
  }

  const response = await fetch(
    `${researchAiBase.replace(/\/$/, '')}/research/proposal-similarity`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal,
        recordedProjects,
        configuration: {
          models: RESEARCH_MODELS,
          field_weights: RESEARCH_FIELD_WEIGHTS,
          risk_thresholds: { medium: 40, high: 70 },
          batch_size: 32
        }
      }),
      signal: AbortSignal.timeout(Number(process.env.RESEARCH_AI_TIMEOUT_MS || 900000))
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || 'Research AI comparison failed');
    error.status = response.status;
    throw error;
  }

  const result = payload.data;
  const recordedById = new Map(recordedProjects.map(project => [String(project._id), project]));
  const grouped = new Map();

  for (const row of result.records || []) {
    const projectId = String(row.recorded_project_id);
    const recorded = recordedById.get(projectId) || {};
    if (!grouped.has(projectId)) {
      grouped.set(projectId, {
        projectId,
        title: row.recorded_project_title || recorded.title || '',
        description: recorded.abstract || '',
        studentName: recorded.student?.name || recorded.archivedStudentName || '',
        technologies: recorded.toolsOrMethods || recorded.technologies || [],
        facultyId: recorded.facultyId,
        departmentId: recorded.departmentId,
        categoryId: recorded.categoryId,
        sourceRow: row.recorded_source_row || recorded.sourceRow,
        modelScores: {},
        fieldScores: {},
        unweightedScores: {}
      });
    }
    const item = grouped.get(projectId);
    item.modelScores[row.model_name] = Number(row.weighted_overall_score || 0);
    item.fieldScores[row.model_name] = row.field_scores || {};
    item.unweightedScores[row.model_name] = Number(row.unweighted_combined_score || 0);
  }

  const ranked = [...grouped.values()].map(item => {
    const modelScoreValues = RESEARCH_MODELS
      .filter(model => item.modelScores[model] != null)
      .map(model => item.modelScores[model]);
    const score = Number(average(modelScoreValues).toFixed(2));
    const fieldNames = Object.keys(RESEARCH_FIELD_WEIGHTS);
    const averagedFields = Object.fromEntries(fieldNames.map(field => [
      field,
      Number(average(RESEARCH_MODELS
        .map(model => item.fieldScores[model]?.[field])
        .filter(value => value != null)).toFixed(2))
    ]));
    const riskLevel = riskFromScore(score);
    return {
      ...item,
      score,
      similarity: score,
      similarityScore: score,
      displayedPercentage: score,
      rawCosine: Number((average(Object.values(item.unweightedScores)) / 100).toFixed(6)),
      riskLevel,
      similarityLabel: `${riskLevel} similarity`,
      matchedSections: fieldNames.filter(field => averagedFields[field] >= 40),
      averagedFields,
      reason: 'Compared only with the recorded research dataset using TF-IDF, Sentence-BERT and BGE-M3.'
    };
  }).sort((left, right) => right.score - left.score);

  const top = ranked[0];
  const topFields = top?.averagedFields || {};
  const score = top?.score || 0;
  const riskLevel = riskFromScore(score);
  const modelVersion = RESEARCH_MODELS
    .map(model => result.models?.[model]?.model_name)
    .filter(Boolean)
    .join(' | ');
  const similarProjects = ranked.slice(0, 5);

  return {
    overallScore: score,
    displayedScore: score,
    displayedPercentage: score,
    score,
    rawCosine: top?.rawCosine || 0,
    riskLevel,
    risk: riskLevel,
    similarityLabel: `${riskLevel} similarity`,
    analysis: top
      ? `${riskLevel} similarity (${score}%). Ensemble mean across TF-IDF, Sentence-BERT and BGE-M3; most similar to recorded project "${top.title}".`
      : 'No recorded project comparison was returned.',
    mostSimilarProject: top?.title || '',
    modelVersion,
    recordedProjectCount: result.recorded_project_count,
    fieldWeights: result.field_weights,
    modelResults: result.top_by_model,
    combinedText: [
      proposal.title,
      proposal.abstract || proposal.description,
      proposal.problemStatement,
      ...(proposal.objectives || []),
      ...(proposal.features || []),
      ...(proposal.technologies || proposal.toolsOrMethods || [])
    ].filter(Boolean).join(' '),
    breakdown: {
      semantic: score,
      title: topFields.title || 0,
      description: topFields.description || 0,
      abstract: topFields.description || 0,
      problemStatement: topFields.problem_statement || 0,
      objectives: topFields.research_objectives || 0,
      researchObjectives: topFields.research_objectives || 0,
      features: topFields.features || 0,
      technologiesAndTools: topFields.technologies_tools || 0
    },
    similarProjects
  };
}

async function refreshProjectEmbedding(project) {
  try {
    await ensureProjectEmbedding(project, { persist: true });
  } catch (error) {
    console.error(`Could not refresh semantic embedding for project ${project._id || 'unsaved'}:`, error.message);
  }
}

// @route   POST /api/projects
// @desc    Create a new project
// @access  Private (Student)
router.post(
  '/',
  [
    protect,
    authorize('student'),
    [
      check('title', 'Title is required').not().isEmpty(),
      check('abstract', 'Abstract is required').not().isEmpty(),
      check('problemStatement', 'Problem statement is required').not().isEmpty(),
      check('objectives', 'At least one research objective is required').isArray({ min: 1 }),
      check('features', 'At least one feature is required').isArray({ min: 1 }),
      check('technologies', 'At least one technology or tool is required').isArray({ min: 1 }),
      check('expectedOutputs').optional().isArray(),
      check('departmentId').optional().isMongoId(),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      abstract,
      features,
      problemStatement,
      objectives,
      expectedOutputs,
      toolsOrMethods,
      facultyId,
      departmentId,
      programId,
      academicYearId,
      categoryId,
      researchDomainIds,
      department,
      keywords,
      technologies
    } = req.body;

    try {
      let departmentName = department;
      if (!departmentName && departmentId) {
        const departmentRecord = await Department.findById(departmentId);
        departmentName = departmentRecord?.name || '';
      }

      // Create project
      const project = new Project({
        title,
        abstract,
        features: features || expectedOutputs || [],
        problemStatement,
        objectives: objectives || [],
        expectedOutputs: expectedOutputs || features || [],
        toolsOrMethods: toolsOrMethods || technologies || [],
        facultyId,
        departmentId,
        programId,
        academicYearId,
        categoryId,
        researchDomainIds: researchDomainIds || [],
        department: departmentName,
        student: req.user.id,
        keywords: keywords || [],
        technologies: technologies || [],
        status: 'draft'
      });

      // Save project
      await project.save();
      await refreshProjectEmbedding(project);

      res.json(project);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET /api/projects
// @desc    Get projects with multi-faculty filters
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      facultyId,
      departmentId,
      programId,
      academicYearId,
      categoryId,
      domainId,
      status,
      risk,
      supervisorId,
      studentId
    } = req.query;

    const query = {};
    if (facultyId && !departmentId) {
      const facultyDepartments = await Department.find({ facultyId }).select('_id name');
      query.$or = [
        { facultyId },
        { departmentId: { $in: facultyDepartments.map(item => item._id) } },
        { department: { $in: facultyDepartments.map(item => item.name) } }
      ];
    } else if (facultyId) {
      query.facultyId = facultyId;
    }
    if (departmentId) query.departmentId = departmentId;
    if (programId) query.programId = programId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (categoryId) query.categoryId = categoryId;
    if (domainId) query.researchDomainIds = domainId;
    if (status) query.status = status;
    if (risk) query.similarityRisk = risk;
    if (supervisorId) query.supervisor = supervisorId;
    if (studentId) query.student = studentId;

    if (req.user.role === 'student') query.student = req.user.id;
    if (req.user.role === 'supervisor' && !supervisorId) query.supervisor = req.user.id;

    const projects = await Project.find(query)
      .sort({ createdAt: -1 })
      .populate('student', 'name email studentId facultyId departmentId programId')
      .populate('supervisor', 'name email expertise expertiseDomainIds')
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code')
      .populate('programId', 'name code level')
      .populate('categoryId', 'name outputLabel toolsLabel')
      .populate('researchDomainIds', 'name');

    res.json(projects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/projects/archived
// @desc    Create a new archived project
// @access  Public (for development - should be admin only in production)
router.post(
  '/archived',
  [
    check('title', 'Title is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('features', 'At least one feature is required').isArray({ min: 1 }),
    check('studentName', 'Student name is required').not().isEmpty(),
    check('year', 'Year is required').isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      description,
      features,
      studentName,
      facultyId,
      departmentId,
      programId,
      academicYearId,
      categoryId,
      researchDomainIds,
      department,
      year,
      technologies,
      toolsOrMethods
    } = req.body;

    try {
      let departmentName = department;
      if (!departmentName && departmentId) {
        const departmentRecord = await Department.findById(departmentId);
        departmentName = departmentRecord?.name || '';
      }

      // Create a completed project directly in the archive
      const project = new Project({
        title,
        abstract: description,
        features: features,
        facultyId,
        departmentId,
        programId,
        academicYearId,
        categoryId,
        researchDomainIds: researchDomainIds || [],
        department: departmentName,
        technologies: technologies || [],
        toolsOrMethods: toolsOrMethods || technologies || [],
        status: 'completed',
        archivedStudentName: studentName,
        archivedYear: year
      });

      await project.save();
      await refreshProjectEmbedding(project);

      // Return in archived format
      res.json({
        id: project._id,
        title: project.title,
        studentName: studentName,
        year: year,
        abstract: project.abstract,
        features: project.features,
        technologies: project.technologies,
        toolsOrMethods: project.toolsOrMethods,
        facultyId: project.facultyId,
        departmentId: project.departmentId,
        programId: project.programId,
        categoryId: project.categoryId,
        researchDomainIds: project.researchDomainIds,
        department: project.department
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET /api/projects/archived
// @desc    Get all completed/archived projects (public for students to browse)
// @access  Public
router.get('/archived', async (req, res) => {
  try {
    const { facultyId, departmentId, department, categoryId, domainId, search } = req.query;
    
    let query = { status: 'completed' };
    
    if (facultyId && !departmentId) {
      const facultyDepartments = await Department.find({ facultyId }).select('_id name code');
      const facultyDepartmentIds = facultyDepartments.map(item => item._id);
      const facultyDepartmentLabels = facultyDepartments.flatMap(item => [item.name, item.code]).filter(Boolean);

      query.$or = [
        { facultyId },
        { departmentId: { $in: facultyDepartmentIds } },
        { department: { $in: facultyDepartmentLabels } }
      ];
    } else if (facultyId) {
      query.facultyId = facultyId;
    }
    if (departmentId) query.departmentId = departmentId;
    if (categoryId) query.categoryId = categoryId;
    if (domainId) query.researchDomainIds = domainId;
    if (department && department !== 'All') {
      query.department = department;
    }
    
    let projects = await Project.find(query)
      .sort({ createdAt: -1 })
      .populate('student', 'name')
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code facultyId')
      .populate('programId', 'name code level')
      .populate('categoryId', 'name')
      .populate('researchDomainIds', 'name')
      .select('title abstract features technologies toolsOrMethods department facultyId departmentId programId categoryId researchDomainIds createdAt student archivedStudentName archivedYear');
    
    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      projects = projects.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        p.abstract.toLowerCase().includes(searchLower) ||
        p.technologies.some(t => t.toLowerCase().includes(searchLower)) ||
        (p.toolsOrMethods || []).some(t => t.toLowerCase().includes(searchLower))
      );
    }
    
    // Transform to match frontend ArchivedProject type
    const archivedProjects = projects.map(p => ({
      id: p._id,
      title: p.title,
      studentName: p.archivedStudentName || p.student?.name || 'Unknown',
      year: p.archivedYear || new Date(p.createdAt).getFullYear(),
      abstract: p.abstract,
      features: p.features || [],
      technologies: p.technologies || [],
      toolsOrMethods: p.toolsOrMethods || p.technologies || [],
      facultyId: p.facultyId,
      departmentId: p.departmentId,
      programId: p.programId,
      categoryId: p.categoryId,
      researchDomainIds: p.researchDomainIds,
      department: p.department
    }));
    
    res.json(archivedProjects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/projects/me
// @desc    Get current user's projects
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    let projects;
    
    if (req.user.role === 'student') {
      projects = await Project.find({ student: req.user.id })
        .sort({ createdAt: -1 })
        .populate('supervisor', 'name email expertise expertiseDomainIds')
        .populate('facultyId', 'name code')
        .populate('departmentId', 'name code')
        .populate('programId', 'name code level')
        .populate('categoryId', 'name outputLabel toolsLabel')
        .populate('researchDomainIds', 'name');
    } else if (req.user.role === 'supervisor') {
      projects = await Project.find({ supervisor: req.user.id })
        .sort({ createdAt: -1 })
        .populate('student', 'name email studentId')
        .populate('facultyId', 'name code')
        .populate('departmentId', 'name code')
        .populate('programId', 'name code level')
        .populate('categoryId', 'name outputLabel toolsLabel')
        .populate('researchDomainIds', 'name');
    } else {
      // Admin can see all projects
      projects = await Project.find()
        .sort({ createdAt: -1 })
        .populate('student', 'name email studentId')
        .populate('supervisor', 'name email')
        .populate('facultyId', 'name code')
        .populate('departmentId', 'name code')
        .populate('programId', 'name code level')
        .populate('categoryId', 'name outputLabel toolsLabel')
        .populate('researchDomainIds', 'name');
    }

    res.json(projects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/projects/similar
// @desc    Check an unsaved project proposal against existing projects
// @access  Public
router.post(
  '/similar',
  [
    check('title', 'Title is required').not().isEmpty(),
    check('abstract').optional().isString(),
    check('description').optional().isString(),
    check('problemStatement', 'Problem statement is required').not().isEmpty(),
    check('objectives', 'At least one research objective is required').isArray({ min: 1 }),
    check('features', 'At least one feature is required').isArray({ min: 1 }),
    check('technologies', 'At least one technology or tool is required').isArray({ min: 1 }),
    check('expectedOutputs').optional().isArray(),
    check('toolsOrMethods').optional().isArray(),
    check('technologies').optional().isArray(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const similarityReport = await calculateRecordedProposalSimilarity({
        _id: req.body.projectId,
        title: req.body.title,
        abstract: req.body.abstract || req.body.description || '',
        features: req.body.features || req.body.expectedOutputs || [],
        problemStatement: req.body.problemStatement || '',
        objectives: req.body.objectives || [],
        expectedOutputs: req.body.expectedOutputs || req.body.features || [],
        toolsOrMethods: req.body.toolsOrMethods || req.body.technologies || [],
        technologies: req.body.technologies || [],
        keywords: req.body.keywords || [],
        facultyId: req.body.facultyId,
        departmentId: req.body.departmentId,
        programId: req.body.programId,
        categoryId: req.body.categoryId,
        researchDomainIds: req.body.researchDomainIds || []
      });
      res.json(similarityReport);
    } catch (err) {
      console.error(err.message);
      res.status(err.status || 500).json({
        message: err.message || 'Recorded-project similarity comparison failed'
      });
    }
  }
);

// @route   PUT /api/projects/:id
// @desc    Update a project and regenerate its semantic embedding when content changes
// @access  Private
router.put(
  '/:id',
  [
    protect,
    [
      check('title').optional().not().isEmpty(),
      check('abstract').optional().isString(),
      check('description').optional().isString(),
      check('features').optional().isArray(),
      check('expectedOutputs').optional().isArray(),
      check('toolsOrMethods').optional().isArray(),
      check('technologies').optional().isArray(),
      check('status').optional().isIn(PROJECT_STATUSES),
      check('feedback').optional().isString(),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      const ownsProject = project.student && project.student.toString() === req.user.id;
      const isAssignedSupervisor = project.supervisor && project.supervisor.toString() === req.user.id;
      const isAdmin = req.user.role === 'admin';
      if (!ownsProject && !isAssignedSupervisor && !isAdmin) {
        return res.status(403).json({ message: 'Not authorized to update this project' });
      }

      const hasStatusUpdate = Object.prototype.hasOwnProperty.call(req.body, 'status');
      if (hasStatusUpdate && !isAssignedSupervisor && !isAdmin) {
        return res.status(403).json({ message: 'Only the assigned supervisor or an admin can update project status' });
      }

      const editableFields = [
        'title',
        'problemStatement',
        'facultyId',
        'departmentId',
        'programId',
        'academicYearId',
        'categoryId',
        'department',
        'keywords',
        'researchDomainIds'
      ];

      let shouldRefreshEmbedding = false;
      editableFields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          project[field] = req.body[field];
          shouldRefreshEmbedding = true;
        }
      });

      if (Object.prototype.hasOwnProperty.call(req.body, 'abstract') || Object.prototype.hasOwnProperty.call(req.body, 'description')) {
        project.abstract = req.body.abstract || req.body.description || '';
        shouldRefreshEmbedding = true;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'features') || Object.prototype.hasOwnProperty.call(req.body, 'expectedOutputs')) {
        project.features = req.body.features || req.body.expectedOutputs || [];
        project.expectedOutputs = req.body.expectedOutputs || req.body.features || [];
        shouldRefreshEmbedding = true;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'toolsOrMethods') || Object.prototype.hasOwnProperty.call(req.body, 'technologies')) {
        project.toolsOrMethods = req.body.toolsOrMethods || req.body.technologies || [];
        project.technologies = req.body.technologies || [];
        shouldRefreshEmbedding = true;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'objectives')) {
        project.objectives = req.body.objectives || [];
        shouldRefreshEmbedding = true;
      }
      if (hasStatusUpdate) {
        project.status = req.body.status;
      }
      if (req.body.feedback && String(req.body.feedback).trim()) {
        project.feedback.push({
          from: req.user.role === 'admin' ? 'admin' : 'supervisor',
          message: String(req.body.feedback).trim()
        });
      }

      project.lastUpdated = Date.now();
      await project.save();
      if (shouldRefreshEmbedding) {
        await refreshProjectEmbedding(project);
      }

      res.json(project);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Project not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET /api/projects/:id
// @desc    Get project by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('student', 'name email studentId')
      .populate('supervisor', 'name email expertise expertiseDomainIds')
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code')
      .populate('programId', 'name code level')
      .populate('categoryId', 'name outputLabel toolsLabel')
      .populate('researchDomainIds', 'name');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user has permission to view this project
    if (
      project.student._id.toString() !== req.user.id &&
      (project.supervisor && project.supervisor._id.toString() !== req.user.id) &&
      req.user.role !== 'admin'
    ) {
      return res.status(401).json({ message: 'Not authorized to view this project' });
    }

    res.json(project);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/projects/:id/submit
// @desc    Submit project for review
// @access  Private (Student)
router.put('/:id/submit', [protect, authorize('student')], async (req, res) => {
  try {
    let project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is the project owner
    if (project.student.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Check if project is not already submitted
    if (project.status !== 'draft') {
      return res.status(400).json({ message: 'Project has already been submitted' });
    }

    // Calculate similarity score
    const similarityReport = await calculateRecordedProposalSimilarity(project.toObject());
    const persistedReport = await SimilarityReport.create({
      projectId: project._id,
      academicContext: {
        facultyId: project.facultyId,
        departmentId: project.departmentId,
        programId: project.programId,
        categoryId: project.categoryId,
        researchDomainIds: project.researchDomainIds
      },
      overallScore: similarityReport.overallScore,
      displayedScore: similarityReport.displayedScore,
      rawCosine: similarityReport.rawCosine,
      riskLevel: similarityReport.riskLevel,
      similarityLabel: similarityReport.similarityLabel,
      breakdown: similarityReport.breakdown,
      recordedProjectCount: similarityReport.recordedProjectCount,
      fieldWeights: similarityReport.fieldWeights,
      modelResults: similarityReport.modelResults,
      matchedProjects: similarityReport.similarProjects.map(item => ({
        projectId: item.projectId,
        title: item.title,
        description: item.description,
        studentName: item.studentName,
        technologies: item.technologies,
        facultyId: item.facultyId,
        departmentId: item.departmentId,
        categoryId: item.categoryId,
        rawCosine: item.rawCosine,
        score: item.score || item.similarity,
        displayedPercentage: item.displayedPercentage,
        similarityLabel: item.similarityLabel,
        riskLevel: item.riskLevel,
        matchedSections: item.matchedSections || [],
        reason: item.reason,
        modelScores: item.modelScores,
        fieldScores: item.fieldScores
      })),
      modelVersion: similarityReport.modelVersion,
      combinedText: similarityReport.combinedText
    });
    
    // Update project status
    project.status = 'submitted';
    project.similarityScore = similarityReport.overallScore;
    project.similarityRisk = similarityReport.riskLevel;
    project.similarityLabel = similarityReport.similarityLabel;
    project.similarityReport = similarityReport;
    project.similarityReportId = persistedReport._id;
    project.submissionDate = Date.now();
    
    await project.save();

    res.json(project);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/projects/:id/assign-supervisor
// @desc    Assign a supervisor to a project (Admin only)
// @access  Private (Admin)
router.put(
  '/:id/assign-supervisor',
  [protect, authorize('admin')],
  async (req, res) => {
    try {
      const { supervisorId } = req.body;
      
      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Check if project is submitted
      if (project.status !== 'submitted') {
        return res.status(400).json({ message: 'Project must be submitted before assigning a supervisor' });
      }

      // Find supervisor and check workload
      const supervisor = await User.findOne({
        _id: supervisorId,
        role: 'supervisor',
        availableForAssignment: { $ne: false },
        $expr: { $lt: ['$currentProjects', '$maxProjects'] }
      });

      if (!supervisor) {
        return res.status(400).json({ message: 'Invalid supervisor or supervisor has reached maximum project limit' });
      }

      // Update project
      project.supervisor = supervisorId;
      project.status = 'under_review';
      await project.save();

      // Update supervisor's current projects count
      await User.findByIdAndUpdate(supervisorId, {
        $inc: { currentProjects: 1 }
      });

      res.json(project);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

module.exports = router;
