const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
app.use(express.json()); // Enable JSON parsing for POST requests
app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:8080', credentials: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// API to send message to a specific WebSocket client
app.post('/send-message', (req, res) => {
    const { connectionId, payload } = req.body;
    if (clients[connectionId]) {
        clients[connectionId].send(payload);
        res.status(200).json({ message: 'Message sent successfully' });
    } else {
        res.status(404).json({ error: 'Client not found' });
    }
});

// Route to set session cookie
app.get('/set-cookie', (req, res) => {
    let sessionId = req.cookies.session_id || `session_${Math.random().toString(36).substring(2, 15)}`;
    res.cookie('session_id', sessionId, { httpOnly: true, secure: false, sameSite: 'None' });
    res.json({ sessionId });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
let clients = {}; // Store clients based on session ID

// WebSocket upgrade handler
server.on('upgrade', (req, socket, head) => {
    const cookies = req.headers.cookie;
    const sessionId = cookies ? cookies.split('session_id=')[1]?.split(';')[0] : `session_${Math.random().toString(36).substring(2, 15)}`;
    console.log(`Session ID: ${sessionId}`);
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, sessionId);
    });
});

// WebSocket connection handling with pong response
wss.on('connection', (ws, sessionId) => {
    console.log(`Client connected with session: ${sessionId}`);
    clients[sessionId] = ws;

    ws.on('message', (message) => {
        if (message === 'ping') {
            console.log(`Received ping from ${sessionId}`);
            ws.send('pong');
        } else {
            console.log(`Received from ${sessionId}: ${message}`);
            ws.send(`Echo: ${message}`);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${sessionId}`);
        delete clients[sessionId];
    });
});

// Server listens on port 3000
server.listen(3000, () => console.log('WebSocket server running on http://localhost:3000'));