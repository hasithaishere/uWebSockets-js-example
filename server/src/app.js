// Updated WebSocket Server with Public Folder Rendering, CALBCOOK Cookie, UUID v4 Connection ID, EC2 Metadata IP, Ping-Pong Handling, and Port 3000
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cookie = require("cookie");

// Constants
const PORT = 3000;
const CALB_COOKIE = 'CALBCOOK';
const EC2_METADATA_URL = 'http://169.254.169.254/latest/meta-data/local-ipv4';

const instanceHash = uuidv4();

// Function to get Machine IP from EC2 Metadata
async function getMachineIP() {
    try {
        const tokenResponse = await axios.put('http://169.254.169.254/latest/api/token', null, {
            headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' }
        });
        const metadataResponse = await axios.get(EC2_METADATA_URL, {
            headers: { 'X-aws-ec2-metadata-token': tokenResponse.data }
        });
        return metadataResponse.data;
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

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());
app.use(express.static('public'))

// Serve HTML from Public Folder
app.get('/', (req, res) => {
    res.sendFile('index.html')
})

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
let connections = {};

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', machineIP });
});

// API to Send Message to Specific WebSocket Client
app.post('/socket/send-message', (req, res) => {
    const { connectionId, payload } = req.body;
    if (connections[connectionId]) {
        connections[connectionId].send(JSON.stringify({ type: 'message', payload }));
        res.status(200).json({ status: 'sent', connectionId });
    } else {
        res.status(404).json({ error: 'Connection not found' });
    }
});

// Set Session Cookie from Path Variable
app.get('/set-cookie', (req, res) => {
    const sessionValue = req.query.value
    // res.cookie(CALB_COOKIE, sessionValue);
    // res.json({ message: 'Session cookie set', sessionValue });

    // res.cookie(CALB_COOKIE, sessionValue);
    // res.send({
    //     "command": "set-cookie",
    //     "cookies": {
    //         [CALB_COOKIE]: sessionValue
    //     }
    // })
    
    res.cookie(CALB_COOKIE, instanceHash);
    res.send({
        "command": "set-cookie",
        "cookies": {
            [CALB_COOKIE]: instanceHash
        }
    })
});

// Handle WebSocket Upgrade
server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
        console.log('--------------------------');
        console.log('Req Headers ...', cookie.parse(req.headers.cookie));
        console.log('--------------------------');
        //req.headers['set-cookie'] = cookie.serialize(CALB_COOKIE, instanceHash);
        const connectionId = `conn_${uuidv4()}`;
        connections[connectionId] = ws;
        wss.emit('connection', ws, connectionId);
    });
});

wss.on("headers", function(headers) {
    //headers["set-cookie"] = CALB_COOKIE + "=" + instanceHash;
   // headers.push('Set-Cookie: ' + cookie.serialize(CALB_COOKIE, instanceHash));
    console.log("handshake response cookie", headers);
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
