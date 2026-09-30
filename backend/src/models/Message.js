const mongoose = require('mongoose');

const fileAttachmentSchema = new mongoose.Schema({
  name: String,
  url: String,
  type: String,
  size: Number
}, { _id: false });

const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  receiverId: {
    type: String,
    required: true
  },
  receiverName: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  fileAttachment: {
    type: fileAttachmentSchema,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient querying of conversations
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ receiverId: 1, senderId: 1 });
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
