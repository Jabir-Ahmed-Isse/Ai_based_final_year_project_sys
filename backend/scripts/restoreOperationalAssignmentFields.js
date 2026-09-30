const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BACKUP_ROOT = path.resolve(__dirname, '../backups/before-description-correction-20260804');

const readCollection = name => mongoose.mongo.BSON.EJSON.parse(
  fs.readFileSync(path.join(BACKUP_ROOT, `${name}.ejson`), 'utf8')
);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const db = mongoose.connection.db;
  const previousProjects = readCollection('projects').filter(row => row.testDataTag === 'RESEARCH_EXPERIMENT');
  const previousSupervisors = readCollection('users').filter(row => row.testDataTag === 'RESEARCH_EXPERIMENT' && row.role === 'supervisor');

  for (const project of previousProjects) {
    const update = project.supervisor
      ? { $set: { supervisor: project.supervisor } }
      : { $unset: { supervisor: '' } };
    await db.collection('projects').updateOne({ _id: project._id }, update);
  }
  for (const supervisor of previousSupervisors) {
    await db.collection('users').updateOne(
      { _id: supervisor._id },
      { $set: { currentProjects: Number(supervisor.currentProjects || 0) } }
    );
  }
  console.log(JSON.stringify({
    status: 'restored',
    projectSupervisorFields: previousProjects.length,
    supervisorWorkloadFields: previousSupervisors.length,
    retainedGeneratedRecommendations: await db.collection('supervisorassignments').countDocuments({ projectId: { $in: previousProjects.map(row => row._id) } })
  }));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error); await mongoose.disconnect().catch(() => {}); process.exit(1);
});
