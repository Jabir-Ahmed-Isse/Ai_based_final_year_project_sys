const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const { ensureProjectEmbedding } = require('../src/services/similarityService');

const DATASET_TAG = 'RESEARCH_EXPERIMENT';
const DATASET_VERSION = 'project_dataset_v2_corrected_descriptions';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const projects = await Project.find({ testDataTag: DATASET_TAG }).sort({ sourceRow: 1 });
  if (projects.length !== 78) throw new Error(`Expected 78 projects, found ${projects.length}`);
  let regenerated = 0;
  for (const project of projects) {
    if (project.datasetVersion !== DATASET_VERSION) throw new Error(`Unexpected dataset version for ${project._id}`);
    const result = await ensureProjectEmbedding(project, { persist: true });
    if (result.regenerated) regenerated += 1;
  }
  const linked = await Project.countDocuments({
    testDataTag: DATASET_TAG,
    datasetVersion: DATASET_VERSION,
    'semanticEmbedding.vector.0': { $exists: true },
    'semanticEmbedding.textHash': { $exists: true }
  });
  if (linked !== projects.length) throw new Error(`Only ${linked} of ${projects.length} projects have active embeddings`);
  console.log(JSON.stringify({ status: 'completed', projects: projects.length, regenerated, linked, datasetVersion: DATASET_VERSION }));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error); await mongoose.disconnect().catch(() => {}); process.exit(1);
});
