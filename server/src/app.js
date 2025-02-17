// server.js
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const cookie = require('cookie');

const uuid = uuidv4();

const server = http.createServer((req, res) => {
    // Health check endpoint
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            connections: wss.clients.size
        }));
        return;
    }

    // Default response for other routes
    res.writeHead(200);
    res.end('WebSocket server is running');
});

const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info, cb) => {
        // Generate UUID for new connections
        
        info.req.uuid = uuid;

        // Set cookie in the upgrade response
        info.req.headers['set-cookie'] = cookie.serialize('CSOCKSID', uuid, {
            httpOnly: true,
            path: '/'
        });

        cb(true);
    }
});

wss.on('connection', (ws, req) => {
    const uuid = req.uuid;
    console.log(`New client connected with UUID: ${uuid}`);

    ws.on('message', (message) => {
        console.log(`Received message from ${uuid}: ${message}`);
        // Echo the message back
        ws.send(`Server received: ${message}`);
    });

    ws.on('close', () => {
        console.log(`Client ${uuid} disconnected`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`${uuid} || Server is running on port ${PORT}`);
});ƒ