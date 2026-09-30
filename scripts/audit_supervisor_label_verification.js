import mongoose from '../backend/node_modules/mongoose/index.js';

const models = ['tfidf', 'sentence_bert', 'bge_m3'];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hormuud-gpms');
  const db = mongoose.connection.db;
  const labels = await db.collection('supervisorgroundtruths').find({
    modelName: { $in: models },
    annotationStatus: 'submitted',
  }).toArray();
  const activities = await db.collection('activitylogs').find({
    actionType: 'SUPERVISOR_GROUND_TRUTH_SAVED',
  }).toArray();

  const output = {
    totalSubmitted: labels.length,
    distinctAnnotators: new Set(labels.map(row => String(row.annotatorId))).size,
    explicitSaveEvents: activities.length,
    models: {},
  };
  for (const model of models) {
    const rows = labels.filter(row => row.modelName === model);
    const sourceCounts = {};
    const gradeCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let nonEmptyReasons = 0;
    let revisedAfterCreation = 0;
    for (const row of rows) {
      const source = row.annotationSource || 'unspecified';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      gradeCounts[row.relevanceGrade] += 1;
      if (String(row.annotationReason || '').trim()) nonEmptyReasons += 1;
      if (row.createdAt && row.updatedAt && new Date(row.updatedAt).getTime() - new Date(row.createdAt).getTime() > 1000) revisedAfterCreation += 1;
    }
    const modelActivities = activities.filter(row => row.metadata?.modelName === model);
    output.models[model] = {
      submitted: rows.length,
      sourceCounts,
      gradeCounts,
      nonEmptyReasons,
      revisedAfterCreation,
      explicitSaveEvents: modelActivities.length,
      firstUpdate: rows.length ? new Date(Math.min(...rows.map(row => new Date(row.updatedAt).getTime()))).toISOString() : null,
      lastUpdate: rows.length ? new Date(Math.max(...rows.map(row => new Date(row.updatedAt).getTime()))).toISOString() : null,
    };
  }
  console.log(JSON.stringify(output, null, 2));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
