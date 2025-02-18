const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cookie = require('cookie');
const crypto = require('crypto');
const cors = require('cors');

// Create Express app
const app = express();

// Enable CORS
app.use(cors({
  origin: '*',
  credentials: true
}));

// Add body parser middleware for JSON
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    connections: wss.clients.size,
    uptime: process.uptime()
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json(healthStatus);
});

// New endpoint to send message to specific client
app.post('/send-message', (req, res) => {
  try {
    const { sessionId, message, type = 'message' } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'sessionId and message are required'
      });
    }

    // Find the connection for the given session ID
    const ws = connections.get(sessionId);
    
    if (!ws) {
      return res.status(404).json({
        status: 'error',
        message: 'No active connection found for the given session ID'
      });
    }

    // Send the message to the specific client
    ws.send(JSON.stringify({
      type,
      message,
      timestamp: new Date().toISOString()
    }));

    return res.status(200).json({
      status: 'success',
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  // Handle the upgrade request to validate/set cookies
  verifyClient: (info, callback) => {
    try {
      const cookies = cookie.parse(info.req.headers.cookie || '');
      let stickySession = cookies.AWSAPP;

      if (!stickySession) {
        // Generate new session ID if none exists
        stickySession = crypto.randomBytes(16).toString('hex');
        
        // Set cookie in response headers
        info.req.stickySession = stickySession;
        const cookieHeader = cookie.serialize('AWSAPP', stickySession, {
          httpOnly: true,
          secure: true,
          maxAge: 86400, // 24 hours
          sameSite: 'strict'
        });

        console.log(`Generated new session ID: ${stickySession}`, cookie.parse(cookieHeader), cookieHeader);
        
        info.req.headers.cookie = cookieHeader;
      }

      // Store session info for use after connection
      info.req.stickySession = stickySession;
      callback(true);
    } catch (error) {
      console.error('Error in verifyClient:', error);
      callback(false, 500, 'Internal Server Error');
    }
  }
});

// Connection tracking
const connections = new Map();

// WebSocket server event handlers
wss.on('connection', (ws, req) => {
  try {
    // Associate WebSocket connection with sticky session
    ws.stickySession = req.stickySession;
    
    // Store connection
    connections.set(ws.stickySession, ws);

    console.log(`Client connected with sticky session: ${ws.stickySession}`);
    console.log(`Total connections: ${connections.size}`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      message: `Connected with session: ${ws.stickySession}`,
      timestamp: new Date().toISOString()
    }));

    // Message handler
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`Received message from session ${ws.stickySession}:`, data);
        
        // Handle cookie message
        if (data.type === 'cookie') {
          console.log(`Received cookie value from client: ${data.value}`);
          // Verify it matches the sticky session
          if (data.value === ws.stickySession) {
            ws.send(JSON.stringify({
              type: 'cookieVerification',
              status: 'success',
              message: 'Cookie value matches sticky session',
              timestamp: new Date().toISOString()
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'cookieVerification',
              status: 'error',
              message: 'Cookie value does not match sticky session',
              timestamp: new Date().toISOString()
            }));
          }
        }

        // Handle disconnect request
        if (data.type === 'disconnect') {
          console.log(`Client requested disconnect: ${ws.stickySession}`);
          ws.close();
        }

      } catch (error) {
        console.error('Error processing message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          timestamp: new Date().toISOString()
        }));
      }
    });

    // Error handler
    ws.on('error', (error) => {
      console.error(`WebSocket error for session ${ws.stickySession}:`, error);
    });

    // Close handler
    ws.on('close', () => {
      console.log(`Client disconnected: ${ws.stickySession}`);
      connections.delete(ws.stickySession);
      console.log(`Total connections: ${connections.size}`);
    });

  } catch (error) {
    console.error('Error in connection handler:', error);
    ws.close();
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});