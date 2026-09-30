const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATASET_VERSION = 'project_dataset_v2_corrected_descriptions';
const outputRoot = path.resolve(__dirname, '../../outputs/dataset-correction-v2');
const round = (value, digits = 4) => Number(Number(value || 0).toFixed(digits));
const percentile = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))] || 0;
const stats = (rows, scoreKey) => {
  const values = rows.map(row => Number(row[scoreKey] || 0)).sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(values.length, 1);
  return {
    records: values.length, mean: round(mean), median: round(percentile(values, 0.5)),
    minimum: round(values[0]), maximum: round(values[values.length - 1]),
    standardDeviation: round(Math.sqrt(variance)), averageExecutionTimeMs: round(rows.reduce((sum, row) => sum + Number(row.executionTimeMs || 0), 0) / Math.max(rows.length, 1))
  };
};
const pairKey = row => `${row.modelName}:${String(row.firstProjectId)}:${String(row.secondProjectId)}`;
const supervisorKey = row => `${row.modelName}:${String(row.projectId)}:${String(row.supervisorId)}`;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const db = mongoose.connection.db;
  const auditFiles = fs.readdirSync(outputRoot).filter(name => name.startsWith('correction-audit-') && name.endsWith('.json')).sort();
  if (!auditFiles.length) throw new Error('Correction audit file not found');
  const auditPath = path.join(outputRoot, auditFiles[auditFiles.length - 1]);
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  const [projects, pairScores, supervisorScores, assignments, runs, humanLabels, supervisorLabels] = await Promise.all([
    db.collection('projects').find({ testDataTag: 'RESEARCH_EXPERIMENT' }).sort({ sourceRow: 1 }).toArray(),
    db.collection('projectpairscores').find({ datasetVersion: DATASET_VERSION }).toArray(),
    db.collection('supervisormatchscores').find({ datasetVersion: DATASET_VERSION }).toArray(),
    db.collection('supervisorassignments').find({}).toArray(),
    db.collection('researchexperimentruns').find({ datasetVersion: DATASET_VERSION }).sort({ completedAt: 1 }).toArray(),
    db.collection('humanevaluations').find({ datasetName: 'similarity_annotations_v2' }).toArray(),
    db.collection('supervisorgroundtruths').find({ datasetName: /^supervisor_assignment_annotations_v2:/ }).toArray()
  ]);
  const oldPairScores = (audit.removedDocuments.projectpairscores || []).map(row => mongoose.mongo.BSON.EJSON.deserialize(row));
  const oldSupervisorScores = (audit.removedDocuments.supervisormatchscores || []).map(row => mongoose.mongo.BSON.EJSON.deserialize(row));
  const oldPairMap = new Map(oldPairScores.map(row => [pairKey(row), row]));
  const oldSupervisorMap = new Map(oldSupervisorScores.map(row => [supervisorKey(row), row]));
  const pairChanges = pairScores.map(row => {
    const old = oldPairMap.get(pairKey(row));
    return { model: row.modelName, firstProjectId: String(row.firstProjectId), secondProjectId: String(row.secondProjectId), oldScore: old ? round(old.weightedOverallScore) : null, newScore: round(row.weightedOverallScore), absoluteChange: old ? round(Math.abs(Number(row.weightedOverallScore) - Number(old.weightedOverallScore))) : null };
  }).filter(row => row.absoluteChange != null).sort((a, b) => b.absoluteChange - a.absoluteChange);
  const supervisorChanges = supervisorScores.map(row => {
    const old = oldSupervisorMap.get(supervisorKey(row));
    return { model: row.modelName, projectId: String(row.projectId), supervisorId: String(row.supervisorId), oldScore: old ? round(old.finalAdjustedScore) : null, newScore: round(row.finalAdjustedScore), absoluteChange: old ? round(Math.abs(Number(row.finalAdjustedScore) - Number(old.finalAdjustedScore))) : null };
  }).filter(row => row.absoluteChange != null).sort((a, b) => b.absoluteChange - a.absoluteChange);
  const modelNames = ['tfidf', 'sentence_bert', 'bge_m3'];
  const similarityStats = Object.fromEntries(modelNames.map(model => {
    const rows = pairScores.filter(row => row.modelName === model);
    return [model, { ...stats(rows, 'weightedOverallScore'), riskCounts: {
      Low: rows.filter(row => String(row.riskLevel || '').toLowerCase().startsWith('low')).length,
      Medium: rows.filter(row => String(row.riskLevel || '').toLowerCase().startsWith('medium')).length,
      High: rows.filter(row => String(row.riskLevel || '').toLowerCase().startsWith('high')).length
    } }];
  }));
  const supervisorStats = Object.fromEntries(modelNames.map(model => [model, {
    semantic: stats(supervisorScores.filter(row => row.modelName === model), 'pureSemanticScore'),
    adjusted: stats(supervisorScores.filter(row => row.modelName === model), 'finalAdjustedScore')
  }]));
  const stableFieldMismatches = [];
  for (const project of projects) {
    const oldEntry = audit.projects.find(row => row.projectId === String(project._id));
    const previous = mongoose.mongo.BSON.EJSON.deserialize(oldEntry.previousProject);
    for (const key of ['title', 'problemStatement', 'objectives', 'features', 'technologies', 'toolsOrMethods', 'student', 'sourceRow']) {
      if (JSON.stringify(project[key] ?? null) !== JSON.stringify(previous[key] ?? null)) stableFieldMismatches.push({ projectId: String(project._id), field: key });
    }
  }
  const report = {
    generatedAt: new Date().toISOString(), datasetVersion: DATASET_VERSION,
    executiveSummary: { projectsProcessed: projects.length, descriptionsChanged: audit.descriptionsChanged, oldLabelsRetained: humanLabels.length + supervisorLabels.length, pairScoresGenerated: pairScores.length, supervisorScoresGenerated: supervisorScores.length, recommendationsGenerated: assignments.length },
    backup: { reference: audit.backupReference, auditPath, safetyMode: audit.safetyMode, transactionCompleted: audit.transactionCompleted },
    descriptionValidation: { before: audit.before, after: audit.after },
    removedRecords: audit.recordsToRemove,
    removedRecordIds: Object.fromEntries(Object.entries(audit.removedDocuments).map(([collection, rows]) => [collection, rows.map(row => String(mongoose.mongo.BSON.EJSON.deserialize(row)._id))])),
    updatedProjects: projects.map(row => ({ projectId: String(row._id), sourceRow: row.sourceRow, title: row.title, datasetVersion: row.datasetVersion })),
    embeddings: {
      linkedProjects: projects.filter(row => row.semanticEmbedding?.vector?.length).length,
      models: [...new Set(projects.map(row => row.semanticEmbedding?.model).filter(Boolean))],
      dimensions: [...new Set(projects.map(row => row.semanticEmbedding?.dimensions).filter(Boolean))]
    },
    similarity: { uniquePairs: new Set(pairScores.map(row => `${row.firstProjectId}:${row.secondProjectId}`)).size, modelStatistics: similarityStats, largestScoreChanges: pairChanges.slice(0, 25) },
    supervisorAssignment: { combinationsPerModel: supervisorScores.length / 3, modelStatistics: supervisorStats, recommendations: assignments.length, largestScoreChanges: supervisorChanges.slice(0, 25) },
    experiments: runs.map(row => ({ id: String(row._id), name: row.name, type: row.type, models: row.models, status: row.status, storedRecords: row.resultCounts?.storedRecords || row.resultCounts?.assignedProjects, durationMs: row.durationMs, datasetVersion: row.datasetVersion })),
    supervisedMetrics: { similarityLabels: humanLabels.length, supervisorLabels: supervisorLabels.length, status: 'Not calculated', reason: 'Previous labels were deleted. Metrics will calculate immediately after one new authorised v2 label is saved and will be marked preliminary.' },
    integrity: { projectCount: projects.length, titleAndProtectedFieldMismatches: stableFieldMismatches, allProjectsVersioned: projects.every(row => row.datasetVersion === DATASET_VERSION), allEmbeddingsLinked: projects.every(row => row.semanticEmbedding?.vector?.length), expectedPairScores: pairScores.length === 9009, expectedSupervisorScores: supervisorScores.length === 4680, expectedRecommendations: assignments.length === 78 },
    rollback: { command: `node scripts/correctProjectDescriptionsV2.js --rollback=\"${auditPath}\"`, fullBackup: audit.backupReference }
  };
  const jsonPath = path.join(outputRoot, 'dataset-correction-v2-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const lines = [
    '# Project Dataset V2 Correction and Re-evaluation Report', '',
    `Generated: ${report.generatedAt}`, `Dataset version: ${DATASET_VERSION}`, '',
    '## Executive summary', '',
    `- Updated descriptions: ${report.executiveSummary.descriptionsChanged} of ${report.executiveSummary.projectsProcessed}`,
    `- Fresh similarity scores: ${pairScores.length} (${report.similarity.uniquePairs} pairs × 3 models)`,
    `- Fresh supervisor scores: ${supervisorScores.length}`, `- Balanced recommendations: ${assignments.length}`, '',
    '## Backup and reset', '', `- Backup: ${report.backup.reference}`, `- Audit: ${auditPath}`,
    `- Safety mode: ${report.backup.safetyMode}`, `- Removed counts: ${JSON.stringify(report.removedRecords)}`, '',
    '## Description quality', '',
    `- Exact duplicate descriptions: ${audit.before.exactDuplicateDescriptions} before; ${audit.after.exactDuplicateDescriptions} after`,
    `- Near-duplicate pairs (Jaccard ≥ 0.65): ${audit.before.nearDuplicatePairs.length} before; ${audit.after.nearDuplicatePairs.length} after`,
    `- Repeated openings: ${audit.before.repeatedOpenings.length} before; ${audit.after.repeatedOpenings.length} after`,
    `- Average length: ${audit.before.averageDescriptionWords} words before; ${audit.after.averageDescriptionWords} words after`, '',
    '## New similarity statistics', '',
    ...modelNames.map(model => `- ${model}: ${JSON.stringify(similarityStats[model])}`), '',
    '## New supervisor statistics', '', ...modelNames.map(model => `- ${model}: ${JSON.stringify(supervisorStats[model])}`), '',
    '## Human-labelled metrics', '', `- ${report.supervisedMetrics.status}: ${report.supervisedMetrics.reason}`, '',
    '## Integrity', '', `- Protected-field mismatches: ${stableFieldMismatches.length}`, `- All embeddings linked: ${report.integrity.allEmbeddingsLinked}`, `- Expected result counts passed: ${report.integrity.expectedPairScores && report.integrity.expectedSupervisorScores && report.integrity.expectedRecommendations}`, '',
    '## Rollback', '', `- Full backup: ${report.rollback.fullBackup}`, `- Command: ${report.rollback.command}`
  ];
  const markdownPath = path.join(outputRoot, 'dataset-correction-v2-report.md');
  fs.writeFileSync(markdownPath, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({ status: 'completed', jsonPath, markdownPath, summary: report.executiveSummary, integrity: report.integrity, similarityStats, supervisorStats }, null, 2));
  await mongoose.disconnect();
}

run().catch(async error => { console.error(error); await mongoose.disconnect().catch(() => {}); process.exit(1); });
