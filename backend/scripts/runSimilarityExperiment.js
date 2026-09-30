const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const ResearchConfiguration = require('../src/models/ResearchConfiguration');
const ResearchExperimentRun = require('../src/models/ResearchExperimentRun');
const ProjectPairScore = require('../src/models/ProjectPairScore');
const ActivityLog = require('../src/models/ActivityLog');

const TEST_TAG = 'RESEARCH_EXPERIMENT';
const DATASET_VERSION = 'project_dataset_v2_corrected_descriptions';
const outputDirectory = path.resolve(__dirname, '../../outputs/research-experiment-20260724');
const aiUrl = process.env.PYTHON_AI_URL || 'http://127.0.0.1:5001/api/ai';
const modelArgument = process.argv.find(value => value.startsWith('--models='));
const requestedModels = ((modelArgument && modelArgument.slice('--models='.length)) || process.env.RESEARCH_MODELS || 'tfidf,sentence_bert,bge_m3').split(',').filter(Boolean);

function postJson(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = Buffer.from(JSON.stringify(payload));
    const transport = target.protocol === 'https:' ? https : http;
    const request = transport.request(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed.message || `Python experiment failed with HTTP ${response.statusCode}`));
            return;
          }
          resolve(parsed);
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Python experiment exceeded ${timeoutMs} ms`)));
    request.on('error', reject);
    request.end(body);
  });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const [projects, storedConfiguration] = await Promise.all([
    Project.find({ testDataTag: TEST_TAG }).sort({ sourceRow: 1 }).lean(),
    ResearchConfiguration.findOne({ key: 'default' }).lean()
  ]);
  if (projects.length !== 78) throw new Error(`Expected 78 tagged projects, found ${projects.length}`);
  const pairCount = projects.length * (projects.length - 1) / 2;
  const configuration = {
    models: requestedModels,
    field_weights: storedConfiguration?.fieldWeights || {
      title: 0.20, description: 0.20, problem_statement: 0.20,
      research_objectives: 0.15, features: 0.15, technologies_tools: 0.10
    },
    risk_thresholds: storedConfiguration?.riskThresholds || { medium: 40, high: 70 },
    batch_size: Number(process.env.RESEARCH_BATCH_SIZE || 32),
    tfidf: {
      word_ngram_max: 2, char_ngram_min: 3, char_ngram_max: 5,
      min_document_frequency: 1, max_word_features: 30000, max_char_features: 30000
    }
  };
  const experiment = await ResearchExperimentRun.create({
    name: `Project similarity ${new Date().toISOString()}`,
    type: 'project_similarity',
    datasetVersion: DATASET_VERSION,
    descriptionVersion: DATASET_VERSION,
    randomSeed: 42,
    models: requestedModels,
    configuration,
    status: 'running',
    progress: { completed: 0, total: pairCount * requestedModels.length, percentage: 0 },
    startedAt: new Date()
  });
  try {
    const payload = await postJson(
      `${aiUrl}/research/batch-project-similarity`,
      { projects, configuration },
      Number(process.env.RESEARCH_EXPERIMENT_TIMEOUT_MS || 7200000)
    );
    const result = payload.data;
    await ProjectPairScore.deleteMany({ experimentRunId: experiment._id });
    for (let index = 0; index < result.records.length; index += 500) {
      const chunk = result.records.slice(index, index + 500).map(record => ({
        experimentRunId: experiment._id,
        firstProjectId: record.first_project_id,
        secondProjectId: record.second_project_id,
        firstProjectTitle: record.first_project_title,
        secondProjectTitle: record.second_project_title,
        modelName: record.model_name,
        modelVersion: record.model_version,
        datasetVersion: DATASET_VERSION,
        descriptionVersion: DATASET_VERSION,
        fieldScores: record.field_scores,
        weightedOverallScore: record.weighted_overall_score,
        unweightedCombinedScore: record.unweighted_combined_score,
        riskLevel: record.risk_level,
        executionTimeMs: record.execution_time_ms,
        embeddingDimension: record.embedding_dimension,
        embeddingConfiguration: configuration,
        device: record.device,
        batchSize: record.batch_size
      }));
      await ProjectPairScore.insertMany(chunk, { ordered: false });
      experiment.progress.completed = Math.min(index + chunk.length, result.records.length);
      experiment.progress.percentage = Number((experiment.progress.completed / result.records.length * 100).toFixed(2));
      await experiment.save();
    }
    experiment.status = 'completed';
    experiment.completedAt = new Date();
    experiment.durationMs = experiment.completedAt - experiment.startedAt;
    experiment.resultCounts = {
      projects: result.project_count, uniquePairs: result.unique_pair_count,
      storedRecords: result.record_count, expectedRecords: pairCount * requestedModels.length
    };
    experiment.hardware = result.models;
    await experiment.save();
    await ActivityLog.create({
      actionType: 'similarity_experiment_completed',
      experimentRunId: experiment._id,
      status: 'success',
      metadata: experiment.resultCounts
    });
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(outputDirectory, `project-similarity-${experiment._id}.json`),
      JSON.stringify({ experiment: experiment.toObject(), ...result }, null, 2)
    );
    const headers = ['experiment_run_id', 'first_project_id', 'first_project_title', 'second_project_id', 'second_project_title', 'model_name', 'weighted_overall_score', 'unweighted_combined_score', 'risk_level', 'execution_time_ms'];
    const csv = [headers, ...result.records.map(record => [
      experiment._id, record.first_project_id, record.first_project_title,
      record.second_project_id, record.second_project_title, record.model_name,
      record.weighted_overall_score, record.unweighted_combined_score,
      record.risk_level, record.execution_time_ms
    ])].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    fs.writeFileSync(path.join(outputDirectory, `project-similarity-${experiment._id}.csv`), csv);
    console.log(JSON.stringify({ experimentRunId: experiment._id, ...experiment.resultCounts }));
  } catch (error) {
    experiment.status = 'failed';
    experiment.completedAt = new Date();
    experiment.durationMs = experiment.completedAt - experiment.startedAt;
    experiment.errorMessages.push(error.message);
    await experiment.save();
    await ActivityLog.create({ actionType: 'similarity_experiment_failed', experimentRunId: experiment._id, status: 'failure', errorMessage: error.message });
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
