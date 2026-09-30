const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const Faculty = require('../src/models/Faculty');
const Program = require('../src/models/Program');
const ResearchImportRun = require('../src/models/ResearchImportRun');
const ActivityLog = require('../src/models/ActivityLog');
const { seedResearchUsers, TEST_TAG } = require('./seedResearchUsers');

const apply = process.argv.includes('--apply');
const replaceTagged = !process.argv.includes('--keep-tagged');
const databaseUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms';
const dataPath = path.resolve(__dirname, '../data/research/cleaned-projects.json');
const outputDirectory = path.resolve(__dirname, '../../outputs/research-experiment-20260724');
const backupRoot = path.resolve(__dirname, '../../backups');

const list = value => String(value || '').split(';').map(item => item.trim()).filter(Boolean);

async function executeImport(session) {
  const source = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const sourceBytes = fs.readFileSync(dataPath);
  const faculty = await Faculty.findOne({ code: 'CSIT' }).session(session || null);
  if (!faculty) throw new Error('Faculty of Computer Science and IT (CSIT) was not found');
  const requestedPrograms = ['CS-SCIENCE', 'IT-TECHNOLOGY', 'SE-ENGINEERING', 'CYB-CYBERSECURITY', 'NET-UG'];
  const programs = await Program.find({ facultyId: faculty._id, code: { $in: requestedPrograms } })
    .sort({ code: 1 }).session(session || null).lean();
  for (const program of programs) {
    const department = await mongoose.connection.db.collection('departments').findOne({ _id: program.departmentId }, { session });
    program.departmentName = department?.name || '';
  }
  if (programs.length !== 5) throw new Error(`Expected five CSIT programs, found ${programs.length}`);

  const taggedProjects = await Project.find({ testDataTag: TEST_TAG }).select('_id').session(session || null).lean();
  const preservedProjects = await Project.find({ testDataTag: { $ne: TEST_TAG } }).select('_id title').session(session || null).lean();
  const plan = {
    dryRun: !apply,
    sourceFile: source.sourceFile,
    sourceWorksheet: source.sourceWorksheet,
    notesExcluded: source.notesExcluded,
    rowsRead: source.projects.length + source.invalidRows.length + source.duplicates.length,
    validProjects: source.projects.length,
    duplicatesRemoved: source.duplicates.length,
    invalidRows: source.invalidRows.length,
    skippedRows: source.invalidRows.length,
    taggedProjectsToDelete: replaceTagged ? taggedProjects.length : 0,
    untaggedProjectsPreserved: preservedProjects.length,
    projectsToImport: source.projects.length,
    usersToCreate: 2 + source.projects.length + 20,
    warnings: [
      'Untagged existing projects are preserved because the database contains mixed historical records.',
      'Workbook descriptive content is synthetic test data inferred from project titles.',
      ...(session ? [] : ['MongoDB standalone mode: transactions are unavailable; backup-first idempotent import is used.'])
    ]
  };
  if (!apply) return plan;

  const startedAt = new Date();
  const latestBackup = fs.readdirSync(backupRoot)
    .filter(name => name.startsWith('research-before-import-')).sort().at(-1);
  const run = await ResearchImportRun.create([{
    sourceFile: source.sourceFile,
    sourceWorksheet: source.sourceWorksheet,
    sourceChecksum: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
    backupReference: latestBackup ? path.join(backupRoot, latestBackup) : '',
    dryRun: false,
    replaceTaggedTestData: replaceTagged,
    status: 'running',
    startedAt,
    warnings: plan.warnings,
    counts: {
      rowsRead: plan.rowsRead,
      validProjects: plan.validProjects,
      duplicatesRemoved: plan.duplicatesRemoved,
      invalidRows: plan.invalidRows,
      skippedRows: plan.skippedRows,
      preservedProjects: plan.untaggedProjectsPreserved
    }
  }], { session: session || undefined }).then(rows => rows[0]);

  if (replaceTagged) await Project.deleteMany({ testDataTag: TEST_TAG }).session(session || null);
  const seeded = await seedResearchUsers({
    faculty, programs, projectCount: source.projects.length, session, outputDirectory
  });
  const projects = source.projects.map((row, index) => {
    const student = seeded.studentDocs[index];
    const program = programs[index % programs.length];
    return {
      title: row.title,
      abstract: row.description,
      problemStatement: row.problemStatement,
      objectives: list(row.objectives),
      features: list(row.features),
      expectedOutputs: list(row.features),
      technologies: list(row.technologiesAndTools),
      toolsOrMethods: list(row.technologiesAndTools),
      student: student._id,
      facultyId: faculty._id,
      departmentId: program.departmentId,
      programId: program._id,
      department: program.departmentName,
      status: 'completed',
      isTestData: true,
      testDataTag: TEST_TAG,
      syntheticContent: true,
      importRunId: run._id,
      sourceFile: source.sourceFile,
      sourceWorksheet: source.sourceWorksheet,
      sourceRow: row.sourceRow,
      normalizedTitle: row.normalizedTitle,
      contentHash: row.contentHash,
      submissionDate: new Date('2026-07-24T00:00:00.000Z')
    };
  });
  const insertedProjects = await Project.insertMany(projects, { session: session || undefined, ordered: true });
  await Promise.all(insertedProjects.map((project, index) =>
    mongoose.connection.db.collection('users').updateOne(
      { _id: seeded.studentDocs[index]._id },
      { $set: { assignedProjectId: project._id } },
      { session }
    )
  ));

  const activityRows = [
    ...seeded.created.map(user => ({
      userId: user._id, userRole: user.role, actionType: 'research_test_user_created',
      importRunId: run._id, status: 'success', metadata: { email: user.email, testDataTag: TEST_TAG }
    })),
    ...insertedProjects.map(project => ({
      userId: project.student, userRole: 'student', actionType: 'research_project_imported',
      projectId: project._id, importRunId: run._id, status: 'success',
      metadata: { sourceRow: project.sourceRow, contentHash: project.contentHash, syntheticContent: true }
    }))
  ];
  await ActivityLog.insertMany(activityRows, { session: session || undefined });
  const completedAt = new Date();
  run.status = 'completed';
  run.completedAt = completedAt;
  run.durationMs = completedAt - startedAt;
  run.importedProjectIds = insertedProjects.map(project => project._id);
  run.deletedRecordIds = taggedProjects.map(project => project._id);
  run.preservedRecordIds = preservedProjects.map(project => project._id);
  run.counts.newlyCreatedRecords = insertedProjects.length;
  run.counts.updatedRecords = 0;
  run.counts.deletedProjects = replaceTagged ? taggedProjects.length : 0;
  run.counts.usersCreated = seeded.created.length;
  run.counts.supervisorsCreated = seeded.supervisorDocs.length;
  await run.save({ session: session || undefined });
  const report = {
    ...plan,
    dryRun: false,
    importRunId: run._id.toString(),
    importedProjectIds: insertedProjects.map(project => project._id.toString()),
    completedAt,
    durationMs: run.durationMs
  };
  fs.writeFileSync(path.join(outputDirectory, 'database-import-report.json'), JSON.stringify(report, null, 2), 'utf8');
  return report;
}

async function run() {
  if (process.env.NODE_ENV === 'production') throw new Error('Research import is blocked in production');
  await mongoose.connect(databaseUri);
  const session = await mongoose.startSession();
  let result;
  if (!apply) {
    result = await executeImport(null);
  } else {
    try {
      await session.withTransaction(async () => { result = await executeImport(session); });
    } catch (error) {
      if (!/Transaction numbers are only allowed|replica set|mongos/i.test(error.message)) throw error;
      console.warn('Transactions unavailable; continuing with backup-first idempotent import.');
      result = await executeImport(null);
    }
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, apply ? 'database-import-apply.json' : 'database-import-dry-run.json'),
    JSON.stringify(result, null, 2), 'utf8'
  );
  console.log(JSON.stringify(result));
  await session.endSession();
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
