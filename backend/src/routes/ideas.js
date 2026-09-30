const express = require('express');
const CuratedIdea = require('../models/CuratedIdea');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/ideas
// @desc    Get all curated ideas
// @access  Public (for students to see)
router.get('/', async (req, res) => {
  try {
    const { search, category, facultyId, departmentId, programId, categoryId, domainId } = req.query;
    let query = { isActive: true };
    
    if (category) {
      query.category = category;
    }
    if (facultyId) query.facultyId = facultyId;
    if (departmentId) query.departmentId = departmentId;
    if (programId) query.programId = programId;
    if (categoryId) query.categoryId = categoryId;
    if (domainId) query.researchDomainIds = domainId;
    
    let ideas;
    if (search) {
      ideas = await CuratedIdea.find({
        ...query,
        $text: { $search: search }
      }).sort({ createdAt: -1 });
    } else {
      ideas = await CuratedIdea.find(query).sort({ createdAt: -1 });
    }
    
    res.json(ideas);
  } catch (err) {
    console.error('Error fetching ideas:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   POST /api/ideas
// @desc    Create a new curated idea
// @access  Private (Admin only)
router.post('/', [protect, authorize('admin')], async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      technologies,
      toolsOrMethods,
      facultyId,
      departmentId,
      programId,
      categoryId,
      researchDomainIds,
      category
    } = req.body;
    
    const idea = new CuratedIdea({
      title,
      description,
      difficulty: difficulty || 'Medium',
      technologies: technologies || [],
      toolsOrMethods: toolsOrMethods || technologies || [],
      facultyId,
      departmentId,
      programId,
      categoryId,
      researchDomainIds: researchDomainIds || [],
      category,
      createdBy: req.user.id
    });
    
    await idea.save();
    res.status(201).json(idea);
  } catch (err) {
    console.error('Error creating idea:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   POST /api/ideas/bulk
// @desc    Create multiple curated ideas at once
// @access  Private (Admin only)
router.post('/bulk', [protect, authorize('admin')], async (req, res) => {
  try {
    const { ideas } = req.body;
    
    if (!Array.isArray(ideas) || ideas.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of ideas' });
    }
    
    const ideasWithCreator = ideas.map(idea => ({
      ...idea,
      toolsOrMethods: idea.toolsOrMethods || idea.technologies || [],
      createdBy: req.user.id
    }));
    
    const createdIdeas = await CuratedIdea.insertMany(ideasWithCreator);
    res.status(201).json(createdIdeas);
  } catch (err) {
    console.error('Error bulk creating ideas:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   PUT /api/ideas/:id
// @desc    Update a curated idea
// @access  Private (Admin only)
router.put('/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      technologies,
      toolsOrMethods,
      facultyId,
      departmentId,
      programId,
      categoryId,
      researchDomainIds,
      category,
      isActive
    } = req.body;
    
    const idea = await CuratedIdea.findById(req.params.id);
    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }
    
    if (title) idea.title = title;
    if (description) idea.description = description;
    if (difficulty) idea.difficulty = difficulty;
    if (technologies) idea.technologies = technologies;
    if (toolsOrMethods) idea.toolsOrMethods = toolsOrMethods;
    if (facultyId !== undefined) idea.facultyId = facultyId || undefined;
    if (departmentId !== undefined) idea.departmentId = departmentId || undefined;
    if (programId !== undefined) idea.programId = programId || undefined;
    if (categoryId !== undefined) idea.categoryId = categoryId || undefined;
    if (researchDomainIds) idea.researchDomainIds = researchDomainIds;
    if (category !== undefined) idea.category = category;
    if (isActive !== undefined) idea.isActive = isActive;
    
    await idea.save();
    res.json(idea);
  } catch (err) {
    console.error('Error updating idea:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   DELETE /api/ideas/:id
// @desc    Delete a curated idea
// @access  Private (Admin only)
router.delete('/:id', [protect, authorize('admin')], async (req, res) => {
  try {
    const idea = await CuratedIdea.findById(req.params.id);
    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }
    
    await CuratedIdea.findByIdAndDelete(req.params.id);
    res.json({ message: 'Idea deleted successfully' });
  } catch (err) {
    console.error('Error deleting idea:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   GET /api/ideas/search/:query
// @desc    Search ideas by keyword for AI integration
// @access  Public
router.get('/search/:query', async (req, res) => {
  try {
    const searchQuery = req.params.query;
    
    // Search in title, description, technologies, and category
    const ideas = await CuratedIdea.find({
      isActive: true,
      $or: [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } },
        { technologies: { $in: [new RegExp(searchQuery, 'i')] } },
        { category: { $regex: searchQuery, $options: 'i' } }
      ]
    }).limit(10);
    
    res.json(ideas);
  } catch (err) {
    console.error('Error searching ideas:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
