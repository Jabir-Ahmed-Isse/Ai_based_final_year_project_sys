const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const result = await mongoose.connection.db.collection('researchconfigurations').updateOne(
    { key: 'default' },
    {
      $set: {
        fieldWeights: {
          title: 0.20,
          description: 0.20,
          problem_statement: 0.20,
          research_objectives: 0.15,
          features: 0.15,
          technologies_tools: 0.10
        }
      }
    },
    { upsert: true }
  );
  console.log(JSON.stringify({
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: Boolean(result.upsertedId)
  }));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
