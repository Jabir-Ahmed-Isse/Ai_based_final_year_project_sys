const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const User = require('../src/models/User');
const ResearchExperimentRun = require('../src/models/ResearchExperimentRun');
const SupervisorMatchScore = require('../src/models/SupervisorMatchScore');
const ActivityLog = require('../src/models/ActivityLog');

const TEST_TAG = 'RESEARCH_EXPERIMENT';
const DATASET_VERSION = 'project_dataset_v2_corrected_descriptions';
const outputDirectory = path.resolve(__dirname, '../../outputs/research-experiment-20260724');
const aiUrl = process.env.PYTHON_AI_URL || 'http://127.0.0.1:5001/api/ai';
const modelArgument = process.argv.find(value => value.startsWith('--models='));
const models = ((modelArgument && modelArgument.slice('--models='.length)) || process.env.RESEARCH_MODELS || 'tfidf,sentence_bert,bge_m3').split(',').filter(Boolean);

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
  const [projects, supervisors] = await Promise.all([
    Project.find({ testDataTag: TEST_TAG }).sort({ sourceRow: 1 }).lean(),
    User.find({ testDataTag: TEST_TAG, role: 'supervisor' }).sort({ researchSupervisorId: 1 }).lean()
  ]);
  if (projects.length !== 78 || supervisors.length !== 20) {
    throw new Error(`Expected 78 projects and 20 supervisors; found ${projects.length} and ${supervisors.length}`);
  }
  const configuration = {
    models,
    batch_size: Number(process.env.RESEARCH_BATCH_SIZE || 32),
    tfidf: { word_ngram_max: 2, char_ngram_min: 3, char_ngram_max: 5, min_document_frequency: 1 }
  };
  const total = projects.length * supervisors.length * models.length;
  const experiment = await ResearchExperimentRun.create({
    name: `Supervisor matching ${new Date().toISOString()}`,
    type: 'supervisor_matching',
    datasetVersion: DATASET_VERSION,
    descriptionVersion: DATASET_VERSION,
    randomSeed: 42,
    models,
    configuration,
    status: 'running',
    progress: { completed: 0, total, percentage: 0 },
    startedAt: new Date()
  });
  try {
    const payload = await postJson(
      `${aiUrl}/research/batch-supervisor-matching`,
      { projects, supervisors, configuration },
      Number(process.env.RESEARCH_EXPERIMENT_TIMEOUT_MS || 7200000)
    );
    const result = payload.data;
    for (let index = 0; index < result.records.length; index += 500) {
      const chunk = result.records.slice(index, index + 500).map(record => ({
        experimentRunId: experiment._id,
        projectId: record.project_id,
        supervisorId: record.supervisor_id,
        modelName: record.model_name,
        modelVersion: record.model_version,
        datasetVersion: DATASET_VERSION,
        descriptionVersion: DATASET_VERSION,
        semanticExpertiseScore: record.semantic_expertise_score,
        technologyScore: record.technology_score,
        skillsScore: record.skills_score,
        previousProjectScore: record.previous_project_score,
        publicationKeywordScore: record.publication_keyword_score,
        workloadAvailabilityScore: record.workload_availability_score,
        pureSemanticScore: record.pure_semantic_score,
        finalAdjustedScore: record.final_adjusted_score,
        semanticRank: record.semantic_rank,
        adjustedRank: record.adjusted_rank,
        eligible: record.eligible,
        explanation: record.explanation,
        executionTimeMs: record.execution_time_ms
      }));
      await SupervisorMatchScore.insertMany(chunk, { ordered: false });
      experiment.progress.completed = Math.min(index + chunk.length, result.records.length);
      experiment.progress.percentage = Number((experiment.progress.completed / result.records.length * 100).toFixed(2));
      await experiment.save();
    }
    experiment.status = 'completed';
    experiment.completedAt = new Date();
    experiment.durationMs = experiment.completedAt - experiment.startedAt;
    experiment.resultCounts = {
      projects: result.project_count, supervisors: result.supervisor_count,
      storedRecords: result.record_count, expectedRecords: total
    };
    experiment.hardware = result.models;
    await experiment.save();
    await ActivityLog.create({ actionType: 'supervisor_experiment_completed', experimentRunId: experiment._id, status: 'success', metadata: experiment.resultCounts });
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, `supervisor-matching-${experiment._id}.json`), JSON.stringify({ experiment: experiment.toObject(), ...result }, null, 2));
    console.log(JSON.stringify({ experimentRunId: experiment._id, ...experiment.resultCounts }));
  } catch (error) {
    experiment.status = 'failed'; experiment.completedAt = new Date();
    experiment.durationMs = experiment.completedAt - experiment.startedAt;
    experiment.errorMessages.push(error.message); await experiment.save();
    await ActivityLog.create({ actionType: 'supervisor_experiment_failed', experimentRunId: experiment._id, status: 'failure', errorMessage: error.message });
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(error => { console.error(error); process.exit(1); });
