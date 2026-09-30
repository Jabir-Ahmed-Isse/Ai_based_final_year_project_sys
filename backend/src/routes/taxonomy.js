const express = require('express');
const Faculty = require('../models/Faculty');
const Department = require('../models/Department');
const Program = require('../models/Program');
const ResearchDomain = require('../models/ResearchDomain');
const ProjectCategory = require('../models/ProjectCategory');
const AcademicYear = require('../models/AcademicYear');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const activeFilter = (query = {}) => ({ isActive: true, ...query });

const clean = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

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
    console.error('Error fetching taxonomy summary:', err);
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

router.post('/faculties', [protect, authorize('admin')], async (req, res) => {
  try {
    const faculty = await Faculty.create(clean({
      name: req.body.name,
      code: req.body.code,
      description: req.body.description,
      isActive: req.body.isActive
    }));
    res.status(201).json(faculty);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/faculties/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndUpdate(req.params.id, { $set: clean(req.body) }, { new: true });
    if (!faculty) return res.status(404).json({ message: 'Faculty not found' });
    res.json(faculty);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/departments', async (req, res) => {
  try {
    const query = activeFilter(clean({ facultyId: req.query.facultyId }));
    const departments = await Department.find(query).sort('name');
    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/departments', [protect, authorize('admin')], async (req, res) => {
  try {
    const department = await Department.create(clean({
      facultyId: req.body.facultyId,
      name: req.body.name,
      code: req.body.code,
      isActive: req.body.isActive
    }));
    res.status(201).json(department);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/departments/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const department = await Department.findByIdAndUpdate(req.params.id, { $set: clean(req.body) }, { new: true });
    if (!department) return res.status(404).json({ message: 'Department not found' });
    res.json(department);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/programs', async (req, res) => {
  try {
    const query = activeFilter(clean({
      facultyId: req.query.facultyId,
      departmentId: req.query.departmentId
    }));
    const programs = await Program.find(query).sort('name');
    res.json(programs);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/programs', [protect, authorize('admin')], async (req, res) => {
  try {
    const program = await Program.create(clean({
      facultyId: req.body.facultyId,
      departmentId: req.body.departmentId,
      name: req.body.name,
      level: req.body.level,
      code: req.body.code,
      isActive: req.body.isActive
    }));
    res.status(201).json(program);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/programs/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const program = await Program.findByIdAndUpdate(req.params.id, { $set: clean(req.body) }, { new: true });
    if (!program) return res.status(404).json({ message: 'Program not found' });
    res.json(program);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/domains', async (req, res) => {
  try {
    const query = activeFilter();
    if (req.query.facultyId) query.facultyIds = req.query.facultyId;

    const domains = await ResearchDomain.find(query).sort('name');
    res.json(domains);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/domains', [protect, authorize('admin')], async (req, res) => {
  try {
    const domain = await ResearchDomain.create(clean({
      name: req.body.name,
      aliases: req.body.aliases || [],
      keywords: req.body.keywords || [],
      relatedDomainIds: req.body.relatedDomainIds || [],
      facultyIds: req.body.facultyIds || [],
      isActive: req.body.isActive
    }));
    res.status(201).json(domain);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/domains/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const domain = await ResearchDomain.findByIdAndUpdate(req.params.id, { $set: clean(req.body) }, { new: true });
    if (!domain) return res.status(404).json({ message: 'Research domain not found' });
    res.json(domain);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/project-categories', async (req, res) => {
  try {
    const query = activeFilter(clean({
      facultyId: req.query.facultyId,
      departmentId: req.query.departmentId
    }));
    const categories = await ProjectCategory.find(query).sort('name');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/project-categories', [protect, authorize('admin')], async (req, res) => {
  try {
    const category = await ProjectCategory.create(clean({
      facultyId: req.body.facultyId,
      departmentId: req.body.departmentId,
      name: req.body.name,
      description: req.body.description,
      expectedOutputs: req.body.expectedOutputs || [],
      requiredProposalFields: req.body.requiredProposalFields || [],
      similarityWeights: req.body.similarityWeights,
      outputLabel: req.body.outputLabel,
      toolsLabel: req.body.toolsLabel,
      isActive: req.body.isActive
    }));
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/project-categories/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const category = await ProjectCategory.findByIdAndUpdate(req.params.id, { $set: clean(req.body) }, { new: true });
    if (!category) return res.status(404).json({ message: 'Project category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/academic-years', async (req, res) => {
  try {
    const academicYears = await AcademicYear.find().sort({ isActive: -1, startsAt: -1 });
    res.json(academicYears);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/academic-years', [protect, authorize('admin')], async (req, res) => {
  try {
    const academicYear = await AcademicYear.create(clean({
      label: req.body.label,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
      isActive: req.body.isActive
    }));
    res.status(201).json(academicYear);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
