const mongoose = require('mongoose');

const academicYearSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  startsAt: Date,
  endsAt: Date,
  isActive: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AcademicYear', academicYearSchema);
