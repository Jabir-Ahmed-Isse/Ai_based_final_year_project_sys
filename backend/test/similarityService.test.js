const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateSimilarity,
  calculateProjectSimilarity,
  setEmbeddingProviderForTesting,
  resetEmbeddingProviderForTesting
} = require('../src/services/similarityService');
const Project = require('../src/models/Project');

const originalDescription = 'A web-based system that helps universities manage graduation project submissions and prevent duplicate project ideas. Students submit proposals, the system checks them against previous projects using AI, supervisors review and approve them, and administrators manage users and assignments.';
const paraphrasedDescription = 'A university platform that coordinates final-year project proposals and evaluates whether new ideas resemble previously approved work. Learners upload proposals, automated semantic analysis performs the comparison, academic supervisors provide feedback and approval, and administrators control accounts and project allocation.';
const sameDomainDifferentPurpose = 'A university system for scheduling project presentations, assigning examination panels, reserving rooms, and recording defense marks.';
const unrelatedProject = 'An online food delivery platform that allows customers to order meals, track drivers, and pay restaurants electronically.';

const conceptGroups = [
  ['university', 'universities', 'academic', 'students', 'learners', 'system'],
  ['graduation', 'project', 'projects', 'proposal', 'proposals', 'academic', 'supervisors', 'administrators', 'presentations', 'examination', 'defense', 'marks'],
  ['graduation', 'final-year', 'final', 'project', 'projects', 'proposal', 'proposals'],
  ['submission', 'submissions', 'submit', 'upload', 'coordinates'],
  ['duplicate', 'resemble', 'previous', 'approved', 'ideas', 'comparison', 'checks'],
  ['ai', 'semantic', 'analysis', 'automated', 'evaluates'],
  ['supervisors', 'supervisor', 'feedback', 'review', 'approve', 'approval'],
  ['administrators', 'admin', 'accounts', 'users', 'assignments', 'assigning', 'allocation', 'control'],
  ['scheduling', 'presentations', 'examination', 'panels', 'rooms', 'defense', 'marks'],
  ['food', 'delivery', 'customers', 'meals', 'drivers', 'restaurants', 'order']
];

function deterministicSemanticEmbedding(text) {
  return conceptGroups.map(group => {
    let score = 0;
    for (const token of group) {
      if (text.includes(token)) score += 1;
    }
    return score;
  });
}

function projectFrom(description, title = 'Graduation project management platform') {
  return {
    title,
    abstract: description,
    features: ['Proposal workflow', 'Similarity analysis', 'Supervisor review', 'Administrator assignment']
  };
}

test.beforeEach(() => {
  setEmbeddingProviderForTesting(deterministicSemanticEmbedding);
});

test.afterEach(() => {
  resetEmbeddingProviderForTesting();
});

test('Test A: exact copy returns very high similarity close to 100%', async () => {
  const result = await calculateProjectSimilarity(projectFrom(originalDescription), projectFrom(originalDescription));

  assert.equal(result.label, 'Very high similarity');
  assert.ok(result.displayedPercentage >= 99, `Expected >= 99, received ${result.displayedPercentage}`);
});

test('Test B: strong paraphrase keeps high semantic similarity', async () => {
  const result = await calculateProjectSimilarity(projectFrom(paraphrasedDescription), projectFrom(originalDescription));

  assert.match(result.label, /High similarity|Very high similarity/);
  assert.ok(result.displayedPercentage >= 70, `Expected >= 70, received ${result.displayedPercentage}`);
});

test('Test C: same domain but different functions returns moderate similarity', async () => {
  const result = await calculateProjectSimilarity(
    projectFrom(sameDomainDifferentPurpose, 'Project defense scheduling system'),
    projectFrom(originalDescription)
  );

  assert.equal(result.label, 'Moderate similarity');
  assert.ok(result.displayedPercentage >= 40, `Expected >= 40, received ${result.displayedPercentage}`);
  assert.ok(result.displayedPercentage < 70, `Expected < 70, received ${result.displayedPercentage}`);
});

test('Test D: unrelated software project returns low similarity', async () => {
  const result = await calculateProjectSimilarity(
    projectFrom(unrelatedProject, 'Online food delivery platform'),
    projectFrom(originalDescription)
  );

  assert.equal(result.label, 'Low similarity');
  assert.ok(result.displayedPercentage < 40, `Expected < 40, received ${result.displayedPercentage}`);
});

test('Only database-recorded research candidates are included in result ranking', async () => {
  const originalFind = Project.find;
  Project.find = query => {
    assert.equal(query.testDataTag, 'RESEARCH_EXPERIMENT');
    return {
      sort: async () => [
        projectFrom(originalDescription, 'Stored graduation project management platform'),
        projectFrom(unrelatedProject, 'Online food delivery platform')
      ]
    };
  };

  try {
    const result = await calculateSimilarity(projectFrom(paraphrasedDescription));

    assert.ok(result.displayedScore >= 70, `Expected >= 70, received ${result.displayedScore}`);
    assert.equal(result.similarProjects[0].title, 'Stored graduation project management platform');
  } finally {
    Project.find = originalFind;
  }
});
