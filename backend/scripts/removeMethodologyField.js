const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const db = mongoose.connection.db;
  const projects = await db.collection('projects').updateMany(
    {},
    { $unset: { methodology: '', 'similarityReport.breakdown.methodology': '' } }
  );
  const reports = await db.collection('similarityreports').updateMany(
    {},
    { $unset: { 'breakdown.methodology': '' } }
  );
  const categories = await db.collection('projectcategories').updateMany(
    {},
    {
      $unset: { 'similarityWeights.methodology': '' },
      $pull: { requiredProposalFields: 'methodology' }
    }
  );
  console.log(JSON.stringify({
    projectsModified: projects.modifiedCount,
    reportsModified: reports.modifiedCount,
    categoriesModified: categories.modifiedCount
  }));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
