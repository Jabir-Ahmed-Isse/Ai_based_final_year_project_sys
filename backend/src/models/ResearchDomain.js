const mongoose = require('mongoose');

const researchDomainSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  code: {
    type: String,
    trim: true,
    uppercase: true,
    unique: true,
    sparse: true
  },
  aliases: [String],
  keywords: [String],
  relatedDomainIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ResearchDomain'
  }],
  facultyIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    index: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

researchDomainSchema.index({ name: 'text', aliases: 'text', keywords: 'text' });

module.exports = mongoose.model('ResearchDomain', researchDomainSchema);
