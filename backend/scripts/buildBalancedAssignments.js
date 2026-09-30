const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const User = require('../src/models/User');
const ResearchExperimentRun = require('../src/models/ResearchExperimentRun');
const SupervisorMatchScore = require('../src/models/SupervisorMatchScore');
const SupervisorAssignment = require('../src/models/SupervisorAssignment');
const ActivityLog = require('../src/models/ActivityLog');

const TEST_TAG = 'RESEARCH_EXPERIMENT';
const DATASET_VERSION = 'project_dataset_v2_corrected_descriptions';
const outputDirectory = path.resolve(__dirname, '../../outputs/research-experiment-20260724');
const modelArgument = process.argv.find(value => value.startsWith('--models='));
const requestedModels = ((modelArgument && modelArgument.slice('--models='.length)) || process.env.RESEARCH_MODELS || 'tfidf,sentence_bert,bge_m3')
  .split(',').filter(Boolean);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const [projects, supervisors] = await Promise.all([
    Project.find({ testDataTag: TEST_TAG }).sort({ sourceRow: 1 }).lean(),
    User.find({ testDataTag: TEST_TAG, role: 'supervisor' }).sort({ researchSupervisorId: 1 }).lean()
  ]);
  if (projects.length !== 78 || supervisors.length !== 20) {
    throw new Error(`Expected 78 projects and 20 supervisors; found ${projects.length} and ${supervisors.length}`);
  }

  const latestRuns = {};
  for (const model of requestedModels) {
    latestRuns[model] = await ResearchExperimentRun.findOne({
      type: 'supervisor_matching',
      status: 'completed',
      models: model
    }).sort({ completedAt: -1 }).lean();
    if (!latestRuns[model]) throw new Error(`No completed supervisor experiment found for ${model}`);
  }
  const runIds = Object.values(latestRuns).map(run => run._id);
  const scoreRows = await SupervisorMatchScore.find({
    experimentRunId: { $in: runIds },
    modelName: { $in: requestedModels }
  }).lean();

  const scoreMap = new Map();
  for (const row of scoreRows) {
    const key = `${row.projectId}:${row.supervisorId}`;
    if (!scoreMap.has(key)) scoreMap.set(key, []);
    scoreMap.get(key).push(row);
  }

  const candidatesByProject = new Map();
  for (const project of projects) {
    const candidates = supervisors.map(supervisor => {
      const rows = scoreMap.get(`${project._id}:${supervisor._id}`) || [];
      // This command rebuilds the complete research allocation from an empty workload.
      // Eligibility in the score row reflects the pre-run workload snapshot, so reusing it
      // here can incorrectly exclude supervisors before the fresh allocation begins.
      if (rows.length !== requestedModels.length) return null;
      const average = key => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
      return {
        supervisor,
        rows,
        semanticScore: average('pureSemanticScore'),
        adjustedScore: average('finalAdjustedScore')
      };
    }).filter(Boolean).sort((a, b) => b.adjustedScore - a.adjustedScore);
    candidatesByProject.set(String(project._id), candidates);
  }

  const orderedProjects = [...projects].sort((first, second) => {
    const firstRows = candidatesByProject.get(String(first._id));
    const secondRows = candidatesByProject.get(String(second._id));
    const firstGap = (firstRows[0]?.adjustedScore || 0) - (firstRows[1]?.adjustedScore || 0);
    const secondGap = (secondRows[0]?.adjustedScore || 0) - (secondRows[1]?.adjustedScore || 0);
    return secondGap - firstGap;
  });
  const workloads = new Map(supervisors.map(supervisor => [String(supervisor._id), 0]));
  const assignments = [];

  for (const project of orderedProjects) {
    const candidates = candidatesByProject.get(String(project._id)).map(candidate => {
      const load = workloads.get(String(candidate.supervisor._id)) || 0;
      const capacity = Number(candidate.supervisor.maxProjects || 0);
      const utilization = capacity ? load / capacity : 1;
      return {
        ...candidate,
        load,
        capacity,
        balancedScore: candidate.adjustedScore - (15 * utilization)
      };
    }).filter(candidate => candidate.load < candidate.capacity)
      .sort((a, b) => b.balancedScore - a.balancedScore || b.adjustedScore - a.adjustedScore);
    if (!candidates.length) throw new Error(`No supervisor capacity remains for project ${project.title}`);
    const selected = candidates[0];
    workloads.set(String(selected.supervisor._id), selected.load + 1);
    assignments.push({
      project,
      selected,
      semanticRank: selected.rows.reduce((sum, row) => sum + Number(row.semanticRank || 0), 0) / selected.rows.length,
      adjustedRank: selected.rows.reduce((sum, row) => sum + Number(row.adjustedRank || 0), 0) / selected.rows.length
    });
  }

  const experiment = await ResearchExperimentRun.create({
    name: `Capacity-balanced supervisor assignment ${new Date().toISOString()}`,
    type: 'supervisor_matching',
    datasetVersion: DATASET_VERSION,
    descriptionVersion: DATASET_VERSION,
    randomSeed: 42,
    models: requestedModels,
    configuration: {
      method: 'mean model score with greedy capacity balancing',
      modelRuns: Object.fromEntries(Object.entries(latestRuns).map(([model, run]) => [model, String(run._id)])),
      balancePenaltyMaximum: 15,
      warning: 'Operational provisional assignment; model quality is not human-validated.'
    },
    status: 'running',
    progress: { completed: 0, total: projects.length, percentage: 0 },
    startedAt: new Date()
  });

  await SupervisorAssignment.deleteMany({ projectId: { $in: projects.map(project => project._id) } });
  await SupervisorAssignment.insertMany(assignments.map(({ project, selected, semanticRank, adjustedRank }) => ({
    experimentRunId: experiment._id,
    projectId: project._id,
    recommendedSupervisorId: selected.supervisor._id,
    assignedSupervisorId: selected.supervisor._id,
    semanticRank,
    adjustedRank,
    manualOverride: false,
    capacitySnapshot: {
      beforeAssignment: selected.load,
      afterAssignment: selected.load + 1,
      maximum: selected.capacity,
      ensembleAdjustedScore: selected.adjustedScore,
      balanceAdjustedScore: selected.balancedScore,
      models: requestedModels
    },
    explanation: `Selected from ${requestedModels.join(', ')} scores with capacity-aware load balancing.`
  })));
  for (const assignment of assignments) {
    await Project.updateOne(
      { _id: assignment.project._id, testDataTag: TEST_TAG },
      { $set: { supervisor: assignment.selected.supervisor._id } }
    );
  }
  await User.updateMany({ testDataTag: TEST_TAG, role: 'supervisor' }, { $set: { currentProjects: 0 } });
  for (const [supervisorId, count] of workloads) {
    await User.updateOne({ _id: supervisorId, testDataTag: TEST_TAG }, { $set: { currentProjects: count } });
  }

  experiment.status = 'completed';
  experiment.progress = { completed: projects.length, total: projects.length, percentage: 100 };
  experiment.resultCounts = {
    projects: projects.length,
    assignedProjects: assignments.length,
    supervisorsUsed: [...workloads.values()].filter(value => value > 0).length,
    capacityExceeded: assignments.filter(({ selected }) => selected.load + 1 > selected.capacity).length
  };
  experiment.completedAt = new Date();
  experiment.durationMs = experiment.completedAt - experiment.startedAt;
  await experiment.save();
  await ActivityLog.create({
    actionType: 'SUPERVISOR_ASSIGNMENTS_GENERATED',
    experimentRunId: experiment._id,
    status: 'success',
    metadata: experiment.resultCounts
  });

  const output = assignments.sort((a, b) => a.project.sourceRow - b.project.sourceRow).map(({ project, selected }) => ({
    projectId: String(project._id),
    projectTitle: project.title,
    supervisorId: String(selected.supervisor._id),
    supervisorCode: selected.supervisor.researchSupervisorId,
    supervisorName: selected.supervisor.name,
    ensembleAdjustedScore: Number(selected.adjustedScore.toFixed(4)),
    balanceAdjustedScore: Number(selected.balancedScore.toFixed(4)),
    workloadAfterAssignment: workloads.get(String(selected.supervisor._id)),
    maximumCapacity: selected.capacity,
    models: requestedModels.join('|'),
    status: 'provisional_not_human_validated'
  }));
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, `balanced-assignments-${experiment._id}.json`), JSON.stringify(output, null, 2));
  const headers = Object.keys(output[0]);
  const csv = [headers, ...output.map(row => headers.map(key => row[key]))]
    .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  fs.writeFileSync(path.join(outputDirectory, `balanced-assignments-${experiment._id}.csv`), csv);
  console.log(JSON.stringify({ experimentRunId: String(experiment._id), ...experiment.resultCounts, workloads: Object.fromEntries(workloads) }));
}

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}).finally(() => mongoose.disconnect().catch(() => {}));
