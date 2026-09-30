import mongoose from '../backend/node_modules/mongoose/index.js';

async function aggregate(db, collection, pipeline) {
  return db.collection(collection).aggregate(pipeline).toArray();
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hormuud-gpms');
  const db = mongoose.connection.db;

  const similarityAnnotations = await aggregate(db, 'humanevaluations', [
    {
      $group: {
        _id: {
          dataset: '$datasetName',
          model: '$modelName',
          role: '$evaluatorRole',
          status: '$annotationStatus',
        },
        records: { $sum: 1 },
        annotators: { $addToSet: '$evaluatorId' },
        sources: { $addToSet: '$annotationSource' },
      },
    },
    {
      $project: {
        records: 1,
        annotatorCount: { $size: '$annotators' },
        sources: 1,
      },
    },
  ]);

  const consensus = await aggregate(db, 'annotationconsensus', [
    {
      $group: {
        _id: { dataset: '$datasetName', model: '$modelName', status: '$status' },
        records: { $sum: 1 },
        meanAnnotators: { $avg: '$annotatorCount' },
        minimumAnnotators: { $min: '$annotatorCount' },
        maximumAnnotators: { $max: '$annotatorCount' },
        meanAgreement: { $avg: '$agreementRatio' },
      },
    },
  ]);

  const supervisorGroundTruth = await aggregate(db, 'supervisorgroundtruths', [
    {
      $group: {
        _id: {
          dataset: '$datasetName',
          model: '$modelName',
          status: '$annotationStatus',
          source: '$annotationSource',
        },
        records: { $sum: 1 },
        annotators: { $addToSet: '$annotatorId' },
        grades: { $push: '$relevanceGrade' },
      },
    },
    {
      $project: {
        records: 1,
        annotatorCount: { $size: '$annotators' },
        grade0: {
          $size: { $filter: { input: '$grades', as: 'grade', cond: { $eq: ['$$grade', 0] } } },
        },
        grade1: {
          $size: { $filter: { input: '$grades', as: 'grade', cond: { $eq: ['$$grade', 1] } } },
        },
        grade2: {
          $size: { $filter: { input: '$grades', as: 'grade', cond: { $eq: ['$$grade', 2] } } },
        },
        grade3: {
          $size: { $filter: { input: '$grades', as: 'grade', cond: { $eq: ['$$grade', 3] } } },
        },
      },
    },
  ]);

  console.log(JSON.stringify({ similarityAnnotations, consensus, supervisorGroundTruth }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
