
import { GoogleGenAI, Type } from "@google/genai";
import { AIProjectIdea, ProjectProposal, User, SupervisorRecommendation, CuratedIdea } from "../types";
import { refId, refName } from "../utils/taxonomy";

const createGeminiClient = () => {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Add GEMINI_API_KEY to frontend/.env.local.');
  }
  return new GoogleGenAI({ apiKey });
};

// System instruction for consistent academic tone
const ACADEMIC_SYSTEM_INSTRUCTION = "You are an expert academic advisor for Computer Science students at Hormuud University. Your responses should be formal, encouraging, and technically accurate.";

// Helper function to retry with exponential backoff
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.message?.includes('quota');
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Rate limited. Retrying in ${delay/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
};

export const generateProjectIdeas = async (interests: string, curatedIdeas: CuratedIdea[] = []): Promise<AIProjectIdea[]> => {
  try {
    const ai = createGeminiClient();
    const curatedContext = curatedIdeas.length > 0 
      ? `The university has these PREFERRED topics: ${curatedIdeas.map(i => i.title).join(', ')}. Try to align your suggestions with these if they match the student's interest.`
      : "";

    const prompt = `Generate 4 unique graduation project ideas based on these interests: "${interests}". 
    ${curatedContext}
    Include title, a short description (2 sentences), difficulty level (Easy/Medium/Hard), and recommended technologies.
    If an idea is strongly related to the preferred university topics, mark it by setting "isCurated" to true.`;

    const response = await retryWithBackoff(() => 
      ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: prompt,
        config: {
          systemInstruction: ACADEMIC_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                technologies: { type: Type.ARRAY, items: { type: Type.STRING } },
                isCurated: { type: Type.BOOLEAN }
              },
              required: ["title", "description", "difficulty", "technologies"]
            }
          }
        }
      })
    );

    if (response.text) {
      return JSON.parse(response.text) as AIProjectIdea[];
    }
    return [];
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    if (error?.message?.includes('429') || error?.message?.includes('quota')) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    return [];
  }
};

export interface SimilarProject {
  title: string;
  description: string;
  studentName?: string;
  technologies?: string[];
  similarityScore: number;
  matchedSections?: string[];
  modelScores?: Record<string, number>;
  fieldScores?: Record<string, Record<string, number>>;
}

type SimilarityCandidate = Partial<ProjectProposal> & {
  _id?: string;
  abstract?: string;
  archivedStudentName?: string;
  expectedOutputs?: string[];
  toolsOrMethods?: string[];
};

const SIMILARITY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their',
  'this', 'to', 'using', 'use', 'used', 'with', 'will', 'system', 'project',
  'application', 'app', 'platform', 'based', 'powered'
]);

const SIMILARITY_PHRASES: Array<[RegExp, string]> = [
  [/artificial intelligence/g, 'ai'],
  [/machine learning/g, 'ml'],
  [/deep learning/g, 'deeplearning'],
  [/natural language processing/g, 'nlp'],
  [/computer vision/g, 'vision'],
  [/internet of things/g, 'iot'],
  [/e[-\s]?learning/g, 'elearning'],
  [/block chain/g, 'blockchain'],
  [/health care/g, 'healthcare'],
  [/smart contract/g, 'smartcontract']
];

const SIMILARITY_SYNONYM_GROUPS = [
  ['ai', 'ml', 'deeplearning', 'neural', 'intelligent', 'smart'],
  ['nlp', 'language', 'chatbot', 'text'],
  ['vision', 'image', 'opencv', 'yolo', 'camera', 'detection'],
  ['healthcare', 'hospital', 'medical', 'patient', 'clinical'],
  ['education', 'elearning', 'learning', 'student', 'teaching', 'lms'],
  ['finance', 'banking', 'fintech', 'payment', 'money'],
  ['agriculture', 'farm', 'crop', 'soil', 'irrigation'],
  ['iot', 'sensor', 'arduino', 'raspberry', 'embedded'],
  ['security', 'cybersecurity', 'encryption', 'authentication'],
  ['blockchain', 'ethereum', 'hyperledger', 'decentralized', 'ledger']
];

const SIMILARITY_CONCEPT_GROUPS = [
  ['university', 'universities', 'academic', 'campus', 'student', 'students', 'learner', 'learners'],
  ['graduation', 'final', 'finalyear', 'year', 'project', 'projects', 'proposal', 'proposals'],
  ['management', 'manage', 'managing', 'workflow', 'track', 'tracking', 'coordinate', 'coordinates', 'process'],
  ['submission', 'submissions', 'submit', 'upload', 'uploads'],
  ['duplicate', 'similar', 'similarity', 'resemble', 'previous', 'approved', 'comparison', 'checks'],
  ['semantic', 'analysis', 'ai', 'automated', 'intelligent'],
  ['supervisor', 'supervisors', 'feedback', 'review', 'approval', 'approve'],
  ['administrator', 'administrators', 'admin', 'accounts', 'users', 'assignments', 'allocation'],
  ['schedule', 'scheduling', 'presentation', 'presentations', 'defense', 'panel', 'panels', 'rooms', 'marks'],
  ['healthcare', 'hospital', 'medical', 'patient', 'clinical'],
  ['education', 'elearning', 'learning', 'teaching', 'lms'],
  ['finance', 'banking', 'fintech', 'payment', 'money'],
  ['agriculture', 'farm', 'crop', 'soil', 'irrigation'],
  ['iot', 'sensor', 'arduino', 'raspberry', 'embedded'],
  ['security', 'cybersecurity', 'encryption', 'authentication'],
  ['blockchain', 'ethereum', 'hyperledger', 'decentralized', 'ledger'],
  ['food', 'meal', 'meals', 'delivery', 'driver', 'drivers', 'restaurant', 'restaurants', 'order', 'customers']
];

const SIMILARITY_SYNONYMS = SIMILARITY_SYNONYM_GROUPS.reduce<Record<string, string>>((lookup, group) => {
  const canonical = group[0];
  group.forEach(word => {
    lookup[word] = canonical;
  });
  return lookup;
}, {});

const normalizeSimilarityText = (value: string = '') => {
  let text = String(value).toLowerCase();
  SIMILARITY_PHRASES.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeSimilarityToken = (token: string) => {
  let normalized = SIMILARITY_SYNONYMS[token] || token;
  if (normalized.length > 5 && normalized.endsWith('ies')) normalized = `${normalized.slice(0, -3)}y`;
  else if (normalized.length > 5 && normalized.endsWith('ing')) normalized = normalized.slice(0, -3);
  else if (normalized.length > 4 && normalized.endsWith('ed')) normalized = normalized.slice(0, -2);
  else if (normalized.length > 4 && normalized.endsWith('s')) normalized = normalized.slice(0, -1);
  return SIMILARITY_SYNONYMS[normalized] || normalized;
};

const tokenizeSimilarityText = (value: string = '') => {
  const normalized = normalizeSimilarityText(value);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map(normalizeSimilarityToken)
    .filter(token => token.length > 1 && !SIMILARITY_STOP_WORDS.has(token));
};

const termFrequency = (tokens: string[]) => {
  const counts = new Map<string, number>();
  tokens.forEach(token => counts.set(token, (counts.get(token) || 0) + 1));
  return counts;
};

const tokenCosineSimilarity = (tokensA: string[], tokensB: string[]) => {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const countsA = termFrequency(tokensA);
  const countsB = termFrequency(tokensB);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  countsA.forEach((countA, token) => {
    dotProduct += countA * (countsB.get(token) || 0);
    normA += countA * countA;
  });
  countsB.forEach(countB => {
    normB += countB * countB;
  });

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const vectorCosineSimilarity = (vectorA: number[], vectorB: number[]) => {
  if (vectorA.length === 0 || vectorA.length !== vectorB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i += 1) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const conceptVector = (value: string = '') => {
  const normalized = normalizeSimilarityText(value);
  const compact = normalized.replace(/final year/g, 'finalyear');
  const tokens = new Set(
    compact
      .split(' ')
      .map(normalizeSimilarityToken)
      .filter(token => token.length > 1)
  );

  return SIMILARITY_CONCEPT_GROUPS.map(group => {
    let score = 0;
    group.forEach(word => {
      if (tokens.has(word) || compact.includes(word)) score += 1;
    });
    return score;
  });
};

const conceptSimilarity = (textA: string = '', textB: string = '') =>
  vectorCosineSimilarity(conceptVector(textA), conceptVector(textB));

const overlapScores = (tokensA: string[], tokensB: string[]) => {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return { dice: 0, containment: 0 };
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersectionSize = Array.from(setA).filter(token => setB.has(token)).length;

  return {
    dice: (2 * intersectionSize) / (setA.size + setB.size),
    containment: intersectionSize / Math.max(1, Math.min(setA.size, setB.size))
  };
};

const ngrams = (tokens: string[], size = 2) => {
  if (tokens.length < size) return [];
  const grams: string[] = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    grams.push(tokens.slice(i, i + size).join(' '));
  }
  return grams;
};

const scoreTextSimilarity = (textA: string = '', textB: string = '') => {
  const normalizedA = normalizeSimilarityText(textA);
  const normalizedB = normalizeSimilarityText(textB);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const tokensA = tokenizeSimilarityText(normalizedA);
  const tokensB = tokenizeSimilarityText(normalizedB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const cosine = tokenCosineSimilarity(tokensA, tokensB);
  const { dice, containment } = overlapScores(tokensA, tokensB);
  const bigramDice = overlapScores(ngrams(tokensA), ngrams(tokensB)).dice;
  const inclusionBoost = normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA) ? 0.12 : 0;

  return Math.min(
    1,
    (cosine * 0.45) + (dice * 0.25) + (containment * 0.2) + (bigramDice * 0.1) + inclusionBoost
  );
};

const candidateDescription = (project: SimilarityCandidate) => project.description || project.abstract || '';

const candidateTechnologies = (project: SimilarityCandidate) => [
  ...(project.technologies || []),
  ...(project.toolsOrMethods || [])
];

const candidateContext = (project: SimilarityCandidate) => [
  candidateDescription(project),
  project.problemStatement || '',
  ...(project.objectives || []),
  ...(project.features || []),
  ...(project.expectedOutputs || []),
  ...candidateTechnologies(project)
].join(' ');

const scoreCandidateSimilarity = (newTitle: string, newDesc: string, project: SimilarityCandidate) => {
  const titleScore = scoreTextSimilarity(newTitle, project.title || '');
  const descriptionScore = scoreTextSimilarity(newDesc, candidateDescription(project));
  const submittedContext = `${newTitle} ${newDesc}`;
  const storedContext = `${project.title || ''} ${candidateContext(project)}`;
  const contextScore = scoreTextSimilarity(submittedContext, storedContext);
  const semanticScore = conceptSimilarity(submittedContext, storedContext);

  let score = (titleScore * 0.3) + (descriptionScore * 0.35) + (contextScore * 0.15) + (semanticScore * 0.2);
  if (titleScore >= 0.9 && descriptionScore >= 0.5) score = Math.max(score, 0.82);
  else if (titleScore >= 0.9) score = Math.max(score, 0.65);
  if (descriptionScore >= 0.85 && contextScore >= 0.5) score = Math.max(score, 0.75);
  if (semanticScore >= 0.85 && (descriptionScore >= 0.25 || contextScore >= 0.25)) score = Math.max(score, 0.72);
  else if (semanticScore >= 0.75 && (descriptionScore >= 0.15 || contextScore >= 0.15)) score = Math.max(score, 0.5);

  const matchedSections = [
    titleScore >= 0.35 ? 'title' : '',
    descriptionScore >= 0.35 ? 'description' : '',
    contextScore >= 0.35 ? 'content' : '',
    semanticScore >= 0.5 ? 'semantic concepts' : ''
  ].filter(Boolean);

  return {
    score: Math.round(Math.min(100, Math.max(0, score * 100))),
    matchedSections
  };
};

export const checkProjectSimilarity = async (
  newTitle: string, 
  newDesc: string, 
  existingProjects: SimilarityCandidate[]
): Promise<{ 
  score: number; 
  risk: 'Low' | 'Medium' | 'High'; 
  analysis: string; 
  mostSimilarProject?: string;
  similarProjects: SimilarProject[];
}> => {
  try {
    const candidates = existingProjects.filter(project => project.title && candidateDescription(project));
    if (candidates.length === 0) {
      return {
        score: 0,
        risk: 'Low',
        analysis: 'No existing projects were available for comparison.',
        similarProjects: []
      };
    }

    const scoredProjects = candidates
      .map(project => {
        const { score, matchedSections } = scoreCandidateSimilarity(newTitle, newDesc, project);
        return {
          title: project.title || '',
          description: candidateDescription(project),
          studentName: project.studentName || project.archivedStudentName,
          technologies: candidateTechnologies(project),
          similarityScore: score,
          matchedSections
        };
      })
      .sort((a, b) => b.similarityScore - a.similarityScore);

    const topMatch = scoredProjects[0];
    const highestScore = topMatch?.similarityScore || 0;
    let highestRisk: 'Low' | 'Medium' | 'High' = highestScore >= 70 ? 'High' : highestScore >= 35 ? 'Medium' : 'Low';
    const mostSimilarProject = topMatch?.title || '';
    const similarProjects = scoredProjects.filter(project => project.similarityScore > 20);
    let analysis = '';
    
    // Determine risk level based on score
    if (highestScore >= 70) {
      highestRisk = 'High';
      analysis = `⚠️ HIGH SIMILARITY DETECTED (${highestScore.toFixed(0)}%): Your project "${newTitle}" is very similar to "${mostSimilarProject}". This may be considered duplicate work. Please consider modifying your approach or choosing a different topic.`;
    } else if (highestScore >= 35) {
      highestRisk = 'Medium';
      analysis = `⚡ MODERATE SIMILARITY (${highestScore.toFixed(0)}%): Your project has some overlap with "${mostSimilarProject}". Consider differentiating your approach or adding unique features.`;
    } else {
      highestRisk = 'Low';
      analysis = `✅ LOW SIMILARITY (${highestScore.toFixed(0)}%): Your project appears to be unique. Good to proceed!`;
    }
    
    console.log(`Similarity check complete: ${highestScore.toFixed(0)}% similar to "${mostSimilarProject}". Found ${similarProjects.length} similar projects.`);

    analysis = highestRisk === 'High'
      ? `High similarity detected (${highestScore}%). Your project "${newTitle}" is very similar to "${mostSimilarProject}". Please change the topic or clearly differentiate the approach before submitting.`
      : highestRisk === 'Medium'
        ? `Moderate similarity detected (${highestScore}%). Your project overlaps with "${mostSimilarProject}". Add clearer unique scope, methods, or outputs.`
        : `Low similarity detected (${highestScore}%). No major overlap was found in the available project records.`;
    
    return { 
      score: Math.round(highestScore), 
      risk: highestRisk, 
      analysis,
      mostSimilarProject,
      similarProjects
    };
  } catch (error) {
    console.error("Similarity Check Error:", error);
    return { score: 0, risk: "Low", analysis: "Similarity check could not be completed. Please try again.", similarProjects: [] };
  }
};

// ============================================================================
// INTELLIGENT SUPERVISOR MATCHING SYSTEM v2
// Simple but effective: Direct word matching with smart synonyms
// ============================================================================

// Synonym groups - words that mean the same thing
const SYNONYMS: Record<string, string[]> = {
  // AI & Machine Learning
  'ai': ['artificial intelligence', 'ai', 'intelligent', 'smart'],
  'ml': ['machine learning', 'ml', 'deep learning', 'neural', 'tensorflow', 'pytorch', 'keras', 'model'],
  'nlp': ['nlp', 'natural language', 'text', 'chatbot', 'language processing', 'sentiment'],
  'vision': ['computer vision', 'image', 'opencv', 'yolo', 'recognition', 'detection', 'camera'],
  'data': ['data science', 'data analysis', 'analytics', 'statistics', 'visualization', 'big data'],
  
  // Web & Mobile
  'web': ['web', 'website', 'frontend', 'backend', 'fullstack', 'html', 'css'],
  'react': ['react', 'reactjs', 'next.js', 'nextjs', 'redux'],
  'node': ['node', 'nodejs', 'express', 'javascript', 'js', 'typescript'],
  'mobile': ['mobile', 'android', 'ios', 'flutter', 'react native', 'app'],
  'python': ['python', 'django', 'flask', 'pandas', 'numpy'],
  
  // Infrastructure
  'iot': ['iot', 'internet of things', 'sensor', 'arduino', 'raspberry', 'embedded', 'smart home', 'automation', 'hardware'],
  'cloud': ['cloud', 'aws', 'azure', 'docker', 'kubernetes', 'devops'],
  'database': ['database', 'sql', 'mysql', 'mongodb', 'postgresql', 'firebase', 'nosql'],
  'network': ['network', 'networking', 'tcp', 'protocol', 'routing'],
  
  // Security & Blockchain
  'security': ['security', 'cybersecurity', 'encryption', 'authentication', 'firewall', 'hacking'],
  'blockchain': ['blockchain', 'crypto', 'ethereum', 'smart contract', 'decentralized', 'hyperledger'],
  
  // Domains
  'health': ['health', 'healthcare', 'medical', 'hospital', 'patient', 'clinical', 'diagnosis'],
  'finance': ['finance', 'fintech', 'banking', 'payment', 'trading'],
  'education': ['education', 'learning', 'lms', 'e-learning', 'teaching', 'student', 'course'],
  'agriculture': ['agriculture', 'farm', 'crop', 'drone', 'plant', 'soil'],
  'traffic': ['traffic', 'vehicle', 'car', 'transport', 'road', 'driving']
};

// Get all words that match a concept
const getConceptWords = (concept: string): string[] => {
  return SYNONYMS[concept] || [concept];
};

// Check if text contains any word from a concept
const textMatchesConcept = (text: string, concept: string): boolean => {
  const words = getConceptWords(concept);
  const lowerText = text.toLowerCase();
  return words.some(word => lowerText.includes(word.toLowerCase()));
};

// Extract all matching concepts from text
const extractConcepts = (text: string): string[] => {
  const concepts: string[] = [];
  Object.keys(SYNONYMS).forEach(concept => {
    if (textMatchesConcept(text, concept)) {
      concepts.push(concept);
    }
  });
  return concepts;
};

// Main matching function - INTELLIGENT SCORING
const calculateLocalMatch = (project: ProjectProposal, supervisor: User): { score: number; reason: string; matchedAreas: string[] } => {
  // Use only the six approved project comparison fields.
  const projectText = [
    project.title || '',
    project.description || '',
    project.problemStatement || '',
    ...(project.objectives || []),
    ...(project.features || []),
    ...(project.technologies || project.toolsOrMethods || [])
  ].join(' ').toLowerCase();
  
  // Use only the seven approved supervisor fields. Name is intentionally excluded.
  const supervisorComparisonValues = [
    ...(supervisor.researchInterests || []),
    ...(supervisor.areasOfExpertise || []),
    supervisor.academicSpecialization || '',
    ...(supervisor.skills || []),
    ...(supervisor.supervisorTechnologies || []),
    ...(supervisor.previousSupervisedProjectTopics || []),
    ...(supervisor.publicationKeywords || [])
  ];
  const supervisorText = supervisorComparisonValues.join(' ').toLowerCase();
  
  // Extract concepts from both
  const projectConcepts = extractConcepts(projectText);
  const supervisorConcepts = extractConcepts(supervisorText);
  
  // Find concept matches
  const matchedConcepts = projectConcepts.filter(c => supervisorConcepts.includes(c));
  
  // Direct word matching on expertise - more thorough
  const directExpertiseMatches: string[] = [];
  const projectTechs = project.technologies || [];
  
  supervisorComparisonValues.filter(Boolean).forEach(exp => {
    const expLower = exp.toLowerCase();
    const expWords = expLower.split(/\s+/);
    
    // Check if expertise appears in project text
    if (projectText.includes(expLower)) {
      directExpertiseMatches.push(exp);
      return;
    }
    
    // Check individual words of expertise
    for (const word of expWords) {
      if (word.length > 2 && projectText.includes(word)) {
        if (!directExpertiseMatches.includes(exp)) {
          directExpertiseMatches.push(exp);
        }
        return;
      }
    }
    
    // Check against project technologies
    for (const tech of projectTechs) {
      const techLower = tech.toLowerCase();
      if (expLower.includes(techLower) || techLower.includes(expLower)) {
        if (!directExpertiseMatches.includes(exp)) {
          directExpertiseMatches.push(exp);
        }
        return;
      }
    }
  });
  
  // Check structured supervisor fields for project keywords.
  let profileKeywordMatches = 0;
  const projectKeywords = projectText.split(/\s+/).filter(w => w.length > 3);
  projectKeywords.forEach(keyword => {
    if (supervisorText.includes(keyword)) {
      profileKeywordMatches++;
    }
  });
  
  // Calculate score with better distribution
  let score = 0;
  const matchedAreas: string[] = [...directExpertiseMatches];
  // Direct structured-profile matches (25 points each, up to 50)
  const expertiseScore = Math.min(50, directExpertiseMatches.length * 25);
  score += expertiseScore;

  // Concept matches (12 points each, up to 24)
  const conceptScore = Math.min(24, matchedConcepts.length * 12);
  score += conceptScore;
  
  // Keyword overlap from the seven structured fields (up to 26 points)
  score += Math.min(26, profileKeywordMatches * 2);
  
  // Perfect match bonus: if 3+ expertise matches, add bonus
  if (directExpertiseMatches.length >= 3) {
    score += 10;
  }

  // Faculty and workload adjustment
  const sameFaculty = refId(project.facultyId) && refId(project.facultyId) === refId(supervisor.facultyId);
  if (sameFaculty) score += 8;
  if (!sameFaculty && supervisor.crossFacultyEligible) score += 4;

  const maxProjects = supervisor.maxProjects || 5;
  const currentProjects = supervisor.currentProjects || 0;
  const workloadRatio = Math.min(1, currentProjects / Math.max(maxProjects, 1));
  score += Math.round((1 - workloadRatio) * 10);
  if (currentProjects >= maxProjects) score -= 25;
  
  // Cap at 100
  score = Math.min(100, score);
  
  // Generate intelligent reason
  let reason = '';
  
  if (directExpertiseMatches.length >= 3) {
    reason = `Expert in ${directExpertiseMatches.slice(0, 3).join(', ')}. Perfect match for this project!`;
  } else if (directExpertiseMatches.length >= 2) {
    reason = `Expert in ${directExpertiseMatches.join(', ')}. Excellent fit for supervision.`;
  } else if (directExpertiseMatches.length === 1) {
    reason = `Has expertise in ${directExpertiseMatches[0]}. Strong candidate for supervision.`;
  } else if (matchedConcepts.length > 0) {
    reason = `Background in ${matchedConcepts.slice(0, 2).join(', ')} relates to project domain.`;
  } else if (supervisorComparisonValues.length > 0) {
    reason = `Profile: ${supervisorComparisonValues.slice(0, 2).join(', ')}. Limited direct overlap with this project.`;
    score = Math.max(10, score);
  } else {
    reason = 'No expertise listed. Please update supervisor profile.';
    score = 5;
  }
  
  if (currentProjects >= maxProjects) {
    reason += ' Workload is at capacity.';
  } else {
    reason += ` Workload ${currentProjects}/${maxProjects}.`;
  }
  
  if (profileKeywordMatches >= 5 && score >= 70) {
    reason += ' Structured research profile strongly aligns with the project.';
  }
  
  return { score, reason, matchedAreas };
};

// Main supervisor recommendation function - LOCAL ONLY (no external API)
export const recommendSupervisors = (
  project: ProjectProposal, 
  supervisors: User[]
): SupervisorRecommendation[] => {
  console.log('Local Supervisor Matching - Project:', project.title);
  console.log('Local Supervisor Matching - Supervisors:', supervisors.length);
  
  if (supervisors.length === 0) {
    console.warn('No supervisors available for matching');
    return [];
  }
  
  // Calculate match scores for all supervisors
  const results = supervisors.map(sup => {
    const { score, reason, matchedAreas } = calculateLocalMatch(project, sup);
    console.log(`Match: ${sup.name} - Score: ${score}%, Areas: ${matchedAreas.join(', ')}`);
    return {
      supervisorId: sup.id,
      supervisorName: sup.name,
      matchScore: score,
      reason: reason
    };
  });
  
  // Sort by score descending
  const sorted = results.sort((a, b) => b.matchScore - a.matchScore);
  console.log('Final recommendations:', sorted);
  
  return sorted;
};
