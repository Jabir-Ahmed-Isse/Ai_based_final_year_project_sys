const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const SimilarityReport = require('../models/SimilarityReport');
const Project = require('../models/Project');
const { buildProjectCombinedText, ensureProjectEmbedding } = require('../services/similarityService');

const router = express.Router();
const AI_SERVICE_URLS = [
  process.env.AI_SERVICE_URL || process.env.PYTHON_AI_URL,
  'http://localhost:5001/api/ai',
  'http://localhost:5002/api/ai',
].filter(Boolean);

function refId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return value._id.toString();
  if (value.id) return value.id.toString();
  return value.toString ? value.toString() : '';
}

function refName(value) {
  if (!value || typeof value === 'string') return '';
  return value.name || '';
}

function normalizeTitle(title = '') {
  return String(title).trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function projectTitle(project, fallback = '') {
  if (project && typeof project === 'object' && project.title) return project.title;
  return fallback || 'Untitled Project';
}

function projectSide(project, fallbackTitle, fallbackFaculty, fallbackDepartment) {
  return {
    id: refId(project),
    title: projectTitle(project, fallbackTitle),
    facultyId: refId(project?.facultyId) || refId(fallbackFaculty),
    facultyName: refName(fallbackFaculty) || refName(project?.facultyId),
    departmentId: refId(project?.departmentId) || refId(fallbackDepartment),
    departmentName: refName(fallbackDepartment) || refName(project?.departmentId),
  };
}

function isSelfComparison(first, second) {
  if (first.id && second.id && first.id === second.id) return true;
  if (!first.id || !second.id) {
    return normalizeTitle(first.title) && normalizeTitle(first.title) === normalizeTitle(second.title);
  }
  return false;
}

function pairKey(first, second) {
  const firstKey = first.id || `title:${normalizeTitle(first.title)}`;
  const secondKey = second.id || `title:${normalizeTitle(second.title)}`;
  return [firstKey, secondKey].sort().join('__');
}

function matchesText(row, titleQuery) {
  if (!titleQuery) return true;
  const query = titleQuery.toLowerCase();
  return row.firstProjectTitle.toLowerCase().includes(query) ||
    row.secondProjectTitle.toLowerCase().includes(query);
}

function matchesAcademicScope(row, facultyId, departmentId) {
  const facultyMatch = !facultyId || row.firstFacultyId === facultyId || row.secondFacultyId === facultyId;
  const departmentMatch = !departmentId || row.firstDepartmentId === departmentId || row.secondDepartmentId === departmentId;
  return facultyMatch && departmentMatch;
}

async function postToPython(path, body) {
  const errors = [];
  for (const baseUrl of AI_SERVICE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      errors.push(`${baseUrl}: ${payload.error || payload.message || response.status}`);
    } catch (error) {
      errors.push(`${baseUrl}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

async function analyzeWithPython(comparisons, riskLevel) {
  return postToPython('/similarity-results/analyze', {
    comparisons,
    riskLevel: riskLevel && riskLevel !== 'All' ? riskLevel : undefined,
  });
}

async function analyzeAllProjectsWithPython(projects, filters) {
  return postToPython('/similarity-results/all-projects', { projects, filters });
}

function populatedName(value) {
  if (!value || typeof value === 'string') return '';
  return value.name || value.label || '';
}

function projectReportPayload(project, embeddingPayload) {
  return {
    id: project._id.toString(),
    title: project.title || 'Untitled Project',
    description: project.abstract || project.description || '',
    combinedText: embeddingPayload.combinedText || buildProjectCombinedText(project),
    embedding: embeddingPayload.embedding || [],
    facultyId: refId(project.facultyId),
    facultyName: populatedName(project.facultyId),
    departmentId: refId(project.departmentId),
    departmentName: populatedName(project.departmentId) || project.department || '',
    academicYearId: refId(project.academicYearId),
    academicYear: populatedName(project.academicYearId) || project.archivedYear || '',
    submissionDate: project.submissionDate || project.createdAt,
  };
}

// @route   GET /api/similarity-results
// @desc    Return analysed similarity comparison results for admin dashboards
// @access  Private (Admin)
router.get('/', [protect, authorize('admin')], async (req, res) => {
  try {
    const {
      riskLevel,
      title,
      facultyId,
      departmentId,
      startDate,
      endDate,
    } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = endOfDay(endDate);
    }

    const reports = await SimilarityReport.find(query)
      .sort({ createdAt: -1 })
      .populate('projectId', 'title facultyId departmentId')
      .populate('academicContext.facultyId', 'name code')
      .populate('academicContext.departmentId', 'name code')
      .populate('matchedProjects.projectId', 'title facultyId departmentId')
      .populate('matchedProjects.facultyId', 'name code')
      .populate('matchedProjects.departmentId', 'name code')
      .lean();

    const pairMap = new Map();

    reports.forEach(report => {
      const first = projectSide(
        report.projectId,
        '',
        report.academicContext?.facultyId,
        report.academicContext?.departmentId
      );

      (report.matchedProjects || []).forEach((match, index) => {
        const second = projectSide(
          match.projectId,
          match.title,
          match.facultyId,
          match.departmentId
        );

        if (!first.title || !second.title || isSelfComparison(first, second)) return;

        const score = normalizeScore(match.displayedPercentage ?? match.score ?? match.similarity);
        const comparisonDate = report.createdAt || report.updatedAt || new Date();
        const row = {
          id: `${report._id}-${match._id || index}`,
          reportId: report._id?.toString(),
          firstProjectId: first.id,
          firstProjectTitle: first.title,
          firstFacultyId: first.facultyId,
          firstFacultyName: first.facultyName,
          firstDepartmentId: first.departmentId,
          firstDepartmentName: first.departmentName,
          secondProjectId: second.id,
          secondProjectTitle: second.title,
          secondFacultyId: second.facultyId,
          secondFacultyName: second.facultyName,
          secondDepartmentId: second.departmentId,
          secondDepartmentName: second.departmentName,
          similarityPercentage: Number(score.toFixed(2)),
          originalRiskLevel: match.riskLevel || report.riskLevel || 'Low',
          comparisonDate: new Date(comparisonDate).toISOString(),
          pairLabel: `${first.title} vs ${second.title}`,
          similarityLabel: match.similarityLabel || report.similarityLabel || '',
        };

        if (!matchesText(row, title || '')) return;
        if (!matchesAcademicScope(row, facultyId || '', departmentId || '')) return;

        const key = pairKey(first, second);
        const existing = pairMap.get(key);
        if (
          !existing ||
          row.similarityPercentage > existing.similarityPercentage ||
          (
            row.similarityPercentage === existing.similarityPercentage &&
            new Date(row.comparisonDate).getTime() > new Date(existing.comparisonDate).getTime()
          )
        ) {
          pairMap.set(key, row);
        }
      });
    });

    const comparisons = Array.from(pairMap.values())
      .sort((a, b) => b.similarityPercentage - a.similarityPercentage);

    const analysis = await analyzeWithPython(comparisons, riskLevel || '');

    res.json({
      ...analysis,
      generatedAt: new Date().toISOString(),
      filters: {
        riskLevel: riskLevel || '',
        title: title || '',
        facultyId: facultyId || '',
        departmentId: departmentId || '',
        startDate: startDate || '',
        endDate: endDate || '',
      },
    });
  } catch (err) {
    console.error('Similarity results analysis failed:', err.message);
    res.status(502).json({
      message: 'Could not analyse similarity results. Make sure the Python AI service is running on port 5001 or 5002.',
      detail: err.message,
    });
  }
});

// @route   GET /api/similarity-results/all-projects
// @desc    Compare every valid stored project against every other project using existing embeddings
// @access  Private (Admin)
router.get('/all-projects', [protect, authorize('admin')], async (req, res) => {
  try {
    const {
      riskLevel,
      title,
      facultyId,
      departmentId,
      startDate,
      endDate,
    } = req.query;

    const validStatuses = ['submitted', 'under_review', 'approved', 'rejected', 'changes_requested', 'in_progress', 'completed'];
    const projects = await Project.find({
      status: { $in: validStatuses },
      title: { $exists: true, $ne: '' },
      abstract: { $exists: true, $ne: '' },
    })
      .sort({ title: 1 })
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code')
      .populate('academicYearId', 'label')
      .select('title abstract features facultyId departmentId academicYearId department archivedYear submissionDate createdAt semanticEmbedding status');

    const payload = [];
    for (const project of projects) {
      try {
        const embeddingPayload = await ensureProjectEmbedding(project, { persist: true });
        if (embeddingPayload.embedding?.length) {
          payload.push(projectReportPayload(project, embeddingPayload));
        }
      } catch (error) {
        console.error(`Could not prepare project ${project._id} for all-project similarity analysis:`, error.message);
      }
    }

    const analysis = await analyzeAllProjectsWithPython(payload, {
      riskLevel: riskLevel || '',
      title: title || '',
      facultyId: facultyId || '',
      departmentId: departmentId || '',
      startDate: startDate || '',
      endDate: endDate || '',
    });

    res.json({
      ...analysis,
      filters: {
        riskLevel: riskLevel || '',
        title: title || '',
        facultyId: facultyId || '',
        departmentId: departmentId || '',
        startDate: startDate || '',
        endDate: endDate || '',
      },
    });
  } catch (err) {
    console.error('All-project similarity analysis failed:', err.message);
    res.status(502).json({
      message: 'Could not generate all-project similarity visual report. Make sure the Python AI service is running on port 5001 or 5002.',
      detail: err.message,
    });
  }
});

module.exports = router;
