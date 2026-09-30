const MODEL_ORDER = ['tfidf', 'sentence_bert', 'bge_m3'];
const FIELD_ORDER = [
  'title',
  'description',
  'problem_statement',
  'research_objectives',
  'features',
  'technologies_tools'
];

const MODEL_LABELS = {
  tfidf: 'TF-IDF',
  sentence_bert: 'Sentence-BERT',
  bge_m3: 'BGE-M3'
};

const FIELD_LABELS = {
  title: 'Project title',
  description: 'Description',
  problem_statement: 'Problem statement',
  research_objectives: 'Research objectives',
  features: 'Features',
  technologies_tools: 'Technologies and tools'
};

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, places = 4) => Number(number(value).toFixed(places));
const mean = values => values.length
  ? values.reduce((sum, value) => sum + number(value), 0) / values.length
  : 0;

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].map(number).sort((left, right) => left - right);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function summarize(values) {
  const numeric = values.map(number);
  if (!numeric.length) {
    return {
      records: 0, mean: 0, median: 0, minimum: 0, maximum: 0,
      standardDeviation: 0, variance: 0, range: 0, confidenceIntervalLow: 0,
      confidenceIntervalHigh: 0
    };
  }
  const average = mean(numeric);
  const variance = mean(numeric.map(value => (value - average) ** 2));
  const standardDeviation = Math.sqrt(variance);
  const margin = 1.96 * standardDeviation / Math.sqrt(numeric.length);
  return {
    records: numeric.length,
    mean: round(average),
    median: round(percentile(numeric, 0.5)),
    minimum: round(Math.min(...numeric)),
    maximum: round(Math.max(...numeric)),
    standardDeviation: round(standardDeviation),
    variance: round(variance),
    range: round(Math.max(...numeric) - Math.min(...numeric)),
    confidenceIntervalLow: round(average - margin),
    confidenceIntervalHigh: round(average + margin)
  };
}

function pearson(leftValues, rightValues) {
  if (leftValues.length !== rightValues.length || leftValues.length < 2) return null;
  const leftMean = mean(leftValues);
  const rightMean = mean(rightValues);
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < leftValues.length; index += 1) {
    const leftDifference = number(leftValues[index]) - leftMean;
    const rightDifference = number(rightValues[index]) - rightMean;
    numerator += leftDifference * rightDifference;
    leftSquared += leftDifference ** 2;
    rightSquared += rightDifference ** 2;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator ? round(numerator / denominator, 6) : null;
}

function pairKey(row) {
  return [String(row.firstProjectId), String(row.secondProjectId)].sort().join(':');
}

function latestRows(rows, identity) {
  const result = new Map();
  for (const row of [...rows].sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0))) {
    result.set(identity(row), row);
  }
  return [...result.values()];
}

function buildResearchAnalytics({ pairScores = [], supervisorScores = [], assignments = [], supervisors = [] }) {
  const pairs = latestRows(
    pairScores.filter(row => MODEL_ORDER.includes(row.modelName)),
    row => `${row.modelName}:${pairKey(row)}`
  );
  const modelRows = Object.fromEntries(MODEL_ORDER.map(model => [
    model,
    pairs.filter(row => row.modelName === model)
  ]));
  const pairMatrix = new Map();
  for (const row of pairs) {
    const key = pairKey(row);
    if (!pairMatrix.has(key)) pairMatrix.set(key, {});
    pairMatrix.get(key)[row.modelName] = row;
  }

  const descriptive = MODEL_ORDER.map(model => ({
    model,
    modelLabel: MODEL_LABELS[model],
    ...summarize(modelRows[model].map(row => row.weightedOverallScore))
  }));

  const bins = Array.from({ length: 10 }, (_, index) => ({
    range: index === 9 ? '90–100' : `${index * 10}–${(index * 10) + 9}`,
    minimum: index * 10,
    maximum: index === 9 ? 100 : (index * 10) + 9.9999
  }));
  const scoreDistribution = bins.map(bin => ({
    range: bin.range,
    ...Object.fromEntries(MODEL_ORDER.map(model => [
      model,
      modelRows[model].filter(row => {
        const value = number(row.weightedOverallScore);
        return value >= bin.minimum && value <= bin.maximum;
      }).length
    ]))
  }));

  const riskDistribution = ['Low', 'Medium', 'High'].map(risk => ({
    risk,
    ...Object.fromEntries(MODEL_ORDER.map(model => [
      model,
      modelRows[model].filter(row => String(row.riskLevel || '').toLowerCase().startsWith(risk.toLowerCase())).length
    ]))
  }));

  const fieldAverages = FIELD_ORDER.map(field => ({
    field,
    fieldLabel: FIELD_LABELS[field],
    ...Object.fromEntries(MODEL_ORDER.map(model => [
      model,
      round(mean(modelRows[model]
        .map(row => row.fieldScores?.[field])
        .filter(value => value != null)))
    ]))
  }));

  const latency = MODEL_ORDER.map(model => {
    const values = modelRows[model].map(row => row.executionTimeMs).filter(value => value != null).map(number);
    const summary = summarize(values);
    const totalSeconds = values.reduce((sum, value) => sum + value, 0) / 1000;
    return {
      model,
      modelLabel: MODEL_LABELS[model],
      averageMs: summary.mean,
      minimumMs: summary.minimum,
      maximumMs: summary.maximum,
      medianMs: summary.median,
      standardDeviationMs: summary.standardDeviation,
      comparisonsPerSecond: totalSeconds ? round(values.length / totalSeconds) : 0,
      device: modelRows[model].find(row => row.device)?.device || 'CPU'
    };
  });

  const correlations = MODEL_ORDER.map(rowModel => ({
    model: rowModel,
    modelLabel: MODEL_LABELS[rowModel],
    ...Object.fromEntries(MODEL_ORDER.map(columnModel => {
      if (rowModel === columnModel) return [columnModel, 1];
      const comparable = [...pairMatrix.values()].filter(row => row[rowModel] && row[columnModel]);
      return [columnModel, pearson(
        comparable.map(row => row[rowModel].weightedOverallScore),
        comparable.map(row => row[columnModel].weightedOverallScore)
      )];
    }))
  }));

  const disagreements = [...pairMatrix.entries()]
    .map(([key, rows]) => {
      const available = MODEL_ORDER.filter(model => rows[model]);
      if (available.length !== MODEL_ORDER.length) return null;
      const values = available.map(model => number(rows[model].weightedOverallScore));
      const sample = rows[available[0]];
      return {
        pairKey: key,
        firstProjectTitle: sample.firstProjectTitle,
        secondProjectTitle: sample.secondProjectTitle,
        maximumDifference: round(Math.max(...values) - Math.min(...values)),
        ...Object.fromEntries(available.map(model => [model, round(rows[model].weightedOverallScore)]))
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.maximumDifference - left.maximumDifference)
    .slice(0, 20);

  const sampledPairs = [...pairMatrix.entries()]
    .filter(([, rows]) => MODEL_ORDER.every(model => rows[model]))
    .filter((_, index, all) => index % Math.max(1, Math.floor(all.length / 160)) === 0)
    .slice(0, 160)
    .map(([key, rows]) => ({
      pairKey: key,
      ...Object.fromEntries(MODEL_ORDER.map(model => [model, round(rows[model].weightedOverallScore)]))
    }));

  const supervisorModelRows = latestRows(
    supervisorScores.filter(row => MODEL_ORDER.includes(row.modelName)),
    row => `${row.modelName}:${row.projectId}:${row.supervisorId}`
  );
  const supervisorModelSummary = MODEL_ORDER.map(model => {
    const rows = supervisorModelRows.filter(row => row.modelName === model);
    return {
      model,
      modelLabel: MODEL_LABELS[model],
      records: rows.length,
      averageSemanticScore: round(mean(rows.map(row => row.pureSemanticScore))),
      averageAdjustedScore: round(mean(rows.map(row => row.finalAdjustedScore))),
      averageTimeMs: round(mean(rows.map(row => row.executionTimeMs)))
    };
  });

  const assignedCounts = new Map();
  for (const assignment of assignments) {
    const supervisorId = String(assignment.assignedSupervisorId || assignment.recommendedSupervisorId || '');
    if (supervisorId) assignedCounts.set(supervisorId, (assignedCounts.get(supervisorId) || 0) + 1);
  }
  const workload = supervisors.map(supervisor => {
    const supervisorId = String(supervisor._id);
    const assignedProjects = assignedCounts.get(supervisorId) || number(supervisor.currentProjects);
    const maximumCapacity = number(supervisor.maxProjects);
    return {
      supervisorId,
      supervisorCode: supervisor.researchSupervisorId,
      supervisorName: supervisor.name,
      assignedProjects,
      maximumCapacity,
      utilizationPercentage: maximumCapacity ? round((assignedProjects / maximumCapacity) * 100) : 0
    };
  }).sort((left, right) => String(left.supervisorCode).localeCompare(String(right.supervisorCode)));

  return {
    models: MODEL_ORDER,
    modelLabels: MODEL_LABELS,
    fields: FIELD_ORDER,
    descriptive,
    scoreDistribution,
    riskDistribution,
    fieldAverages,
    latency,
    correlations,
    disagreements,
    sampledPairs,
    supervisorModelSummary,
    workload,
    counts: {
      persistedPairScores: pairs.length,
      completeProjectPairs: [...pairMatrix.values()].filter(rows => MODEL_ORDER.every(model => rows[model])).length,
      supervisorScores: supervisorModelRows.length,
      assignments: assignments.length
    }
  };
}

module.exports = {
  MODEL_ORDER,
  FIELD_ORDER,
  MODEL_LABELS,
  FIELD_LABELS,
  buildResearchAnalytics,
  pairKey,
  summarize,
  pearson
};
