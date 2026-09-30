const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  sourceFile: { type: String, required: true },
  sourceWorksheet: { type: String, required: true },
  sourceChecksum: { type: String, required: true },
  backupReference: String,
  dryRun: { type: Boolean, default: true },
  replaceTaggedTestData: { type: Boolean, default: true },
  status: { type: String, enum: ['planned', 'running', 'completed', 'failed'], default: 'planned' },
  counts: {
    rowsRead: Number,
    validProjects: Number,
    duplicatesRemoved: Number,
    invalidRows: Number,
    skippedRows: Number,
    updatedRecords: Number,
    newlyCreatedRecords: Number,
    deletedProjects: Number,
    preservedProjects: Number,
    usersCreated: Number,
    supervisorsCreated: Number
  },
  deletedRecordIds: [mongoose.Schema.Types.ObjectId],
  preservedRecordIds: [mongoose.Schema.Types.ObjectId],
  importedProjectIds: [mongoose.Schema.Types.ObjectId],
  warnings: [String],
  errorMessages: [String],
  startedAt: Date,
  completedAt: Date,
  durationMs: Number
}, { timestamps: true });

module.exports = mongoose.model('ResearchImportRun', schema);
