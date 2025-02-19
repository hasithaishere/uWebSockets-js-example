
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const validateMessage = (req, res, next) => {
  const { channel, name, data } = req.body;

  if (!channel) {
    return res.status(400).json({ error: 'Channel is required' });
  }

  if (!name) {
    return res.status(400).json({ error: 'Event name is required' });
  }

  if (!data) {
    return res.status(400).json({ error: 'Message data is required' });
  }

  next();
};

module.exports = function (socketServer) {
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.post('/send-message', authenticateToken, validateMessage, async (req, res) => {
    try {
      const { channel, name, data } = req.body;

      socketServer.broadcastToChannel(channel, name, {
        sender: req.user.id,
        timestamp: new Date(),
        ...data
      });

      res.status(200).json({
        success: true,
        message: 'Message sent successfully'
      });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({
        error: 'Failed to send message',
        details: error.message
      });
    }
  });

  return router;
};
