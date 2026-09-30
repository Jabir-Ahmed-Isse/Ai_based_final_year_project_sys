const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Get ALL messages (for fetching complete message history)
router.get('/all', async (req, res) => {
  try {
    const messages = await Message.find({}).sort({ createdAt: 1 });
    
    const formattedMessages = messages.map(m => ({
      id: m._id.toString(),
      senderId: m.senderId,
      senderName: m.senderName,
      receiverId: m.receiverId,
      receiverName: m.receiverName,
      content: m.content,
      timestamp: m.createdAt,
      read: m.read,
      fileAttachment: m.fileAttachment
    }));
    
    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching all messages:', error);
    res.status(500).json({ message: 'Error fetching messages', error: error.message });
  }
});

// Get all messages for a user (sent or received)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const messages = await Message.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    }).sort({ createdAt: 1 });
    
    // Transform to match frontend format
    const formattedMessages = messages.map(m => ({
      id: m._id.toString(),
      senderId: m.senderId,
      senderName: m.senderName,
      receiverId: m.receiverId,
      receiverName: m.receiverName,
      content: m.content,
      timestamp: m.createdAt,
      read: m.read,
      fileAttachment: m.fileAttachment
    }));
    
    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages', error: error.message });
  }
});

// Get conversation between two users
router.get('/conversation/:userId1/:userId2', async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    
    const messages = await Message.find({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 }
      ]
    }).sort({ createdAt: 1 });
    
    const formattedMessages = messages.map(m => ({
      id: m._id.toString(),
      senderId: m.senderId,
      senderName: m.senderName,
      receiverId: m.receiverId,
      receiverName: m.receiverName,
      content: m.content,
      timestamp: m.createdAt,
      read: m.read,
      fileAttachment: m.fileAttachment
    }));
    
    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ message: 'Error fetching conversation', error: error.message });
  }
});

// Send a new message
router.post('/', async (req, res) => {
  try {
    const { senderId, senderName, receiverId, receiverName, content, fileAttachment } = req.body;
    
    if (!senderId || !receiverId || !content) {
      return res.status(400).json({ message: 'senderId, receiverId, and content are required' });
    }
    
    const message = new Message({
      senderId,
      senderName: senderName || 'Unknown',
      receiverId,
      receiverName: receiverName || '',
      content,
      read: false,
      fileAttachment: fileAttachment || null
    });
    
    await message.save();
    
    res.status(201).json({
      id: message._id.toString(),
      senderId: message.senderId,
      senderName: message.senderName,
      receiverId: message.receiverId,
      receiverName: message.receiverName,
      content: message.content,
      timestamp: message.createdAt,
      read: message.read,
      fileAttachment: message.fileAttachment
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message', error: error.message });
  }
});

// Mark messages as read
router.patch('/read', async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    
    if (!senderId || !receiverId) {
      return res.status(400).json({ message: 'senderId and receiverId are required' });
    }
    
    const result = await Message.updateMany(
      { senderId, receiverId, read: false },
      { $set: { read: true } }
    );
    
    res.json({ 
      message: 'Messages marked as read', 
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Error marking messages as read', error: error.message });
  }
});

// Get unread message count for a user
router.get('/unread/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const count = await Message.countDocuments({
      receiverId: userId,
      read: false
    });
    
    res.json({ unreadCount: count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Error getting unread count', error: error.message });
  }
});

// Delete a message
router.delete('/:id', async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Error deleting message', error: error.message });
  }
});

module.exports = router;
