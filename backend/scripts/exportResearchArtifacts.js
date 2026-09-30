const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const User = require('../src/models/User');
require('../src/models/Faculty');
require('../src/models/Department');
require('../src/models/Program');
const ResearchImportRun = require('../src/models/ResearchImportRun');
const ResearchExperimentRun = require('../src/models/ResearchExperimentRun');
const ProjectPairScore = require('../src/models/ProjectPairScore');
const SupervisorMatchScore = require('../src/models/SupervisorMatchScore');
const SupervisorAssignment = require('../src/models/SupervisorAssignment');
const HumanEvaluation = require('../src/models/HumanEvaluation');
const AnnotationConsensus = require('../src/models/AnnotationConsensus');
const ActivityLog = require('../src/models/ActivityLog');

const TEST_TAG = 'RESEARCH_EXPERIMENT';
const outputDirectory = path.resolve(__dirname, '../../outputs/research-experiment-20260724/raw');

const csvCell = value => {
  const normalized = value == null ? '' : Array.isArray(value) ? value.join(' | ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
};
const writeRows = (name, rows) => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, `${name}.json`), JSON.stringify(rows, null, 2));
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const csv = [headers.map(csvCell).join(','), ...rows.map(row => headers.map(header => csvCell(row[header])).join(','))].join('\r\n');
  fs.writeFileSync(path.join(outputDirectory, `${name}.csv`), csv);
  return rows.length;
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const [
    projects, users, imports, experiments, pairScores, supervisorScores,
    assignments, annotations, consensus, activities
  ] = await Promise.all([
    Project.find({ testDataTag: TEST_TAG }).populate('student', 'studentId name email').populate('programId', 'name code').sort({ sourceRow: 1 }).lean(),
    User.find({ testDataTag: TEST_TAG }).select('-password').populate('facultyId departmentId programId assignedProjectId').sort({ role: 1, email: 1 }).lean(),
    ResearchImportRun.find().sort({ createdAt: 1 }).lean(),
    ResearchExperimentRun.find({ datasetTag: TEST_TAG }).sort({ startedAt: 1 }).lean(),
    ProjectPairScore.find().sort({ modelName: 1, firstProjectTitle: 1, secondProjectTitle: 1 }).lean(),
    SupervisorMatchScore.find().populate('projectId', 'title sourceRow').populate('supervisorId', 'name researchSupervisorId').sort({ modelName: 1, projectId: 1, adjustedRank: 1 }).lean(),
    SupervisorAssignment.find().populate('projectId', 'title sourceRow').populate('assignedSupervisorId recommendedSupervisorId', 'name researchSupervisorId').sort({ projectId: 1 }).lean(),
    HumanEvaluation.find().populate('firstProjectId secondProjectId evaluatorId', 'title name').sort({ createdAt: 1 }).lean(),
    AnnotationConsensus.find().populate('firstProjectId secondProjectId', 'title').sort({ createdAt: 1 }).lean(),
    ActivityLog.find().sort({ createdAt: 1 }).lean()
  ]);

  const counts = {};
  counts.projects = writeRows('projects', projects.map(project => ({
    projectId: project._id,
    sourceRow: project.sourceRow,
    number: project.sourceRow - 1,
    title: project.title,
    description: project.abstract,
    problemStatement: project.problemStatement,
    researchObjectives: project.objectives,
    features: project.features,
    technologiesAndTools: [...(project.technologies || []), ...(project.toolsOrMethods || [])],
    studentId: project.student?.studentId,
    studentName: project.student?.name,
    studentEmail: project.student?.email,
    program: project.programId?.name,
    normalizedTitle: project.normalizedTitle,
    contentHash: project.contentHash,
    syntheticContent: project.syntheticContent,
    testDataTag: project.testDataTag
  })));
  counts.users = writeRows('test-users', users.map(user => ({
    userId: user._id,
    identifier: user.studentId || user.researchSupervisorId,
    name: user.name,
    email: user.email,
    role: user.role,
    faculty: user.facultyId?.name,
    department: user.departmentId?.name || user.department,
    program: user.programId?.name,
    assignedProjectId: user.assignedProjectId?._id,
    assignedProjectTitle: user.assignedProjectId?.title,
    accountStatus: user.accountStatus,
    isTestAccount: user.isTestAccount,
    createdAt: user.createdAt
  })));
  counts.supervisors = writeRows('supervisor-profiles', users.filter(user => user.role === 'supervisor').map(user => ({
    supervisorId: user._id,
    supervisorCode: user.researchSupervisorId,
    name: user.name,
    email: user.email,
    academicSpecialization: user.academicSpecialization,
    researchInterests: user.researchInterests,
    areasOfExpertise: user.areasOfExpertise,
    skills: user.skills,
    technologies: user.supervisorTechnologies,
    previousSupervisedProjectTopics: user.previousSupervisedProjectTopics,
    publicationKeywords: user.publicationKeywords,
    yearsOfExperience: user.yearsOfExperience,
    maximumCapacity: user.maxProjects,
    currentWorkload: user.currentProjects,
    available: user.availableForAssignment,
    isTestAccount: user.isTestAccount
  })));
  counts.imports = writeRows('import-runs', imports.map(run => ({
    importRunId: run._id, sourceFile: run.sourceFile, worksheet: run.sourceWorksheet,
    status: run.status, dryRun: run.dryRun, startedAt: run.startedAt, completedAt: run.completedAt,
    durationMs: run.durationMs, counts: run.counts, warnings: run.warnings, errors: run.errorMessages || run.errors || []
  })));
  counts.experiments = writeRows('experiment-runs', experiments.map(run => ({
    experimentRunId: run._id, name: run.name, type: run.type, models: run.models,
    status: run.status, randomSeed: run.randomSeed, progress: run.progress,
    resultCounts: run.resultCounts, hardware: run.hardware, configuration: run.configuration,
    startedAt: run.startedAt, completedAt: run.completedAt, durationMs: run.durationMs,
    errors: run.errorMessages || run.errors || []
  })));
  counts.pairScores = writeRows('project-pair-scores', pairScores.map(row => ({
    experimentRunId: row.experimentRunId,
    firstProjectId: row.firstProjectId,
    firstProjectTitle: row.firstProjectTitle,
    secondProjectId: row.secondProjectId,
    secondProjectTitle: row.secondProjectTitle,
    model: row.modelName,
    modelVersion: row.modelVersion,
    titleScore: row.fieldScores?.title,
    descriptionScore: row.fieldScores?.description,
    problemStatementScore: row.fieldScores?.problem_statement,
    researchObjectivesScore: row.fieldScores?.research_objectives,
    featuresScore: row.fieldScores?.features,
    technologiesAndToolsScore: row.fieldScores?.technologies_tools,
    weightedOverallScore: row.weightedOverallScore,
    unweightedCombinedScore: row.unweightedCombinedScore,
    riskLevel: row.riskLevel,
    executionTimeMs: row.executionTimeMs,
    embeddingDimension: row.embeddingDimension,
    device: row.device,
    batchSize: row.batchSize,
    testedAt: row.createdAt
  })));
  counts.supervisorScores = writeRows('supervisor-matching-scores', supervisorScores.map(row => ({
    experimentRunId: row.experimentRunId,
    projectId: row.projectId?._id,
    projectTitle: row.projectId?.title,
    supervisorId: row.supervisorId?._id,
    supervisorCode: row.supervisorId?.researchSupervisorId,
    supervisorName: row.supervisorId?.name,
    model: row.modelName,
    modelVersion: row.modelVersion,
    semanticExpertiseScore: row.semanticExpertiseScore,
    technologyScore: row.technologyScore,
    skillsScore: row.skillsScore,
    previousProjectScore: row.previousProjectScore,
    publicationKeywordScore: row.publicationKeywordScore,
    workloadAvailabilityScore: row.workloadAvailabilityScore,
    pureSemanticScore: row.pureSemanticScore,
    finalAdjustedScore: row.finalAdjustedScore,
    semanticRank: row.semanticRank,
    adjustedRank: row.adjustedRank,
    eligible: row.eligible,
    explanation: row.explanation,
    executionTimeMs: row.executionTimeMs
  })));
  counts.assignments = writeRows('balanced-assignments', assignments.map(row => ({
    experimentRunId: row.experimentRunId,
    projectId: row.projectId?._id,
    projectTitle: row.projectId?.title,
    assignedSupervisorId: row.assignedSupervisorId?._id,
    assignedSupervisorCode: row.assignedSupervisorId?.researchSupervisorId,
    assignedSupervisorName: row.assignedSupervisorId?.name,
    manualOverride: row.manualOverride,
    semanticRank: row.semanticRank,
    adjustedRank: row.adjustedRank,
    maximumCapacity: row.capacitySnapshot?.maximum,
    workloadAfterAssignment: row.capacitySnapshot?.afterAssignment,
    ensembleAdjustedScore: row.capacitySnapshot?.ensembleAdjustedScore,
    balanceAdjustedScore: row.capacitySnapshot?.balanceAdjustedScore,
    capacitySnapshot: row.capacitySnapshot,
    explanation: row.explanation
  })));
  counts.annotations = writeRows('human-annotations', annotations);
  counts.consensus = writeRows('annotation-consensus', consensus);
  counts.activities = writeRows('activity-logs', activities);
  fs.writeFileSync(path.join(outputDirectory, 'export-manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    datasetTag: TEST_TAG,
    counts,
    limitations: [
      'No human-validated ground truth was present at export time.',
      'Classification and ranking quality metrics must not be inferred from unlabelled scores.'
    ]
  }, null, 2));
  console.log(JSON.stringify(counts));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
