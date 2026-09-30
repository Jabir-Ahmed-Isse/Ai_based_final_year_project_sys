const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');

// Get all announcements (with optional filter for active only)
router.get('/', async (req, res) => {
  try {
    const { activeOnly } = req.query;
    const filter = activeOnly === 'true' ? { isActive: true } : {};
    
    // Also filter out expired announcements if activeOnly
    if (activeOnly === 'true') {
      filter.$or = [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ];
    }
    
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ message: 'Error fetching announcements', error: error.message });
  }
});

// Get single announcement
router.get('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }
    res.json(announcement);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching announcement', error: error.message });
  }
});

// Create announcement
router.post('/', async (req, res) => {
  try {
    const { title, content, type, expiresAt, createdBy } = req.body;
    
    const announcement = new Announcement({
      title,
      content,
      type: type || 'info',
      expiresAt: expiresAt || null,
      createdBy: createdBy || 'Admin',
      isActive: true
    });
    
    await announcement.save();
    res.status(201).json(announcement);
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ message: 'Error creating announcement', error: error.message });
  }
});

// Update announcement
router.put('/:id', async (req, res) => {
  try {
    const { title, content, type, expiresAt, isActive } = req.body;
    
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { title, content, type, expiresAt, isActive },
      { new: true }
    );
    
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }
    
    res.json(announcement);
  } catch (error) {
    res.status(500).json({ message: 'Error updating announcement', error: error.message });
  }
});

// Toggle announcement active status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }
    
    announcement.isActive = !announcement.isActive;
    await announcement.save();
    
    res.json(announcement);
  } catch (error) {
    res.status(500).json({ message: 'Error toggling announcement', error: error.message });
  }
});

// Delete announcement
router.delete('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }
    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting announcement', error: error.message });
  }
});

module.exports = router;
