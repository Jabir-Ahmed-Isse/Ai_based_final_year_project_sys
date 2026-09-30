const mongoose = require('mongoose');

const programSchema = new mongoose.Schema({
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true,
    index: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  level: {
    type: String,
    default: 'Undergraduate'
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

programSchema.index({ departmentId: 1, name: 1 }, { unique: true });
programSchema.index({ departmentId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Program', programSchema);
