const mongoose = require('mongoose');

const guidelineSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['research', 'proposal', 'submission', 'defense', 'general'],
    default: 'general'
  },
  pdfUrl: {
    type: String,
    default: null
  },
  pdfFileName: {
    type: String,
    default: null
  },
  createdBy: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for ordering guidelines
guidelineSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('Guideline', guidelineSchema);
