const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const db = mongoose.connection.db;
  const tag = 'RESEARCH_EXPERIMENT';
  const [projects, students, supervisors, administrator, coordinator, pairScores, supervisorScores, assignments, completedRuns] = await Promise.all([
    db.collection('projects').find({ testDataTag: tag }).toArray(),
    db.collection('users').find({ testDataTag: tag, role: 'student' }).toArray(),
    db.collection('users').find({ testDataTag: tag, role: 'supervisor' }).toArray(),
    db.collection('users').findOne({ email: 'admin.research@hu-test.local' }),
    db.collection('users').findOne({ email: 'coordinator.research@hu-test.local' }),
    db.collection('projectpairscores').find().toArray(),
    db.collection('supervisormatchscores').find().toArray(),
    db.collection('supervisorassignments').find().toArray(),
    db.collection('researchexperimentruns').find({ status: 'completed' }).toArray()
  ]);
  const countByModel = rows => Object.fromEntries(
    ['tfidf', 'sentence_bert', 'bge_m3'].map(model => [model, rows.filter(row => row.modelName === model).length])
  );
  const pairCounts = countByModel(pairScores);
  const supervisorCounts = countByModel(supervisorScores);
  const assignmentCounts = new Map(assignments.map(row => [String(row.assignedSupervisorId), 0]));
  for (const row of assignments) assignmentCounts.set(String(row.assignedSupervisorId), assignmentCounts.get(String(row.assignedSupervisorId)) + 1);
  const checks = {
    exactly78Projects: projects.length === 78,
    exactly78Students: students.length === 78,
    exactly20Supervisors: supervisors.length === 20,
    oneAdministrator: Boolean(administrator),
    oneCoordinator: Boolean(coordinator),
    everyProjectHasStudent: projects.every(project => project.student),
    everyStudentHasProject: students.every(student => student.assignedProjectId),
    allPasswordsHashed: [...students, ...supervisors, administrator, coordinator]
      .filter(Boolean).every(user => user.password !== '12345678' && /^\$2[aby]\$/.test(user.password)),
    passwordVerification: await bcrypt.compare('12345678', students[0].password),
    oldPasswordRejected: !(await bcrypt.compare('123456', students[0].password)),
    sourceRowsUnique: new Set(projects.map(project => project.sourceRow)).size === 78,
    contentHashesUnique: new Set(projects.map(project => project.contentHash)).size === 78,
    allSyntheticMarked: projects.every(project => project.syntheticContent === true),
    allTestMarked: projects.every(project => project.isTestData === true),
    exactly3003PairsPerModel: Object.values(pairCounts).every(count => count === 3003),
    noSelfPair: pairScores.every(row => String(row.firstProjectId) !== String(row.secondProjectId)),
    noDuplicatePairDirections: new Set(pairScores.map(row => {
      const ids = [String(row.firstProjectId), String(row.secondProjectId)].sort();
      return `${row.modelName}:${ids[0]}:${ids[1]}`;
    })).size === pairScores.length,
    exactly1560SupervisorScoresPerModel: Object.values(supervisorCounts).every(count => count === 1560),
    exactly78Assignments: assignments.length === 78 && new Set(assignments.map(row => String(row.projectId))).size === 78,
    everyProjectAssignedSupervisor: projects.every(project => project.supervisor),
    noSupervisorExceedsCapacity: supervisors.every(supervisor => (assignmentCounts.get(String(supervisor._id)) || 0) <= supervisor.maxProjects),
    allThreeModelConfigurationsStored: ['tfidf', 'sentence_bert', 'bge_m3'].every(model =>
      completedRuns.some(run => run.models?.includes(model) && run.configuration)
    )
  };
  console.log(JSON.stringify({ checks, pairCounts, supervisorCounts, passed: Object.values(checks).every(Boolean) }, null, 2));
  await mongoose.disconnect();
  if (!Object.values(checks).every(Boolean)) process.exit(1);
}

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
