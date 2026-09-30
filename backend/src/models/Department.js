const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
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

departmentSchema.index({ facultyId: 1, name: 1 }, { unique: true });
departmentSchema.index({ facultyId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
