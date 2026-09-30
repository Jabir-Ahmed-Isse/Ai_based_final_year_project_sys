const crypto = require('crypto');
const mongoose = require('mongoose');
const Project = require('../models/Project');

let pipeline = null;
try {
  ({ pipeline } = require('@xenova/transformers'));
} catch (error) {
  console.warn('Transformer similarity model is unavailable; semantic fallback will be used.');
}

const EMBEDDING_MODEL_NAME = process.env.SIMILARITY_MODEL || 'Xenova/all-MiniLM-L6-v2';
const SIMILARITY_DEBUG = process.env.SIMILARITY_DEBUG === 'true';
const transformersDisabled = process.env.DISABLE_TRANSFORMER_SIMILARITY === 'true';

let embeddingModel = null;
let embeddingLoadFailed = false;
let embeddingProviderForTesting = null;

const FALLBACK_CONCEPTS = [
  ['university', 'universities', 'academic', 'campus'],
  ['graduation', 'final', 'finalyear', 'year'],
  ['project', 'projects', 'proposal', 'proposals', 'work'],
  ['submission', 'submit', 'upload', 'uploads'],
  ['duplicate', 'similar', 'similarity', 'resemble', 'previous', 'approved'],
  ['semantic', 'analysis', 'ai', 'automated', 'comparison', 'checks'],
  ['supervisor', 'supervisors', 'feedback', 'review', 'approval', 'approve'],
  ['administrator', 'administrators', 'admin', 'accounts', 'users', 'assignments', 'allocation'],
  ['schedule', 'scheduling', 'presentation', 'presentations', 'defense', 'panel', 'panels', 'rooms', 'marks'],
  ['food', 'meal', 'meals', 'delivery', 'driver', 'drivers', 'restaurant', 'restaurants', 'order', 'customers']
];

const FALLBACK_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their',
  'this', 'to', 'using', 'use', 'used', 'with', 'will'
]);

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function preprocessText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProjectCombinedText(project = {}) {
  const description = project.abstract || project.description || '';
  return preprocessText([
    project.title || '',
    description,
    ...asArray(project.features)
  ].join(' '));
}

function normalizeCandidateProject(project = {}) {
  return {
    ...project,
    _id: project._id || project.id,
    title: project.title || '',
    abstract: project.abstract || project.description || '',
    features: asArray(project.features || project.expectedOutputs)
  };
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeVector(vector) {
  const values = Array.from(vector || []).map(Number);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + (value * value), 0));
  if (!norm) return values;
  return values.map(value => value / norm);
}

async function getEmbeddingModel() {
  if (embeddingProviderForTesting) return null;
  if (transformersDisabled) throw new Error('Transformer similarity model is disabled');
  if (!pipeline) throw new Error('Transformer pipeline package is unavailable');
  if (embeddingLoadFailed) throw new Error('Transformer embedding model failed to load previously');

  if (!embeddingModel) {
    try {
      embeddingModel = await pipeline('feature-extraction', EMBEDDING_MODEL_NAME);
    } catch (error) {
      embeddingLoadFailed = true;
      console.error('Error loading semantic embedding model:', error);
      throw new Error('Failed to initialize the semantic similarity model');
    }
  }

  return embeddingModel;
}

function fallbackSemanticEmbedding(text) {
  const normalized = preprocessText(text);
  const compact = normalized.replace(/final year/g, 'finalyear');
  const tokens = compact
    .split(/\s+/)
    .filter(token => token.length > 1 && !FALLBACK_STOP_WORDS.has(token));

  const conceptVector = FALLBACK_CONCEPTS.map(group => {
    let count = 0;
    for (const word of group) {
      if (tokens.includes(word) || compact.includes(word)) count += 1;
    }
    return count;
  });

  const hashedTokenVector = new Array(96).fill(0);
  for (const token of tokens) {
    const hash = crypto.createHash('sha1').update(token).digest();
    const index = hash[0] % hashedTokenVector.length;
    hashedTokenVector[index] += 1;
  }

  return normalizeVector([...conceptVector, ...hashedTokenVector]);
}

async function generateEmbeddingWithMetadata(text) {
  const normalizedText = preprocessText(text);
  if (!normalizedText) return { embedding: [], modelName: EMBEDDING_MODEL_NAME };

  if (embeddingProviderForTesting) {
    return {
      embedding: normalizeVector(await embeddingProviderForTesting(normalizedText)),
      modelName: 'test-embedding-provider'
    };
  }

  try {
    const model = await getEmbeddingModel();
    const output = await model(normalizedText, { pooling: 'mean', normalize: true });
    return {
      embedding: normalizeVector(output.data),
      modelName: EMBEDDING_MODEL_NAME
    };
  } catch (error) {
    console.warn(`Using fallback semantic embedding: ${error.message}`);
    return {
      embedding: fallbackSemanticEmbedding(normalizedText),
      modelName: 'fallback-semantic-concepts-v1'
    };
  }
}

async function generateEmbedding(text) {
  return (await generateEmbeddingWithMetadata(text)).embedding;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i += 1) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function similarityPercentage(rawCosine) {
  return Math.max(0, Math.min(100, rawCosine * 100));
}

function similarityLabel(percentage) {
  if (percentage >= 85) return 'Very high similarity';
  if (percentage >= 70) return 'High similarity';
  if (percentage >= 40) return 'Moderate similarity';
  return 'Low similarity';
}

function riskLevelFromPercentage(percentage) {
  if (percentage >= 70) return 'High';
  if (percentage >= 40) return 'Medium';
  return 'Low';
}

function embeddingIsFresh(project, combinedText, modelName = EMBEDDING_MODEL_NAME) {
  const stored = project?.semanticEmbedding;
  const vector = stored?.vector;
  return Boolean(
    stored &&
    Array.isArray(vector) &&
    vector.length > 0 &&
    stored.model === modelName &&
    stored.textHash === hashText(combinedText)
  );
}

async function ensureProjectEmbedding(project, options = {}) {
  const { persist = true } = options;
  const combinedText = buildProjectCombinedText(project);
  const textHash = hashText(combinedText);

  if (embeddingIsFresh(project, combinedText)) {
    return {
      combinedText,
      embedding: project.semanticEmbedding.vector,
      dimensions: project.semanticEmbedding.dimensions || project.semanticEmbedding.vector.length,
      regenerated: false
    };
  }

  const { embedding, modelName } = await generateEmbeddingWithMetadata(combinedText);
  const semanticEmbedding = {
    model: modelName,
    textHash,
    combinedText,
    vector: embedding,
    dimensions: embedding.length,
    generatedAt: new Date()
  };

  if (project && typeof project.set === 'function') {
    project.set('semanticEmbedding', semanticEmbedding);
    project.markModified?.('semanticEmbedding');
    if (persist && typeof project.save === 'function' && project._id) {
      await project.save({ validateBeforeSave: false });
    }
  } else if (project) {
    project.semanticEmbedding = semanticEmbedding;
  }

  return {
    combinedText,
    embedding,
    dimensions: embedding.length,
    regenerated: true
  };
}

function debugComparison({ submitted, stored, submittedEmbedding, storedEmbedding, rawCosine, percentage, projectId }) {
  if (!SIMILARITY_DEBUG) return;

  console.log('[similarity] Project ID being compared:', projectId || 'unsaved');
  console.log('[similarity] Submitted combined text:', submitted);
  console.log('[similarity] Stored project combined text:', stored);
  console.log('[similarity] Submitted embedding dimensions:', submittedEmbedding.length);
  console.log('[similarity] Stored embedding dimensions:', storedEmbedding.length);
  console.log('[similarity] Submitted embedding first five:', submittedEmbedding.slice(0, 5));
  console.log('[similarity] Stored embedding first five:', storedEmbedding.slice(0, 5));
  console.log('[similarity] Raw cosine similarity:', rawCosine);
  console.log('[similarity] Final percentage:', percentage);
}

async function calculateProjectSimilarity(projectA, projectB, options = {}) {
  if (projectA._id && projectB._id && projectA._id.toString() === projectB._id.toString()) {
    return {
      overall: 0,
      rawCosine: 0,
      percentage: 0,
      displayedPercentage: 0,
      label: 'Low similarity',
      riskLevel: 'Low',
      breakdown: { semantic: 0 }
    };
  }

  const submitted = await ensureProjectEmbedding(projectA, { persist: options.persistSubmitted ?? false });
  const stored = await ensureProjectEmbedding(projectB, { persist: options.persistStored ?? true });

  const rawCosine = cosineSimilarity(submitted.embedding, stored.embedding);
  const percentage = similarityPercentage(rawCosine);
  const displayedPercentage = Number(percentage.toFixed(2));
  const label = similarityLabel(percentage);
  const riskLevel = riskLevelFromPercentage(percentage);

  debugComparison({
    submitted: submitted.combinedText,
    stored: stored.combinedText,
    submittedEmbedding: submitted.embedding,
    storedEmbedding: stored.embedding,
    rawCosine,
    percentage,
    projectId: projectB._id
  });

  return {
    overall: percentage,
    rawCosine,
    percentage,
    displayedPercentage,
    label,
    riskLevel,
    model: EMBEDDING_MODEL_NAME,
    breakdown: {
      semantic: displayedPercentage
    }
  };
}

function sharedContextReason(project, otherProject) {
  const sameFaculty = project.facultyId && otherProject.facultyId &&
    project.facultyId.toString() === otherProject.facultyId.toString();
  const sharedDomains = (project.researchDomainIds || []).filter(domainId =>
    (otherProject.researchDomainIds || []).some(otherDomainId => otherDomainId.toString() === domainId.toString())
  );

  if (sameFaculty) return 'Similar semantic meaning in the same faculty';
  if (sharedDomains.length > 0) return 'Similar semantic meaning in a related research domain';
  return 'Similar semantic meaning in the university archive';
}

async function calculateSimilarity(project) {
  const query = {
    testDataTag: 'RESEARCH_EXPERIMENT'
  };

  if (project._id && mongoose.Types.ObjectId.isValid(project._id.toString())) {
    query._id = { $ne: project._id };
  }

  const storedProjects = await Project.find(query).sort({ createdAt: -1 });
  const projects = [...storedProjects];

  await ensureProjectEmbedding(project, { persist: Boolean(project._id) });

  let maxSimilarity = 0;
  let maxRawCosine = 0;
  const similarProjects = [];

  for (const otherProject of projects) {
    try {
      const similarity = await calculateProjectSimilarity(project, otherProject, {
        persistSubmitted: false,
        persistStored: true
      });

      if (similarity.percentage > maxSimilarity) {
        maxSimilarity = similarity.percentage;
        maxRawCosine = similarity.rawCosine;
      }

      if (similarity.percentage > 0) {
        similarProjects.push({
          projectId: otherProject._id,
          title: otherProject.title,
          facultyId: otherProject.facultyId,
          departmentId: otherProject.departmentId,
          categoryId: otherProject.categoryId,
          rawCosine: similarity.rawCosine,
          similarity: similarity.percentage,
          score: similarity.percentage,
          displayedPercentage: similarity.displayedPercentage,
          similarityLabel: similarity.label,
          riskLevel: similarity.riskLevel,
          matchedSections: ['semantic'],
          reason: sharedContextReason(project, otherProject)
        });
      }
    } catch (error) {
      console.error(`Error comparing with project ${otherProject._id}:`, error);
    }
  }

  similarProjects.sort((a, b) => b.similarity - a.similarity);
  const topSimilarProjects = similarProjects.slice(0, 5);
  const displayedScore = Number(maxSimilarity.toFixed(2));

  return {
    overallScore: maxSimilarity,
    displayedScore,
    rawCosine: maxRawCosine,
    riskLevel: riskLevelFromPercentage(maxSimilarity),
    similarityLabel: similarityLabel(maxSimilarity),
    modelVersion: EMBEDDING_MODEL_NAME,
    combinedText: buildProjectCombinedText(project),
    breakdown: {
      semantic: displayedScore
    },
    similarProjects: topSimilarProjects
  };
}

async function generateProjectIdeas(department, keywords = []) {
  const ideas = [
    {
      title: `AI-Powered ${department} Assistant`,
      description: `An intelligent assistant that helps ${department.toLowerCase()} students with their studies and research.`,
      features: [
        'Natural language processing for understanding queries',
        'Personalized study recommendations',
        'Integration with academic resources',
        'Progress tracking and analytics'
      ],
      technologies: ['Python', 'TensorFlow', 'React', 'Node.js'],
      problem: 'Students often struggle to find relevant study materials and personalized assistance.'
    },
    {
      title: `${department} Project Management System`,
      description: `A comprehensive platform for managing ${department.toLowerCase()} projects from proposal to completion.`,
      features: [
        'Project submission and approval workflow',
        'Resource allocation and tracking',
        'Collaboration tools for teams',
        'Progress monitoring and reporting'
      ],
      technologies: ['MERN Stack', 'MongoDB', 'Express', 'React', 'Node.js'],
      problem: 'Managing academic projects efficiently is challenging without proper tools.'
    }
  ];

  if (keywords.length === 0) return ideas;

  const keywordStr = keywords.join(' ').toLowerCase();
  return ideas.filter(idea =>
    keywordStr.includes(idea.title.toLowerCase()) ||
    idea.features.some(feature =>
      keywordStr.split(' ').some(keyword =>
        feature.toLowerCase().includes(keyword)
      )
    )
  );
}

function setEmbeddingProviderForTesting(provider) {
  embeddingProviderForTesting = provider;
}

function resetEmbeddingProviderForTesting() {
  embeddingProviderForTesting = null;
  embeddingModel = null;
  embeddingLoadFailed = false;
}

module.exports = {
  EMBEDDING_MODEL_NAME,
  buildProjectCombinedText,
  preprocessText,
  generateEmbedding,
  ensureProjectEmbedding,
  cosineSimilarity,
  similarityPercentage,
  similarityLabel,
  riskLevelFromPercentage,
  calculateProjectSimilarity,
  calculateSimilarity,
  generateProjectIdeas,
  setEmbeddingProviderForTesting,
  resetEmbeddingProviderForTesting
};
