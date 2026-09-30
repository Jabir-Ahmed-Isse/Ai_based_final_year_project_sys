const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Guideline = require('../models/Guideline');

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/guidelines');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'guideline-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Get all guidelines
router.get('/', async (req, res) => {
  try {
    const { activeOnly } = req.query;
    const filter = activeOnly === 'true' ? { isActive: true } : {};
    
    const guidelines = await Guideline.find(filter).sort({ order: 1, createdAt: -1 });
    res.json(guidelines);
  } catch (error) {
    console.error('Error fetching guidelines:', error);
    res.status(500).json({ message: 'Error fetching guidelines', error: error.message });
  }
});

// Get single guideline
router.get('/:id', async (req, res) => {
  try {
    const guideline = await Guideline.findById(req.params.id);
    if (!guideline) {
      return res.status(404).json({ message: 'Guideline not found' });
    }
    res.json(guideline);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching guideline', error: error.message });
  }
});

// Serve PDF file
router.get('/pdf/:filename', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../uploads/guidelines', req.params.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'PDF file not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ message: 'Error serving PDF', error: error.message });
  }
});

// Create guideline with optional PDF upload
router.post('/', upload.single('pdf'), async (req, res) => {
  try {
    const { title, description, category, createdBy, order } = req.body;
    
    const guideline = new Guideline({
      title,
      description,
      category: category || 'general',
      createdBy: createdBy || 'Admin',
      order: order || 0,
      isActive: true,
      pdfUrl: req.file ? `/api/guidelines/pdf/${req.file.filename}` : null,
      pdfFileName: req.file ? req.file.originalname : null
    });
    
    await guideline.save();
    res.status(201).json(guideline);
  } catch (error) {
    console.error('Error creating guideline:', error);
    res.status(500).json({ message: 'Error creating guideline', error: error.message });
  }
});

// Update guideline with optional PDF upload
router.put('/:id', upload.single('pdf'), async (req, res) => {
  try {
    const { title, description, category, isActive, order } = req.body;
    
    const guideline = await Guideline.findById(req.params.id);
    if (!guideline) {
      return res.status(404).json({ message: 'Guideline not found' });
    }
    
    // Update fields
    if (title) guideline.title = title;
    if (description) guideline.description = description;
    if (category) guideline.category = category;
    if (isActive !== undefined) guideline.isActive = isActive === 'true' || isActive === true;
    if (order !== undefined) guideline.order = parseInt(order);
    
    // Handle PDF upload
    if (req.file) {
      // Delete old PDF if exists
      if (guideline.pdfUrl) {
        const oldFilename = guideline.pdfUrl.split('/').pop();
        const oldPath = path.join(__dirname, '../../uploads/guidelines', oldFilename);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      guideline.pdfUrl = `/api/guidelines/pdf/${req.file.filename}`;
      guideline.pdfFileName = req.file.originalname;
    }
    
    await guideline.save();
    res.json(guideline);
  } catch (error) {
    res.status(500).json({ message: 'Error updating guideline', error: error.message });
  }
});

// Toggle guideline active status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const guideline = await Guideline.findById(req.params.id);
    if (!guideline) {
      return res.status(404).json({ message: 'Guideline not found' });
    }
    
    guideline.isActive = !guideline.isActive;
    await guideline.save();
    
    res.json(guideline);
  } catch (error) {
    res.status(500).json({ message: 'Error toggling guideline', error: error.message });
  }
});

// Delete guideline
router.delete('/:id', async (req, res) => {
  try {
    const guideline = await Guideline.findById(req.params.id);
    if (!guideline) {
      return res.status(404).json({ message: 'Guideline not found' });
    }
    
    // Delete PDF file if exists
    if (guideline.pdfUrl) {
      const filename = guideline.pdfUrl.split('/').pop();
      const filePath = path.join(__dirname, '../../uploads/guidelines', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await Guideline.findByIdAndDelete(req.params.id);
    res.json({ message: 'Guideline deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting guideline', error: error.message });
  }
});

module.exports = router;
