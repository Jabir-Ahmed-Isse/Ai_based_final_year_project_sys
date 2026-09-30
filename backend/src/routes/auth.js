const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Department = require('../models/Department');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    facultyId,
    departmentId,
    programId,
    department,
    studentId,
    expertise,
    expertiseDomainIds,
    cvSummary,
    crossFacultyEligible
  } = req.body;

  try {
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let departmentName = department;
    if (!departmentName && departmentId) {
      const departmentRecord = await Department.findById(departmentId);
      departmentName = departmentRecord?.name;
    }

    // Create user
    user = new User({
      name,
      email,
      password,
      role,
      facultyId,
      departmentId,
      programId,
      department: departmentName,
      ...(role === 'student' && { studentId }),
      ...(role === 'supervisor' && {
        expertise,
        expertiseDomainIds,
        cvSummary,
        crossFacultyEligible: !!crossFacultyEligible
      })
    });

    await user.save();

    // Generate JWT
    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT
    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ 
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            facultyId: user.facultyId,
            departmentId: user.departmentId,
            programId: user.programId,
            department: user.department,
            studentId: user.studentId,
            expertise: user.expertise,
            researchInterests: user.researchInterests,
            areasOfExpertise: user.areasOfExpertise,
            academicSpecialization: user.academicSpecialization,
            skills: user.skills,
            supervisorTechnologies: user.supervisorTechnologies,
            previousSupervisedProjectTopics: user.previousSupervisedProjectTopics,
            publicationKeywords: user.publicationKeywords,
            expertiseDomainIds: user.expertiseDomainIds,
            cvSummary: user.cvSummary,
            maxProjects: user.maxProjects,
            currentProjects: user.currentProjects,
            crossFacultyEligible: user.crossFacultyEligible,
            availableForAssignment: user.availableForAssignment
          }
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
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

module.exports = router;
