const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResearchAnalytics, pearson, summarize } = require('../src/services/researchAnalytics');

test('descriptive statistics and correlation are calculated safely', () => {
  assert.equal(summarize([10, 20, 30]).mean, 20);
  assert.equal(summarize([10, 20, 30]).median, 20);
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearson([1], [2]), null);
});

test('research analytics aligns all three recorded model results by project pair', () => {
  const base = {
    firstProjectId: 'a',
    secondProjectId: 'b',
    firstProjectTitle: 'First',
    secondProjectTitle: 'Second',
    fieldScores: {
      title: 50,
      description: 40,
      problem_statement: 30,
      research_objectives: 20,
      features: 10,
      technologies_tools: 5
    },
    riskLevel: 'Medium',
    executionTimeMs: 10,
    createdAt: new Date('2026-01-01')
  };
  const result = buildResearchAnalytics({
    pairScores: [
      { ...base, modelName: 'tfidf', weightedOverallScore: 30 },
      { ...base, modelName: 'sentence_bert', weightedOverallScore: 40 },
      { ...base, modelName: 'bge_m3', weightedOverallScore: 50 }
    ],
    supervisorScores: [],
    assignments: [],
    supervisors: []
  });
  assert.equal(result.counts.persistedPairScores, 3);
  assert.equal(result.counts.completeProjectPairs, 1);
  assert.equal(result.disagreements[0].maximumDifference, 20);
  assert.equal(result.fieldAverages[0].tfidf, 50);
});
