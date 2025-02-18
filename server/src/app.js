// Updated WebSocket Server with Public Folder Rendering, CALBCOOK Cookie, UUID v4 Connection ID, EC2 Metadata IP, Ping-Pong Handling, and Port 3000
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// Constants
const PORT = 3000;
const CALB_COOKIE = 'CALBCOOK';
const EC2_METADATA_URL = 'http://169.254.169.254/latest/meta-data/local-ipv4';

// Function to get Machine IP from EC2 Metadata
async function getMachineIP() {
    try {
        const response = await axios.get(EC2_METADATA_URL);
        return response.data;
    } catch (error) {
        console.error('Failed to fetch EC2 Metadata:', error);
        return 'Unknown';
    }
}

// Load Machine IP on Startup
let machineIP;
getMachineIP().then(ip => {
    machineIP = ip;
    console.log(`Server running on IP: ${machineIP}`);
});

const app = express();
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Serve HTML from Public Folder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
let connections = {};

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Set Session Cookie from Path Variable
app.get('/socket/set-session/:value', (req, res) => {
    const sessionValue = req.params.value;
    res.cookie(CALB_COOKIE, sessionValue, { httpOnly: true, sameSite: 'None', secure: false });
    res.json({ message: 'Session cookie set', sessionValue });
});

// Handle WebSocket Upgrade
server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
        const connectionId = `conn_${uuidv4()}`;
        connections[connectionId] = ws;
        wss.emit('connection', ws, connectionId);
    });
});

// WebSocket Connection Handling with Ping-Pong
wss.on('connection', (ws, connectionId) => {
    console.log(`Client connected: ${connectionId}`);
    ws.send(JSON.stringify({ type: 'ack', connectionId, serverIP: machineIP }));

    ws.on('message', (message) => {
        console.log(`Received from ${connectionId}: ${message}`);
        if (message === 'ping') {
            ws.send('pong');
        } else {
            ws.send(`Echo: ${message}`);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${connectionId}`);
        delete connections[connectionId];
    });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
