const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const Project = require('../models/Project');
const ProjectModelComparison = require('../models/ProjectModelComparison');
const HumanEvaluation = require('../models/HumanEvaluation');
const AnnotationConsensus = require('../models/AnnotationConsensus');
const SupervisorGroundTruth = require('../models/SupervisorGroundTruth');
const ResearchConfiguration = require('../models/ResearchConfiguration');
const ResearchExperiment = require('../models/ResearchExperiment');
const ResearchExperimentRun = require('../models/ResearchExperimentRun');
const ResearchImportRun = require('../models/ResearchImportRun');
const ProjectPairScore = require('../models/ProjectPairScore');
const SupervisorMatchScore = require('../models/SupervisorMatchScore');
const SupervisorAssignment = require('../models/SupervisorAssignment');
const ActivityLog = require('../models/ActivityLog');
const GeneratedResearchReport = require('../models/GeneratedResearchReport');
const User = require('../models/User');
const {
  MODEL_ORDER,
  buildResearchAnalytics,
  pairKey
} = require('../services/researchAnalytics');

const router = express.Router();
const admin = [protect, authorize('admin', 'coordinator')];
const annotator = [protect, authorize('admin', 'coordinator', 'supervisor')];
const aiBase = process.env.PYTHON_AI_URL || process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001/api/ai';
const researchTag = 'RESEARCH_EXPERIMENT';
const getResearchRunIds = () => ResearchExperimentRun.distinct('_id', { datasetTag: researchTag });

const respondError = (res, error) => {
  console.error('[research]', error);
  res.status(error.status || 500).json({ status: 'error', message: error.message || 'Research operation failed' });
};
const callAI = async (path, payload) => {
  const response = await fetch(`${aiBase.replace(/\/$/, '')}/research/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.RESEARCH_AI_TIMEOUT_MS || 900000))
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || 'AI research service failed'); error.status = response.status; throw error;
  }
  return result.data;
};
const getAI = async (path) => {
  const response = await fetch(`${aiBase.replace(/\/$/, '')}/research/${path}`, {
    signal: AbortSignal.timeout(30000)
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || 'AI research service failed'); error.status = response.status; throw error;
  }
  return result.data;
};
const validation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ status: 'error', errors: errors.array() });
  next();
};
const pageOptions = req => ({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(500, Math.max(1, Number(req.query.limit) || 50))
});
const paged = async (Model, match, req, populate = [], sort = { createdAt: -1 }, select = '') => {
  const { page, limit } = pageOptions(req);
  let query = Model.find(match).sort(sort).skip((page - 1) * limit).limit(limit);
  for (const value of populate) query = query.populate(value);
  if (select) query = query.select(select);
  const [rows, total] = await Promise.all([query.lean(), Model.countDocuments(match)]);
  return { rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};
const regex = value => value ? new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : undefined;
const csvCell = value => {
  const normalized = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
};
const sendCsv = (res, filename, rows) => {
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const csv = [headers.map(csvCell).join(','), ...rows.map(row => headers.map(key => csvCell(row[key])).join(','))].join('\n');
  res.type('text/csv').attachment(filename).send(csv);
};
const recordActivity = (req, actionType, metadata = {}) => ActivityLog.create({
  userId: req.user?._id,
  userRole: req.user?.role,
  actionType,
  ipAddress: req.ip,
  status: 'success',
  metadata
}).catch(error => console.error('[research activity]', error.message));

router.get('/configuration', admin, async (_req, res) => {
  const config = await ResearchConfiguration.findOneAndUpdate(
    { key: 'default' }, { $setOnInsert: { key: 'default' } }, { new: true, upsert: true }
  );
  res.json({ status: 'success', data: config });
});
router.get('/models', admin, async (_req, res) => {
  try { res.json({ status: 'success', data: await getAI('models') }); }
  catch (error) { respondError(res, error); }
});
router.put('/configuration', admin, async (req, res) => {
  try {
    const weights = req.body.fieldWeights;
    if (weights && Math.abs(Object.values(weights).reduce((a, b) => a + Number(b), 0) - 1) > 0.000001) {
      return res.status(422).json({ status: 'error', message: 'Field weights must total 100%' });
    }
    const data = await ResearchConfiguration.findOneAndUpdate(
      { key: 'default' }, { ...req.body, updatedBy: req.user._id }, { new: true, upsert: true, runValidators: true }
    );
    res.json({ status: 'success', data });
  } catch (error) { respondError(res, error); }
});

router.get('/overview', admin, async (req, res) => {
  try {
    const [
      projects, students, supervisors, administrators, coordinators,
      projectRuns, supervisorRuns, pairScores, supervisorScores,
      annotations, consensusRows, importRuns, activityLogs
    ] = await Promise.all([
      Project.countDocuments({ testDataTag: researchTag }),
      User.countDocuments({ testDataTag: researchTag, role: 'student' }),
      User.countDocuments({ testDataTag: researchTag, role: 'supervisor' }),
      User.countDocuments({ testDataTag: researchTag, role: 'admin' }),
      User.countDocuments({ testDataTag: researchTag, role: 'coordinator' }),
      ResearchExperimentRun.countDocuments({ datasetTag: researchTag, type: 'project_similarity' }),
      ResearchExperimentRun.countDocuments({ datasetTag: researchTag, type: 'supervisor_matching' }),
      ProjectPairScore.countDocuments(),
      SupervisorMatchScore.countDocuments(),
      HumanEvaluation.countDocuments(),
      AnnotationConsensus.countDocuments(),
      ResearchImportRun.countDocuments(),
      ActivityLog.countDocuments()
    ]);
    const latestRuns = await ResearchExperimentRun.find({ datasetTag: researchTag })
      .sort({ startedAt: -1 }).limit(8).lean();
    const modelSummary = await ProjectPairScore.aggregate([
      { $group: {
        _id: '$modelName',
        records: { $sum: 1 },
        averageScore: { $avg: '$weightedOverallScore' },
        averageTimeMs: { $avg: '$executionTimeMs' },
        minimumScore: { $min: '$weightedOverallScore' },
        maximumScore: { $max: '$weightedOverallScore' }
      } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ status: 'success', data: {
      counts: { projects, students, supervisors, administrators, coordinators, projectRuns, supervisorRuns, pairScores, supervisorScores, annotations, consensusRows, importRuns, activityLogs },
      expected: { projects: 78, students: 78, supervisors: 20, uniquePairsPerModel: 3003, supervisorScoresPerModel: 1560 },
      latestRuns,
      modelSummary,
      groundTruthStatus: annotations > 0
        ? 'Human annotations exist; metrics remain provisional until consensus and held-out test requirements are met.'
        : 'No human-validated ground truth. Accuracy, precision, recall and F1 are intentionally not reported.'
    } });
  } catch (error) { respondError(res, error); }
});

router.get('/analytics', admin, async (_req, res) => {
  try {
    const [researchRunIds, researchProjectIds] = await Promise.all([
      getResearchRunIds(),
      Project.distinct('_id', { testDataTag: researchTag })
    ]);
    const [
      pairScores,
      supervisorScores,
      assignments,
      supervisors,
      humanEvaluationRows,
      consensusRows,
      supervisorGroundTruthRows,
      configuration
    ] = await Promise.all([
      ProjectPairScore.find({ experimentRunId: { $in: researchRunIds }, modelName: { $in: MODEL_ORDER } })
        .sort({ createdAt: 1 })
        .select('experimentRunId firstProjectId secondProjectId firstProjectTitle secondProjectTitle modelName modelVersion fieldScores weightedOverallScore unweightedCombinedScore riskLevel executionTimeMs device createdAt')
        .lean(),
      SupervisorMatchScore.find({ experimentRunId: { $in: researchRunIds }, modelName: { $in: MODEL_ORDER } })
        .sort({ createdAt: 1 })
        .select('experimentRunId projectId supervisorId modelName pureSemanticScore finalAdjustedScore executionTimeMs eligible createdAt')
        .lean(),
      SupervisorAssignment.find({ experimentRunId: { $in: researchRunIds } })
        .select('projectId assignedSupervisorId recommendedSupervisorId capacitySnapshot createdAt')
        .lean(),
      User.find({ testDataTag: researchTag, role: 'supervisor' })
        .sort({ researchSupervisorId: 1 })
        .select('name researchSupervisorId currentProjects maxProjects')
        .lean(),
      HumanEvaluation.find({
        firstProjectId: { $in: researchProjectIds },
        secondProjectId: { $in: researchProjectIds },
        annotationStatus: 'submitted'
      }).sort({ evaluationDate: 1, updatedAt: 1 }).lean(),
      AnnotationConsensus.find({ firstProjectId: { $in: researchProjectIds }, secondProjectId: { $in: researchProjectIds }, status: 'consensus', annotatorCount: { $gte: 2 } }).lean(),
      SupervisorGroundTruth.find({ projectId: { $in: researchProjectIds }, annotationStatus: 'submitted' }).sort({ updatedAt: 1 }).lean(),
      ResearchConfiguration.findOne({ key: 'default' }).lean()
    ]);

    const analytics = buildResearchAnalytics({
      pairScores,
      supervisorScores,
      assignments,
      supervisors
    });

    const latestSupervisorLabels = new Map();
    for (const row of supervisorGroundTruthRows) {
      const evaluationModel = row.modelName || String(row.datasetName || '').split(':').pop();
      if (!MODEL_ORDER.includes(evaluationModel)) continue;
      latestSupervisorLabels.set(`${evaluationModel}:${row.projectId}:${row.supervisorId}`, row);
    }
    const latestSupervisorScores = new Map();
    for (const row of supervisorScores) {
      latestSupervisorScores.set(`${row.modelName}:${row.projectId}:${row.supervisorId}`, row);
    }
    const supervisorEvaluationResults = {};
    for (const model of MODEL_ORDER) {
      const observations = [];
      for (const [labelKey, label] of latestSupervisorLabels.entries()) {
        if (!labelKey.startsWith(`${model}:`)) continue;
        const modelScore = latestSupervisorScores.get(labelKey);
        if (!modelScore) continue;
        observations.push({
          actual: Number(label.consensusRelevanceGrade ?? label.relevanceGrade) >= 2 ? 1 : 0,
          score: Number(modelScore.finalAdjustedScore || 0)
        });
      }
      const metricsAtThreshold = threshold => {
        let truePositive = 0; let trueNegative = 0; let falsePositive = 0; let falseNegative = 0;
        for (const observation of observations) {
          const predicted = observation.score >= threshold ? 1 : 0;
          if (observation.actual === 1 && predicted === 1) truePositive += 1;
          else if (observation.actual === 0 && predicted === 0) trueNegative += 1;
          else if (observation.actual === 0 && predicted === 1) falsePositive += 1;
          else falseNegative += 1;
        }
        const sampleSize = observations.length;
        const accuracy = sampleSize ? (truePositive + trueNegative) / sampleSize : null;
        const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
        const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
        const f1Score = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
        const mccDenominator = Math.sqrt((truePositive + falsePositive) * (truePositive + falseNegative) * (trueNegative + falsePositive) * (trueNegative + falseNegative));
        return {
          threshold, sampleSize, truePositive, trueNegative, falsePositive, falseNegative,
          accuracy, precision, recall, f1Score,
          matthewsCorrelationCoefficient: mccDenominator
            ? ((truePositive * trueNegative) - (falsePositive * falseNegative)) / mccDenominator
            : 0
        };
      };
      const configuredThreshold = Number(configuration?.classificationThresholds?.[model] ?? 70);
      const candidates = [...new Set(observations.map(row => row.score))];
      let selected = metricsAtThreshold(configuredThreshold);
      for (const candidate of candidates) {
        const measured = metricsAtThreshold(candidate);
        if (measured.f1Score > selected.f1Score || (measured.f1Score === selected.f1Score && Number(measured.accuracy || 0) > Number(selected.accuracy || 0))) {
          selected = measured;
        }
      }
      supervisorEvaluationResults[model] = {
        ...selected,
        configuredThreshold,
        thresholdSelection: observations.length ? 'f1_optimized_from_submitted_labels' : 'configured_default'
      };
    }
    const rankedSupervisorModels = MODEL_ORDER
      .map(model => ({ model, ...supervisorEvaluationResults[model] }))
      .filter(row => row.sampleSize > 0)
      .sort((left, right) => right.f1Score - left.f1Score || right.accuracy - left.accuracy);
    const supervisorEvaluation = {
      status: rankedSupervisorModels.length ? 'available_provisional' : 'awaiting_expert_labels',
      source: 'supervisor_ground_truth',
      labelledPairs: latestSupervisorLabels.size,
      labelledModelPairs: latestSupervisorLabels.size,
      results: supervisorEvaluationResults,
      bestModel: rankedSupervisorModels[0]?.model || null,
      note: rankedSupervisorModels.length
        ? 'Each supervisor model uses its own F1-optimised decision threshold calculated from that model’s submitted annotations. Accuracy, precision, recall, F1, MCC and confusion-matrix counts are provisional in-sample measurements.'
        : 'Save independent supervisor relevance labels for each model before selecting the best assignment model.'
    };

    const pairLookup = new Map();
    for (const row of pairScores) {
      const key = pairKey(row);
      if (!pairLookup.has(key)) pairLookup.set(key, {});
      pairLookup.get(key)[row.modelName] = row;
    }
    const classificationThresholds = Object.fromEntries(MODEL_ORDER.map(model => [
      model,
      Number(configuration?.classificationThresholds?.[model] ?? 70)
    ]));
    const reviewsByModelPair = new Map();
    for (const review of humanEvaluationRows) {
      if (!MODEL_ORDER.includes(review.modelName)) continue;
      const key = `${review.modelName}:${pairKey(review)}`;
      if (!reviewsByModelPair.has(key)) reviewsByModelPair.set(key, []);
      reviewsByModelPair.get(key).push(review);
    }
    let singleReviewedPairs = 0;
    let multiReviewedPairs = 0;
    let disputedPairs = 0;
    const perModel = {};
    const results = {};
    let evaluationServiceUnavailable = false;
    for (const model of MODEL_ORDER) {
      const resolvedReviews = [];
      for (const [modelPairKey, reviews] of reviewsByModelPair.entries()) {
        if (!modelPairKey.startsWith(`${model}:`)) continue;
        const binaryLabels = new Set(reviews.map(row => Number(row.binaryLabel)));
        let reviewerStatus = 'single_reviewed';
        let groundTruth = reviews[reviews.length - 1];
        if (reviews.length === 1) singleReviewedPairs += 1;
        else if (binaryLabels.size === 1) { reviewerStatus = 'multi_reviewed'; multiReviewedPairs += 1; }
        else {
          reviewerStatus = 'disputed';
          disputedPairs += 1;
          groundTruth = reviews[0];
        }
        resolvedReviews.push({ key: modelPairKey.slice(model.length + 1), groundTruth, reviews, reviewerStatus });
      }
      const usable = resolvedReviews
        .map(review => ({ ...review, score: pairLookup.get(review.key)?.[model] }))
        .filter(row => row.groundTruth.binaryLabel != null && row.score);
      const modelConsensusRecords = consensusRows.filter(row => row.modelName === model).length;
      perModel[model] = {
        labelledPairs: resolvedReviews.length,
        sampleSize: usable.length,
        unlabelledPairs: Math.max(0, pairLookup.size - resolvedReviews.length),
        labelledPercentage: pairLookup.size ? (resolvedReviews.length / pairLookup.size) * 100 : 0,
        consensusRecords: modelConsensusRecords
      };
      if (!usable.length) continue;
      const humanScoresAvailable = usable.every(row => row.groundTruth.humanSimilarityPercentage != null);
      try {
        const modelResult = await callAI('evaluate', {
          labels: usable.map(row => Number(row.groundTruth.binaryLabel)),
          humanScores: humanScoresAvailable
            ? usable.map(row => Number(row.groundTruth.humanSimilarityPercentage))
            : undefined,
          modelScores: { [model]: usable.map(row => Number(row.score.weightedOverallScore)) },
          processingTimes: { [model]: usable.map(row => Number(row.score.executionTimeMs || 0)) },
          classificationThresholds: { [model]: classificationThresholds[model] },
          significanceLevel: Number(configuration?.significanceLevel ?? 0.05),
          thresholds: [50, 55, 60, 65, 70, 75, 80]
        });
        results[model] = modelResult[model];
        perModel[model].humanScoresAvailable = humanScoresAvailable;
      } catch (evaluationError) {
        evaluationServiceUnavailable = true;
        console.error(`Similarity evaluation service unavailable for ${model}:`, evaluationError.message);
      }
    }
    const labelledPairs = reviewsByModelPair.size;
    const sampleSize = Object.values(perModel).reduce((sum, row) => sum + row.sampleSize, 0);
    const evaluation = {
      status: sampleSize
        ? (evaluationServiceUnavailable && !Object.keys(results).length ? 'evaluation_service_unavailable' : 'available_preliminary')
        : 'awaiting_human_labels',
      source: 'model_specific_single_or_multi_reviewer_ground_truth',
      sampleSize,
      totalPairs: pairLookup.size * MODEL_ORDER.length,
      labelledPairs,
      unlabelledPairs: Math.max(0, (pairLookup.size * MODEL_ORDER.length) - labelledPairs),
      labelledPercentage: pairLookup.size ? labelledPairs / (pairLookup.size * MODEL_ORDER.length) * 100 : 0,
      singleReviewedPairs,
      multiReviewedPairs,
      disputedPairs,
      consensusRecords: consensusRows.length,
      classificationThresholds,
      perModel,
      results: Object.keys(results).length ? results : null,
      note: sampleSize
        ? 'Every similarity model uses only the human labels saved specifically for that model. Labels from another model cannot affect these metrics.'
        : 'Choose a similarity model and save labels for it. Each model has a separate annotation queue and separate metrics.'
    };

    res.json({
      status: 'success',
      data: {
        ...analytics,
        evaluation,
        supervisorEvaluation,
        generatedAt: new Date(),
        dataBoundary: 'Descriptive charts use recorded database scores. Classification metrics begin with one authorised human label and are marked preliminary until sufficient review; synthetic construction targets are excluded.'
      }
    });
  } catch (error) { respondError(res, error); }
});

router.get('/import-runs', admin, async (req, res) => {
  try { res.json({ status: 'success', data: await paged(ResearchImportRun, {}, req) }); }
  catch (error) { respondError(res, error); }
});

router.get('/test-users', admin, async (req, res) => {
  try {
    const match = { testDataTag: researchTag };
    if (req.query.role) match.role = req.query.role;
    if (req.query.search) {
      const query = regex(req.query.search);
      match.$or = [{ name: query }, { email: query }, { studentId: query }, { researchSupervisorId: query }];
    }
    const data = await paged(
      User, match, req,
      ['facultyId departmentId programId assignedProjectId'],
      { role: 1, email: 1 },
      '-password'
    );
    res.json({ status: 'success', data });
  } catch (error) { respondError(res, error); }
});

router.get('/test-projects', admin, async (req, res) => {
  try {
    const match = { testDataTag: researchTag };
    if (req.query.search) {
      const query = regex(req.query.search);
      match.$or = [{ title: query }, { abstract: query }, { normalizedTitle: query }];
    }
    const data = await paged(
      Project, match, req,
      [{ path: 'student', select: 'name email studentId' }, { path: 'programId', select: 'name' }],
      { sourceRow: 1 },
      '-semanticEmbedding.vector'
    );
    res.json({ status: 'success', data });
  } catch (error) { respondError(res, error); }
});

router.get('/supervisor-profiles', admin, async (req, res) => {
  try {
    const match = { testDataTag: researchTag, role: 'supervisor' };
    if (req.query.supervisorId) match._id = req.query.supervisorId;
    if (req.query.search) {
      const query = regex(req.query.search);
      match.$or = [{ name: query }, { email: query }, { academicSpecialization: query }, { areasOfExpertise: query }];
    }
    const data = await paged(User, match, req, ['facultyId departmentId'], { researchSupervisorId: 1 }, '-password');
    res.json({ status: 'success', data });
  } catch (error) { respondError(res, error); }
});

router.get('/experiment-runs', admin, async (req, res) => {
  try {
    const match = { datasetTag: researchTag };
    if (req.query.type) match.type = req.query.type;
    if (req.query.status) match.status = req.query.status;
    if (req.query.model) match.models = req.query.model;
    if (req.query.startDate || req.query.endDate) {
      match.startedAt = {};
      if (req.query.startDate) match.startedAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) match.startedAt.$lte = new Date(req.query.endDate);
    }
    res.json({ status: 'success', data: await paged(ResearchExperimentRun, match, req, [], { startedAt: -1 }) });
  } catch (error) { respondError(res, error); }
});

router.get('/pair-scores', admin, async (req, res) => {
  try {
    const researchRunIds = await getResearchRunIds();
    const requestedRun = req.query.experimentRunId ? String(req.query.experimentRunId) : '';
    const allowedRunIds = requestedRun
      ? researchRunIds.filter(id => String(id) === requestedRun)
      : researchRunIds;
    const match = { experimentRunId: { $in: allowedRunIds } };
    if (req.query.model) match.modelName = req.query.model;
    if (req.query.risk) match.riskLevel = regex(req.query.risk);
    if (req.query.projectId) match.$or = [{ firstProjectId: req.query.projectId }, { secondProjectId: req.query.projectId }];
    const data = await paged(
      ProjectPairScore, match, req,
      [{ path: 'firstProjectId', select: 'title sourceRow' }, { path: 'secondProjectId', select: 'title sourceRow' }],
      { weightedOverallScore: -1 }
    );
    recordActivity(req, 'SIMILARITY_RESULT_VIEWED', { filters: req.query, resultCount: data.rows.length });
    res.json({ status: 'success', data });
  } catch (error) { respondError(res, error); }
});

router.get('/pair-comparison/:firstProjectId/:secondProjectId', admin, async (req, res) => {
  try {
    const ids = [req.params.firstProjectId, req.params.secondProjectId].sort();
    if (ids[0] === ids[1]) return res.status(422).json({ status: 'error', message: 'Choose two different recorded projects' });
    const projects = await Project.find({ _id: { $in: ids }, testDataTag: researchTag })
      .select('title sourceRow').lean();
    if (projects.length !== 2) return res.status(404).json({ status: 'error', message: 'Both projects must belong to the recorded research dataset' });
    const researchRunIds = await getResearchRunIds();
    const rows = await ProjectPairScore.find({
      experimentRunId: { $in: researchRunIds },
      $or: [
        { firstProjectId: ids[0], secondProjectId: ids[1] },
        { firstProjectId: ids[1], secondProjectId: ids[0] }
      ]
    }).sort({ createdAt: -1 }).lean();
    const latestByModel = {};
    for (const row of rows) if (!latestByModel[row.modelName]) latestByModel[row.modelName] = row;
    recordActivity(req, 'SIMILARITY_RESULT_VIEWED', { firstProjectId: ids[0], secondProjectId: ids[1], models: Object.keys(latestByModel) });
    res.json({ status: 'success', data: { projects, models: latestByModel } });
  } catch (error) { respondError(res, error); }
});

router.get('/supervisor-scores', admin, async (req, res) => {
  try {
    const researchRunIds = await getResearchRunIds();
    const requestedRun = req.query.experimentRunId ? String(req.query.experimentRunId) : '';
    const allowedRunIds = requestedRun
      ? researchRunIds.filter(id => String(id) === requestedRun)
      : researchRunIds;
    const match = { experimentRunId: { $in: allowedRunIds } };
    if (req.query.model) match.modelName = req.query.model;
    if (req.query.projectId) match.projectId = req.query.projectId;
    if (req.query.supervisorId) match.supervisorId = req.query.supervisorId;
    if (req.query.eligible != null && req.query.eligible !== '') match.eligible = req.query.eligible === 'true';
    const data = await paged(
      SupervisorMatchScore, match, req,
      [{ path: 'projectId', select: 'title sourceRow' }, { path: 'supervisorId', select: 'name email researchSupervisorId academicSpecialization currentProjects maxProjects' }],
      { adjustedRank: 1, finalAdjustedScore: -1, _id: 1 }
    );
    recordActivity(req, 'SUPERVISOR_RECOMMENDATION_VIEWED', { filters: req.query, resultCount: data.rows.length });
    res.json({ status: 'success', data });
  } catch (error) { respondError(res, error); }
});

router.get('/activity-logs', admin, async (req, res) => {
  try {
    const match = {};
    if (req.query.actionType) match.actionType = req.query.actionType;
    if (req.query.model) match.modelName = req.query.model;
    if (req.query.experimentRunId) match.experimentRunId = req.query.experimentRunId;
    res.json({ status: 'success', data: await paged(ActivityLog, match, req, ['userId projectId supervisorId'], { createdAt: -1 }) });
  } catch (error) { respondError(res, error); }
});

router.post('/comparisons', admin,
  body('firstProjectId').isMongoId(), body('secondProjectId').isMongoId(), validation,
  async (req, res) => {
    try {
      const [firstProject, secondProject, config] = await Promise.all([
        Project.findById(req.body.firstProjectId).lean(),
        Project.findById(req.body.secondProjectId).lean(),
        ResearchConfiguration.findOne({ key: 'default' }).lean()
      ]);
      if (!firstProject || !secondProject) return res.status(404).json({ status: 'error', message: 'Project not found' });
      if (String(firstProject._id) === String(secondProject._id)) {
        return res.status(422).json({ status: 'error', message: 'Choose two different recorded projects' });
      }
      const configuration = config ? {
        field_weights: config.fieldWeights, risk_thresholds: config.riskThresholds,
        agreement_thresholds: config.agreementThresholds
      } : undefined;
      const result = await callAI('project-comparison', { firstProject, secondProject, configuration });
      const saved = await ProjectModelComparison.create({
        firstProjectId: firstProject._id, secondProjectId: secondProject._id,
        models: result.models, missingFields: result.missing_fields, fieldWeights: result.field_weights,
        riskThresholds: result.risk_thresholds, agreementThresholds: result.agreement_thresholds,
        agreement: result.agreement, requestedBy: req.user._id
      });
      res.status(201).json({ status: 'success', data: saved });
    } catch (error) { respondError(res, error); }
  }
);
router.get('/comparisons', admin, async (req, res) => {
  const data = await ProjectModelComparison.find(req.query.projectId ? {
    $or: [{ firstProjectId: req.query.projectId }, { secondProjectId: req.query.projectId }]
  } : {}).populate('firstProjectId secondProjectId', 'title').sort({ createdAt: -1 }).limit(500);
  res.json({ status: 'success', data });
});

router.post('/labels', annotator,
  body('firstProjectId').isMongoId(), body('secondProjectId').isMongoId(),
  body('relationLabel').isIn([0, 1, 2]),
  body('modelName').isIn(MODEL_ORDER),
  body('humanSimilarityPercentage').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('datasetName').trim().notEmpty(), validation,
  async (req, res) => {
    try {
      if (req.body.firstProjectId === req.body.secondProjectId) {
        return res.status(422).json({ status: 'error', message: 'A project cannot be annotated against itself' });
      }
      const [firstProjectId, secondProjectId] = [req.body.firstProjectId, req.body.secondProjectId].sort();
      const data = await HumanEvaluation.findOneAndUpdate(
        { firstProjectId, secondProjectId, evaluatorId: req.user._id, datasetName: req.body.datasetName, modelName: req.body.modelName },
        {
          ...req.body,
          firstProjectId,
          secondProjectId,
          binaryLabel: Number(req.body.relationLabel) > 0 ? 1 : 0,
          evaluatorId: req.user._id,
          evaluatorRole: req.user.role,
          evaluationDate: new Date()
        },
        { new: true, upsert: true, runValidators: true }
      );
      const labels = await HumanEvaluation.find({ firstProjectId, secondProjectId, datasetName: req.body.datasetName, modelName: req.body.modelName }).lean();
      const counts = [0, 1, 2].map(label => labels.filter(row => row.relationLabel === label).length);
      const maximum = Math.max(...counts);
      const relationLabel = counts.indexOf(maximum);
      const agreementRatio = labels.length ? maximum / labels.length : 0;
      const consensus = await AnnotationConsensus.findOneAndUpdate(
        { firstProjectId, secondProjectId, datasetName: req.body.datasetName, modelName: req.body.modelName },
        {
          modelName: req.body.modelName,
          annotatorCount: labels.length,
          relationLabel,
          binaryLabel: relationLabel > 0 ? 1 : 0,
          humanSimilarityPercentage: labels.some(row => row.humanSimilarityPercentage != null)
            ? labels.reduce((sum, row) => sum + Number(row.humanSimilarityPercentage || 0), 0) / labels.filter(row => row.humanSimilarityPercentage != null).length
            : undefined,
          agreementRatio,
          labelCounts: { different: counts[0], partiallyRelated: counts[1], highlySimilar: counts[2] },
          status: labels.length < 2 ? 'needs_more_labels' : agreementRatio > 0.5 ? 'consensus' : 'adjudication_required',
          computedAt: new Date()
        },
        { new: true, upsert: true, runValidators: true }
      );
      recordActivity(req, 'ANNOTATION_SAVED', { datasetName: req.body.datasetName, modelName: req.body.modelName, firstProjectId, secondProjectId, relationLabel: Number(req.body.relationLabel) });
      res.status(201).json({ status: 'success', data, consensus });
    } catch (error) { respondError(res, error); }
  }
);
router.get('/labels', annotator, async (req, res) => {
  const match = req.query.datasetName ? { datasetName: req.query.datasetName } : {};
  if (req.query.model) match.modelName = req.query.model;
  const rows = await HumanEvaluation.find(match).populate('firstProjectId secondProjectId evaluatorId', 'title name').sort({ evaluationDate: -1 });
  res.json({ status: 'success', data: rows });
});
router.get('/annotation-queue', annotator, async (req, res) => {
  try {
    const model = String(req.query.model || 'sentence_bert');
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const match = { modelName: model };
    if (req.query.risk) match.riskLevel = regex(req.query.risk);
    if (req.query.experimentRunId) match.experimentRunId = req.query.experimentRunId;
    const already = await HumanEvaluation.find({ evaluatorId: req.user._id, datasetName: req.query.datasetName || 'human-validation-v1', modelName: model })
      .select('firstProjectId secondProjectId').lean();
    const excluded = new Set(already.map(row => `${row.firstProjectId}:${row.secondProjectId}`));
    const candidates = await ProjectPairScore.find(match)
      .sort({ weightedOverallScore: -1 })
      .limit(Math.min(3003, limit * 8))
      .populate('firstProjectId secondProjectId', 'title abstract problemStatement objectives features technologies toolsOrMethods sourceRow')
      .lean();
    const stride = Math.max(1, Math.floor(candidates.length / limit));
    const rows = [];
    for (let index = 0; index < candidates.length && rows.length < limit; index += stride) {
      const row = candidates[index];
      if (!excluded.has(`${row.firstProjectId._id}:${row.secondProjectId._id}`)) rows.push(row);
    }
    res.json({ status: 'success', data: rows, datasetName: req.query.datasetName || 'human-validation-v1' });
  } catch (error) { respondError(res, error); }
});
router.get('/annotation-consensus', admin, async (req, res) => {
  try {
    const match = {};
    if (req.query.datasetName) match.datasetName = req.query.datasetName;
    if (req.query.model) match.modelName = req.query.model;
    if (req.query.status) match.status = req.query.status;
    res.json({ status: 'success', data: await paged(
      AnnotationConsensus,
      match,
      req,
      ['firstProjectId secondProjectId'],
      { updatedAt: -1 }
    ) });
  } catch (error) { respondError(res, error); }
});

router.post('/supervisor-ground-truth', annotator,
  body('projectId').isMongoId(),
  body('supervisorId').isMongoId(),
  body('relevanceGrade').isIn([0, 1, 2, 3]),
  body('modelName').isIn(MODEL_ORDER),
  body('datasetName').trim().notEmpty(),
  validation,
  async (req, res) => {
    try {
      const data = await SupervisorGroundTruth.findOneAndUpdate(
        { projectId: req.body.projectId, supervisorId: req.body.supervisorId, annotatorId: req.user._id, datasetName: req.body.datasetName, modelName: req.body.modelName },
        { ...req.body, annotatorId: req.user._id, annotationStatus: 'submitted', annotationSource: 'human_reviewed' },
        { new: true, upsert: true, runValidators: true }
      );
      recordActivity(req, 'SUPERVISOR_GROUND_TRUTH_SAVED', { projectId: req.body.projectId, supervisorId: req.body.supervisorId, modelName: req.body.modelName, relevanceGrade: Number(req.body.relevanceGrade) });
      res.status(201).json({ status: 'success', data });
    } catch (error) { respondError(res, error); }
  }
);
router.get('/supervisor-ground-truth', annotator, async (req, res) => {
  try {
    const match = {};
    if (req.query.datasetName) match.datasetName = req.query.datasetName;
    if (req.query.projectId) match.projectId = req.query.projectId;
    if (req.query.model) match.modelName = req.query.model;
    res.json({ status: 'success', data: await paged(
      SupervisorGroundTruth, match, req,
      ['projectId supervisorId annotatorId'],
      { updatedAt: -1 }
    ) });
  } catch (error) { respondError(res, error); }
});

router.get('/experiments', admin, async (_req, res) => res.json({ status: 'success', data: await ResearchExperiment.find().sort({ createdAt: -1 }) }));
router.post('/experiments', admin, body('name').trim().notEmpty(), body('datasetName').trim().notEmpty(), validation, async (req, res) => {
  try { res.status(201).json({ status: 'success', data: await ResearchExperiment.create({ ...req.body, createdBy: req.user._id }) }); }
  catch (error) { respondError(res, error); }
});
router.post('/experiments/:id/run', admin, async (req, res) => {
  try {
    const experiment = await ResearchExperiment.findById(req.params.id);
    if (!experiment) return res.status(404).json({ status: 'error', message: 'Experiment not found' });
    const labels = await AnnotationConsensus.find({
      datasetName: experiment.datasetName,
      status: 'consensus',
      annotatorCount: { $gte: 2 }
    }).lean();
    const comparisons = await ProjectPairScore.find({ modelName: { $in: MODEL_ORDER } })
      .sort({ createdAt: 1 })
      .lean();
    const latest = new Map();
    for (const row of comparisons) {
      const key = pairKey(row);
      if (!latest.has(key)) latest.set(key, {});
      latest.get(key)[row.modelName] = row;
    }
    const usable = labels.map(label => ({
      label,
      comparisons: latest.get(pairKey(label))
    })).filter(row => MODEL_ORDER.every(model => row.comparisons?.[model]));
    const humanScoresAvailable = usable.length > 0 && usable.every(row => row.label.humanSimilarityPercentage != null);
    const payload = {
      labels: usable.map(row => row.label.binaryLabel),
      humanScores: humanScoresAvailable ? usable.map(row => row.label.humanSimilarityPercentage) : undefined,
      modelScores: Object.fromEntries(MODEL_ORDER.map(model => [
        model,
        usable.map(row => row.comparisons[model].weightedOverallScore)
      ])),
      processingTimes: Object.fromEntries(MODEL_ORDER.map(model => [
        model,
        usable.map(row => row.comparisons[model].executionTimeMs || 0)
      ])),
      classificationThresholds: Object.fromEntries(MODEL_ORDER.map(model => [
        model,
        Number(experiment.configuration?.classificationThresholds?.[model] ?? 70)
      ])),
      significanceLevel: Number(experiment.configuration?.significanceLevel ?? 0.05),
      thresholds: [50, 55, 60, 65, 70, 75, 80]
    };
    const results = usable.length ? await callAI('evaluate', payload) : {};
    experiment.status = 'completed'; experiment.results = results; experiment.startedAt = experiment.startedAt || new Date(); experiment.completedAt = new Date();
    await experiment.save();
    res.json({ status: 'success', data: experiment, comparisonsUsed: usable.length });
  } catch (error) { respondError(res, error); }
});

router.get('/reports', admin, async (_req, res) => res.json({ status: 'success', data: await GeneratedResearchReport.find().populate('experimentId', 'name datasetName').sort({ createdAt: -1 }) }));
router.post('/reports', admin, body('title').trim().notEmpty(), body('experimentId').isMongoId(), validation, async (req, res) => {
  try {
    const experiment = await ResearchExperiment.findById(req.body.experimentId).lean();
    if (!experiment) return res.status(404).json({ status: 'error', message: 'Experiment not found' });
    const modelRows = Object.entries(experiment.results || {}).map(([model, value]) => ({ model, ...(value.classification || {}) }));
    const best = [...modelRows].sort((a, b) => (b.f1_score || 0) - (a.f1_score || 0))[0];
    const sections = {
      reportInformation: { experiment: experiment.name, dataset: experiment.datasetName, generatedAt: new Date(), models: modelRows.map(row => row.model) },
      executiveSummary: best ? { bestModel: best.model, rationale: 'Highest F1-score in this experiment', f1Score: best.f1_score } : { limitation: 'No evaluated labelled pairs' },
      classificationResults: modelRows,
      thresholdAnalysis: Object.fromEntries(Object.entries(experiment.results || {}).map(([model, value]) => [model, value.threshold_analysis || []])),
      humanScoreAgreement: Object.fromEntries(Object.entries(experiment.results || {}).map(([model, value]) => [model, value.human_score_agreement || null])),
      processingPerformance: Object.fromEntries(Object.entries(experiment.results || {}).map(([model, value]) => [model, value.processing || {}])),
      limitations: ['Results depend on labelled dataset size, balance, evaluator agreement, model availability, and hardware.']
    };
    const data = await GeneratedResearchReport.create({ title: req.body.title, experimentId: experiment._id, generatedBy: req.user._id, summaryResults: sections.executiveSummary, sections });
    res.status(201).json({ status: 'success', data });
  } catch (error) { respondError(res, error); }
});
router.get('/reports/:id/export/:format', admin, async (req, res) => {
  const report = await GeneratedResearchReport.findById(req.params.id).lean();
  if (!report) return res.status(404).json({ status: 'error', message: 'Report not found' });
  const format = req.params.format.toLowerCase();
  if (format === 'json') return res.attachment(`${report.title}.json`).json(report);
  if (format === 'csv') {
    const rows = report.sections?.classificationResults || [];
    const headers = [...new Set(rows.flatMap(Object.keys))];
    const csv = [headers.join(','), ...rows.map(row => headers.map(key => JSON.stringify(row[key] ?? '')).join(','))].join('\n');
    res.type('text/csv').attachment(`${report.title}.csv`).send(csv);
    return;
  }
  res.status(501).json({ status: 'error', message: `${format.toUpperCase()} export requires the document export worker` });
});

router.get('/assignments', admin, async (req, res) => {
  try {
    const match = {};
    if (req.query.experimentRunId) match.experimentRunId = req.query.experimentRunId;
    res.json({ status: 'success', data: await paged(
      SupervisorAssignment,
      match,
      req,
      [
        { path: 'projectId', select: 'title sourceRow' },
        { path: 'recommendedSupervisorId', select: 'name researchSupervisorId academicSpecialization' },
        { path: 'assignedSupervisorId', select: 'name researchSupervisorId academicSpecialization' }
      ],
      { createdAt: -1 }
    ) });
  } catch (error) { respondError(res, error); }
});

router.get('/raw-export/:resource/:format', admin, async (req, res) => {
  try {
    const resources = {
      projects: {
        model: Project,
        match: { testDataTag: researchTag },
        select: '-semanticEmbedding.vector'
      },
      users: {
        model: User,
        match: { testDataTag: researchTag },
        select: '-password'
      },
      supervisors: {
        model: User,
        match: { testDataTag: researchTag, role: 'supervisor' },
        select: '-password'
      },
      'pair-scores': { model: ProjectPairScore, match: {} },
      'supervisor-scores': { model: SupervisorMatchScore, match: {} },
      assignments: { model: SupervisorAssignment, match: {} },
      annotations: { model: HumanEvaluation, match: {} },
      consensus: { model: AnnotationConsensus, match: {} },
      'supervisor-ground-truth': { model: SupervisorGroundTruth, match: {} },
      activities: { model: ActivityLog, match: {} },
      'import-runs': { model: ResearchImportRun, match: {} },
      'experiment-runs': { model: ResearchExperimentRun, match: { datasetTag: researchTag } }
    };
    const resource = resources[req.params.resource];
    if (!resource) return res.status(404).json({ status: 'error', message: 'Unknown research export resource' });
    const match = { ...resource.match };
    if (req.query.experimentRunId) match.experimentRunId = req.query.experimentRunId;
    if (req.query.model) match.modelName = req.query.model;
    let query = resource.model.find(match).sort({ createdAt: 1 });
    if (resource.select) query = query.select(resource.select);
    const rows = await query.lean();
    const filename = `${req.params.resource}-${new Date().toISOString().slice(0, 10)}`;
    recordActivity(req, 'DATA_EXPORTED', { resource: req.params.resource, format: req.params.format, rowCount: rows.length });
    if (req.params.format === 'json') return res.attachment(`${filename}.json`).json(rows);
    if (req.params.format === 'csv') return sendCsv(res, `${filename}.csv`, rows);
    return res.status(501).json({
      status: 'error',
      message: 'Use the generated research workbook for Excel and the generated research report for PDF.'
    });
  } catch (error) { respondError(res, error); }
});

module.exports = router;
