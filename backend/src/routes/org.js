const express = require('express');
const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const Department = require('../models/Department');
const Program = require('../models/Program');
const ResearchDomain = require('../models/ResearchDomain');
const ProjectCategory = require('../models/ProjectCategory');
const AcademicYear = require('../models/AcademicYear');

const router = express.Router();

const isObjectId = (value) => value && mongoose.Types.ObjectId.isValid(value.toString());
const activeFilter = (query = {}) => ({ isActive: true, ...query });
const clean = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

function fallbackCategories({ facultyId = '', departmentId = '' } = {}) {
  return [
    {
      _id: '000000000000000000000101',
      facultyId,
      departmentId,
      name: 'Software System',
      description: 'Default graduation project category for proposal submission.',
      expectedOutputs: ['Working prototype', 'Technical report', 'Testing evidence'],
      requiredProposalFields: ['title', 'description', 'problemStatement', 'features', 'toolsOrMethods'],
      outputLabel: 'Features / expected outputs',
      toolsLabel: 'Tools, methods, or technologies',
      isActive: true
    }
  ];
}

function fallbackDomains({ facultyId = '' } = {}) {
  return [
    {
      _id: '000000000000000000000201',
      name: 'Artificial Intelligence',
      aliases: ['AI', 'Machine Learning'],
      keywords: ['ai', 'machine learning', 'deep learning', 'semantic similarity'],
      facultyIds: facultyId ? [facultyId] : [],
      isActive: true
    },
    {
      _id: '000000000000000000000202',
      name: 'Software Engineering',
      aliases: ['Software Systems'],
      keywords: ['software', 'web', 'mobile', 'testing'],
      facultyIds: facultyId ? [facultyId] : [],
      isActive: true
    }
  ];
}

function fallbackPrograms({ facultyId = '', departmentId = '' } = {}) {
  return [
    {
      _id: '000000000000000000000301',
      facultyId,
      departmentId,
      name: 'Undergraduate Program',
      level: 'Undergraduate',
      code: 'UG',
      isActive: true
    }
  ];
}

function fallbackAcademicYear() {
  const currentYear = new Date().getFullYear();
  return {
    _id: '000000000000000000000401',
    label: `${currentYear}/${currentYear + 1}`,
    isActive: true
  };
}

async function resolveFacultyId({ facultyId, departmentId }) {
  if (isObjectId(facultyId)) return facultyId;
  if (!isObjectId(departmentId)) return '';

  const department = await Department.findById(departmentId).select('facultyId');
  return department?.facultyId?.toString() || '';
}

async function categoryQueryFromRequest(req) {
  const facultyId = await resolveFacultyId(req.query);
  const { departmentId } = req.query;

  if (isObjectId(departmentId) && facultyId) {
    return activeFilter({
      $or: [
        { departmentId },
        { facultyId, departmentId: { $exists: false } },
        { facultyId, departmentId: null }
      ]
    });
  }

  if (facultyId) {
    return activeFilter({ facultyId });
  }

  return activeFilter();
}

function formFields(categories = []) {
  const requiredProposalFields = Array.from(new Set([
    'title',
    'description',
    'features',
    ...categories.flatMap(category => category.requiredProposalFields || [])
  ]));

  return {
    requiredFields: requiredProposalFields,
    requiredProposalFields,
    fields: [
      { name: 'title', label: 'Project Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
      { name: 'problemStatement', label: 'Problem Statement', type: 'textarea', required: requiredProposalFields.includes('problemStatement') },
      { name: 'features', label: categories[0]?.outputLabel || 'Features / expected outputs', type: 'textarea-list', required: true },
      { name: 'toolsOrMethods', label: categories[0]?.toolsLabel || 'Tools, methods, or technologies', type: 'text-list', required: requiredProposalFields.includes('toolsOrMethods') },
    ],
    labels: {
      outputLabel: categories[0]?.outputLabel || 'Features / expected outputs',
      toolsLabel: categories[0]?.toolsLabel || 'Tools, methods, or technologies'
    }
  };
}

router.get('/summary', async (req, res) => {
  try {
    const [faculties, departments, programs, domains, categories, academicYears] = await Promise.all([
      Faculty.find(activeFilter()).sort('name'),
      Department.find(activeFilter()).sort('name'),
      Program.find(activeFilter()).sort('name'),
      ResearchDomain.find(activeFilter()).sort('name'),
      ProjectCategory.find(activeFilter()).sort('name'),
      AcademicYear.find().sort({ isActive: -1, startsAt: -1 })
    ]);

    res.json({ faculties, departments, programs, domains, categories, academicYears });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/faculties', async (req, res) => {
  try {
    const faculties = await Faculty.find(activeFilter()).sort('name');
    res.json(faculties);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/departments', async (req, res) => {
  try {
    const query = activeFilter(clean({
      facultyId: isObjectId(req.query.facultyId) ? req.query.facultyId : undefined
    }));
    const departments = await Department.find(query).sort('name');
    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/programs', async (req, res) => {
  try {
    const facultyId = await resolveFacultyId(req.query);
    const departmentId = isObjectId(req.query.departmentId) ? req.query.departmentId : '';
    const query = activeFilter(clean({
      facultyId: facultyId || undefined,
      departmentId: departmentId || undefined
    }));
    const programs = await Program.find(query).sort('name');
    res.json(programs.length ? programs : fallbackPrograms({ facultyId, departmentId }));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const facultyId = await resolveFacultyId(req.query);
    const departmentId = isObjectId(req.query.departmentId) ? req.query.departmentId : '';
    const categories = await ProjectCategory.find(await categoryQueryFromRequest(req)).sort('name');
    res.json(categories.length ? categories : fallbackCategories({ facultyId, departmentId }));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/project-categories', async (req, res) => {
  try {
    const facultyId = await resolveFacultyId(req.query);
    const departmentId = isObjectId(req.query.departmentId) ? req.query.departmentId : '';
    const categories = await ProjectCategory.find(await categoryQueryFromRequest(req)).sort('name');
    res.json(categories.length ? categories : fallbackCategories({ facultyId, departmentId }));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/research-domains', async (req, res) => {
  try {
    const facultyId = await resolveFacultyId(req.query);
    const query = activeFilter();
    if (facultyId) {
      query.$or = [
        { facultyIds: facultyId },
        { facultyIds: { $exists: false } },
        { facultyIds: { $size: 0 } }
      ];
    }

    const domains = await ResearchDomain.find(query).sort('name');
    res.json(domains.length ? domains : fallbackDomains({ facultyId }));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/domains', async (req, res) => {
  try {
    const facultyId = await resolveFacultyId(req.query);
    const query = activeFilter();
    if (facultyId) {
      query.$or = [
        { facultyIds: facultyId },
        { facultyIds: { $exists: false } },
        { facultyIds: { $size: 0 } }
      ];
    }

    const domains = await ResearchDomain.find(query).sort('name');
    res.json(domains.length ? domains : fallbackDomains({ facultyId }));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/academic-years', async (req, res) => {
  try {
    const academicYears = await AcademicYear.find().sort({ isActive: -1, startsAt: -1 });
    res.json(academicYears.length ? academicYears : [fallbackAcademicYear()]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/form-configs/:facultyId', async (req, res) => {
  try {
    const facultyId = isObjectId(req.params.facultyId) ? req.params.facultyId : '';
    const departmentId = isObjectId(req.query.departmentId) ? req.query.departmentId : undefined;
    const categories = await ProjectCategory.find(await categoryQueryFromRequest({
      query: { facultyId, departmentId }
    })).sort('name');
    const domainQuery = activeFilter();
    if (facultyId) {
      domainQuery.$or = [
        { facultyIds: facultyId },
        { facultyIds: { $exists: false } },
        { facultyIds: { $size: 0 } }
      ];
    }
    const domains = await ResearchDomain.find(domainQuery).sort('name');
    const activeAcademicYear = await AcademicYear.findOne({ isActive: true }).sort({ startsAt: -1 });
    const formCategories = categories.length ? categories : fallbackCategories({ facultyId, departmentId });
    const formDomains = domains.length ? domains : fallbackDomains({ facultyId });

    res.json({
      facultyId,
      departmentId,
      categories: formCategories,
      projectCategories: formCategories,
      domains: formDomains,
      researchDomains: formDomains,
      activeAcademicYear: activeAcademicYear || fallbackAcademicYear(),
      ...formFields(formCategories)
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
