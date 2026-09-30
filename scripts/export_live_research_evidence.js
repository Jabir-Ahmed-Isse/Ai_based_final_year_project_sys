import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from '../backend/node_modules/mongoose/index.js';

const outputDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('outputs/journal-revision-20260805-work/live-evidence');
const researchTag = 'RESEARCH_EXPERIMENT';
const models = ['tfidf', 'sentence_bert', 'bge_m3'];

function value(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csv(rows) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (entry) => `"${value(entry).replaceAll('"', '""')}"`;
  return [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

async function writeJson(name, data) {
  await fs.writeFile(path.join(outputDirectory, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeCsv(name, data) {
  await fs.writeFile(path.join(outputDirectory, name), `${csv(data)}\n`, 'utf8');
}

async function run() {
  await fs.mkdir(outputDirectory, { recursive: true });
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hormuud-gpms');
  const db = mongoose.connection.db;

  const [
    projects,
    supervisors,
    pairScores,
    supervisorScores,
    assignments,
    similarityAnnotations,
    consensus,
    supervisorGroundTruth,
    experimentRuns,
    configuration,
  ] = await Promise.all([
    db.collection('projects').find({ testDataTag: researchTag }).sort({ sourceRow: 1 }).toArray(),
    db.collection('users').find({ testDataTag: researchTag, role: 'supervisor' }).sort({ researchSupervisorId: 1 }).toArray(),
    db.collection('projectpairscores').find({ modelName: { $in: models } }).sort({ modelName: 1, firstProjectId: 1, secondProjectId: 1 }).toArray(),
    db.collection('supervisormatchscores').find({ modelName: { $in: models } }).sort({ modelName: 1, projectId: 1, supervisorId: 1 }).toArray(),
    db.collection('supervisorassignments').find({}).sort({ projectId: 1 }).toArray(),
    db.collection('humanevaluations').find({ modelName: { $in: models }, annotationStatus: 'submitted' }).sort({ modelName: 1, evaluationDate: 1 }).toArray(),
    db.collection('annotationconsensus').find({ modelName: { $in: models } }).sort({ modelName: 1, computedAt: 1 }).toArray(),
    db.collection('supervisorgroundtruths').find({ modelName: { $in: models }, annotationStatus: 'submitted' }).sort({ modelName: 1, projectId: 1, supervisorId: 1 }).toArray(),
    db.collection('researchexperimentruns').find({ datasetTag: researchTag }).sort({ completedAt: -1 }).toArray(),
    db.collection('researchconfigurations').findOne({ key: 'default' }),
  ]);

  const projectCode = new Map(projects.map((project) => [String(project._id), `P${String(project.sourceRow).padStart(3, '0')}`]));
  const supervisorCode = new Map(supervisors.map((supervisor) => [String(supervisor._id), supervisor.researchSupervisorId]));
  const runCode = new Map(experimentRuns.map((run, index) => [String(run._id), `RUN${String(index + 1).padStart(3, '0')}`]));

  const sanitizedProjects = projects.map((project) => ({
    projectCode: projectCode.get(String(project._id)),
    sourceRow: project.sourceRow,
    title: project.title,
    description: project.abstract,
    problemStatement: project.problemStatement,
    researchObjectives: project.objectives,
    features: project.features,
    technologiesAndTools: [...(project.technologies || []), ...(project.toolsOrMethods || [])],
    descriptionVersion: project.descriptionVersion,
    syntheticContent: project.syntheticContent,
    isTestData: project.isTestData,
  }));

  const sanitizedSupervisors = supervisors.map((supervisor) => ({
    supervisorCode: supervisor.researchSupervisorId,
    academicSpecialization: supervisor.academicSpecialization,
    researchInterests: supervisor.researchInterests,
    areasOfExpertise: supervisor.areasOfExpertise,
    skills: supervisor.skills,
    technologies: supervisor.supervisorTechnologies,
    previousProjectTopics: supervisor.previousSupervisedProjectTopics,
    publicationKeywords: supervisor.publicationKeywords,
    yearsOfExperience: supervisor.yearsOfExperience,
    currentProjects: supervisor.currentProjects,
    maximumCapacity: supervisor.maxProjects,
    availableForAssignment: supervisor.availableForAssignment,
    syntheticProfile: true,
  }));

  const sanitizedPairScores = pairScores.map((row) => ({
    experimentRunCode: runCode.get(String(row.experimentRunId)) || 'RUN-UNMAPPED',
    firstProjectCode: projectCode.get(String(row.firstProjectId)),
    secondProjectCode: projectCode.get(String(row.secondProjectId)),
    model: row.modelName,
    modelVersion: row.modelVersion,
    titleScore: row.fieldScores?.title,
    descriptionScore: row.fieldScores?.description,
    problemStatementScore: row.fieldScores?.problem_statement,
    researchObjectivesScore: row.fieldScores?.research_objectives,
    featuresScore: row.fieldScores?.features,
    technologiesToolsScore: row.fieldScores?.technologies_tools,
    weightedOverallScore: row.weightedOverallScore,
    unweightedCombinedScore: row.unweightedCombinedScore,
    riskLevel: row.riskLevel,
    executionTimeMs: row.executionTimeMs,
    embeddingDimension: row.embeddingDimension,
    device: row.device,
    descriptionVersion: row.descriptionVersion,
    createdAt: row.createdAt,
  }));

  const sanitizedSupervisorScores = supervisorScores.map((row) => ({
    experimentRunCode: runCode.get(String(row.experimentRunId)) || 'RUN-UNMAPPED',
    projectCode: projectCode.get(String(row.projectId)),
    supervisorCode: supervisorCode.get(String(row.supervisorId)),
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
    eligible: row.eligible,
    semanticRank: row.semanticRank,
    adjustedRank: row.adjustedRank,
    executionTimeMs: row.executionTimeMs,
    embeddingDimension: row.embeddingDimension,
    descriptionVersion: row.descriptionVersion,
    createdAt: row.createdAt,
  }));

  const sanitizedAssignments = assignments.map((row) => ({
    experimentRunCode: runCode.get(String(row.experimentRunId)) || 'RUN-UNMAPPED',
    projectCode: projectCode.get(String(row.projectId)),
    recommendedSupervisorCode: supervisorCode.get(String(row.recommendedSupervisorId)),
    assignedSupervisorCode: supervisorCode.get(String(row.assignedSupervisorId)),
    ensembleScore: row.ensembleScore,
    maximumCapacity: row.capacitySnapshot?.maximumCapacity,
    assignedBefore: row.capacitySnapshot?.assignedBefore,
    assignedAfter: row.capacitySnapshot?.assignedAfter,
    createdAt: row.createdAt,
  }));

  const sanitizedSimilarityAnnotations = similarityAnnotations.map((row) => ({
    firstProjectCode: projectCode.get(String(row.firstProjectId)),
    secondProjectCode: projectCode.get(String(row.secondProjectId)),
    model: row.modelName,
    datasetName: row.datasetName,
    evaluatorRole: row.evaluatorRole,
    relationLabel: row.relationLabel,
    binaryLabel: row.binaryLabel,
    humanSimilarityPercentage: row.humanSimilarityPercentage,
    annotationStatus: row.annotationStatus,
    evaluationDate: row.evaluationDate,
  }));

  const sanitizedConsensus = consensus.map((row) => ({
    firstProjectCode: projectCode.get(String(row.firstProjectId)),
    secondProjectCode: projectCode.get(String(row.secondProjectId)),
    model: row.modelName,
    datasetName: row.datasetName,
    annotatorCount: row.annotatorCount,
    relationLabel: row.relationLabel,
    binaryLabel: row.binaryLabel,
    agreementRatio: row.agreementRatio,
    status: row.status,
    computedAt: row.computedAt,
  }));

  const sanitizedSupervisorGroundTruth = supervisorGroundTruth.map((row) => ({
    projectCode: projectCode.get(String(row.projectId)),
    supervisorCode: supervisorCode.get(String(row.supervisorId)),
    model: row.modelName,
    datasetName: row.datasetName,
    relevanceGrade: row.relevanceGrade,
    binaryLabel: Number(row.consensusRelevanceGrade ?? row.relevanceGrade) >= 2 ? 1 : 0,
    annotationStatus: row.annotationStatus,
    annotationSource: row.annotationSource,
    updatedAt: row.updatedAt,
  }));

  const sanitizedRuns = experimentRuns.map((row) => ({
    experimentRunCode: runCode.get(String(row._id)),
    type: row.type,
    status: row.status,
    datasetTag: row.datasetTag,
    descriptionVersion: row.descriptionVersion,
    models: row.models,
    configuration: row.configuration ? {
      ...row.configuration,
      ...(row.configuration.modelRuns ? {
        modelRuns: Object.fromEntries(Object.entries(row.configuration.modelRuns).map(([model, id]) => [
          model,
          runCode.get(String(id)) || 'RUN-UNMAPPED',
        ])),
      } : {}),
    } : null,
    resultCounts: row.resultCounts,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));

  const evidence = {
    generatedAt: new Date().toISOString(),
    privacy: 'Names, emails, passwords, tokens, evaluator identifiers, student identifiers, and MongoDB object identifiers were excluded.',
    counts: {
      projects: sanitizedProjects.length,
      supervisors: sanitizedSupervisors.length,
      pairScores: sanitizedPairScores.length,
      supervisorScores: sanitizedSupervisorScores.length,
      assignments: sanitizedAssignments.length,
      similarityAnnotations: sanitizedSimilarityAnnotations.length,
      consensusRecords: sanitizedConsensus.length,
      supervisorGroundTruth: sanitizedSupervisorGroundTruth.length,
    },
    labelProvenance: {
      similarity: [...new Set(sanitizedSimilarityAnnotations.map((row) => `${row.model}:${row.datasetName}:${row.evaluatorRole}`))],
      similarityConsensusStatuses: [...new Set(sanitizedConsensus.map((row) => `${row.model}:${row.status}:n=${row.annotatorCount}`))],
      supervisorSources: Object.fromEntries(models.map((model) => [
        model,
        Object.fromEntries([...new Set(sanitizedSupervisorGroundTruth.filter((row) => row.model === model).map((row) => row.annotationSource || 'unspecified'))].map((source) => [
          source,
          sanitizedSupervisorGroundTruth.filter((row) => row.model === model && (row.annotationSource || 'unspecified') === source).length,
        ])),
      ])),
    },
    configuration: configuration ? {
      key: configuration.key,
      fieldWeights: configuration.fieldWeights,
      riskThresholds: configuration.riskThresholds,
      agreementThresholds: configuration.agreementThresholds,
      classificationThresholds: configuration.classificationThresholds,
      significanceLevel: configuration.significanceLevel,
      workloadBalancing: configuration.workloadBalancing,
    } : null,
    experimentRuns: sanitizedRuns,
  };

  await Promise.all([
    writeJson('live-evidence-audit.json', evidence),
    writeJson('projects-sanitized.json', sanitizedProjects),
    writeCsv('projects-sanitized.csv', sanitizedProjects),
    writeJson('supervisor-profiles-sanitized.json', sanitizedSupervisors),
    writeCsv('supervisor-profiles-sanitized.csv', sanitizedSupervisors),
    writeJson('project-pair-scores-sanitized.json', sanitizedPairScores),
    writeCsv('project-pair-scores-sanitized.csv', sanitizedPairScores),
    writeJson('supervisor-matching-scores-sanitized.json', sanitizedSupervisorScores),
    writeCsv('supervisor-matching-scores-sanitized.csv', sanitizedSupervisorScores),
    writeJson('balanced-assignments-sanitized.json', sanitizedAssignments),
    writeCsv('balanced-assignments-sanitized.csv', sanitizedAssignments),
    writeJson('similarity-annotations-sanitized.json', sanitizedSimilarityAnnotations),
    writeCsv('similarity-annotations-sanitized.csv', sanitizedSimilarityAnnotations),
    writeJson('annotation-consensus-sanitized.json', sanitizedConsensus),
    writeCsv('annotation-consensus-sanitized.csv', sanitizedConsensus),
    writeJson('supervisor-ground-truth-sanitized.json', sanitizedSupervisorGroundTruth),
    writeCsv('supervisor-ground-truth-sanitized.csv', sanitizedSupervisorGroundTruth),
    writeJson('experiment-runs-sanitized.json', sanitizedRuns),
  ]);

  console.log(JSON.stringify(evidence, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
