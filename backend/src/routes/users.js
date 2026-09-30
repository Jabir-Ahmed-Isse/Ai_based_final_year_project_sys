const express = require('express');
const User = require('../models/User');
const Department = require('../models/Department');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private (Admin)
router.get('/', [protect, authorize('admin')], async (req, res) => {
  try {
    const { facultyId, departmentId, role } = req.query;
    const query = {};
    if (facultyId) query.facultyId = facultyId;
    if (departmentId) query.departmentId = departmentId;
    if (role) query.role = role;

    const users = await User.find(query)
      .select('-password')
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code facultyId')
      .populate('programId', 'name code level')
      .populate('expertiseDomainIds', 'name');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/users/supervisors
// @desc    Get all supervisors
// @access  Private
router.get('/supervisors', protect, async (req, res) => {
  try {
    const { facultyId, departmentId, domainId, availableOnly } = req.query;
    const query = { role: 'supervisor' };
    if (facultyId) {
      query.$or = [
        { facultyId },
        { crossFacultyEligible: true }
      ];
    }
    if (departmentId) query.departmentId = departmentId;
    if (domainId) query.expertiseDomainIds = domainId;
    if (availableOnly === 'true') query.availableForAssignment = true;

    const supervisors = await User.find(query)
      .select('-password')
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code facultyId')
      .populate('programId', 'name code level')
      .populate('expertiseDomainIds', 'name');
    res.json(supervisors);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code facultyId')
      .populate('programId', 'name code level')
      .populate('expertiseDomainIds', 'name');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    // Check if user is updating their own profile or is admin
    if (req.params.id !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const {
      name,
      facultyId,
      departmentId,
      programId,
      department,
      expertise,
      researchInterests,
      areasOfExpertise,
      academicSpecialization,
      skills,
      supervisorTechnologies,
      previousSupervisedProjectTopics,
      publicationKeywords,
      expertiseDomainIds,
      cvSummary,
      maxProjects,
      crossFacultyEligible,
      availableForAssignment
    } = req.body;
    const updateFields = {};
    
    if (name) updateFields.name = name;
    if (req.user.role === 'admin' && req.body.role) updateFields.role = req.body.role.toLowerCase();
    if (facultyId !== undefined) updateFields.facultyId = facultyId || undefined;
    if (departmentId !== undefined) {
      updateFields.departmentId = departmentId || undefined;
      if (!department && departmentId) {
        const departmentRecord = await Department.findById(departmentId);
        if (departmentRecord) updateFields.department = departmentRecord.name;
      }
    }
    if (programId !== undefined) updateFields.programId = programId || undefined;
    if (department) updateFields.department = department;
    if (expertise) updateFields.expertise = expertise;
    if (researchInterests !== undefined) updateFields.researchInterests = researchInterests;
    if (areasOfExpertise !== undefined) updateFields.areasOfExpertise = areasOfExpertise;
    if (academicSpecialization !== undefined) updateFields.academicSpecialization = academicSpecialization;
    if (skills !== undefined) updateFields.skills = skills;
    if (supervisorTechnologies !== undefined) updateFields.supervisorTechnologies = supervisorTechnologies;
    if (previousSupervisedProjectTopics !== undefined) updateFields.previousSupervisedProjectTopics = previousSupervisedProjectTopics;
    if (publicationKeywords !== undefined) updateFields.publicationKeywords = publicationKeywords;
    if (expertiseDomainIds) updateFields.expertiseDomainIds = expertiseDomainIds;
    if (cvSummary !== undefined) updateFields.cvSummary = cvSummary;
    if (maxProjects !== undefined) updateFields.maxProjects = maxProjects;
    if (crossFacultyEligible !== undefined) updateFields.crossFacultyEligible = crossFacultyEligible;
    if (availableForAssignment !== undefined) updateFields.availableForAssignment = availableForAssignment;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    )
      .select('-password')
      .populate('facultyId', 'name code')
      .populate('departmentId', 'name code facultyId')
      .populate('programId', 'name code level')
      .populate('expertiseDomainIds', 'name');

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin only)
// @access  Private (Admin)
router.delete('/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
