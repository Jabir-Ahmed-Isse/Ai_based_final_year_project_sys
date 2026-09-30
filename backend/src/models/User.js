const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['student', 'supervisor', 'coordinator', 'admin'],
    required: true
  },
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty'
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program'
  },
  department: {
    type: String,
    required: function() {
      return this.role === 'student' || this.role === 'supervisor';
    }
  },
  // For students
  studentId: {
    type: String,
    sparse: true,
    unique: true
  },
  studentProfile: {
    cohortYear: Number,
    specialization: String
  },
  assignedProjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  // For supervisors
  expertise: [{
    type: String
  }],
  researchInterests: [{ type: String, trim: true }],
  areasOfExpertise: [{ type: String, trim: true }],
  academicSpecialization: { type: String, default: '', trim: true },
  skills: [{ type: String, trim: true }],
  supervisorTechnologies: [{ type: String, trim: true }],
  previousSupervisedProjectTopics: [{ type: String, trim: true }],
  publicationKeywords: [{ type: String, trim: true }],
  expertiseDomainIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ResearchDomain'
  }],
  cvSummary: {
    type: String,
    default: ''
  },
  crossFacultyEligible: {
    type: Boolean,
    default: false
  },
  availableForAssignment: {
    type: Boolean,
    default: true
  },
  maxProjects: {
    type: Number,
    default: 5
  },
  currentProjects: {
    type: Number,
    default: 0
  },
  researchSupervisorId: { type: String, trim: true },
  yearsOfExperience: { type: Number, min: 0, default: 0 },
  accountStatus: {
    type: String,
    enum: ['active', 'inactive', 'disabled'],
    default: 'active'
  },
  isTestAccount: { type: Boolean, default: false, index: true },
  testDataTag: { type: String, default: '', index: true },
  // For both students and supervisors
  avatar: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.index({ role: 1, facultyId: 1, departmentId: 1 });
userSchema.index({ expertiseDomainIds: 1 });
userSchema.index({ testDataTag: 1, role: 1 });

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
