import uWS from 'uWebSockets.js';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

const port = 3000;
const SECRET_KEY = 'your-secret-key'; // Replace with a secure secret key

// Create Redis clients for publishing and subscribing
const redisPublisher = createClient({ url: 'redis://redis:6379' });
const redisSubscriber = createClient({ url: 'redis://redis:6379' });

redisPublisher.on('error', (err) => console.error('Redis Publisher Error:', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));

// Connect to Redis
(async () => {
    await redisPublisher.connect();
    await redisSubscriber.connect();
    console.log('Connected to Redis');
})();

// Generate a JWT token
const generateToken = (username) => {
    return jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
};

// Helper function to validate JWT token
function validateToken(token) {
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        return { valid: true, user: decoded };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

// Helper function to parse query parameters from URL
function parseQueryParams(url) {
    const params = {};
    const queryString = url.split('?')[1];
    if (queryString) {
        queryString.split('&').forEach(param => {
            const [key, value] = param.split('=');
            params[key] = decodeURIComponent(value);
        });
    }
    return params;
}

const app = uWS.App()
    .options('/token', (res, req) => {
        // Handle preflight requests
        res.writeHeader('Access-Control-Allow-Origin', '*');
        res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.end();
    })
    .get('/token', (res, req) => {
        // Set CORS headers
        res.writeHeader('Access-Control-Allow-Origin', '*');
        res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        const username = 'john_doe'; // Replace with dynamic username in a real app
        const token = generateToken(username);

        // Send the token as a JSON response
        res.writeHeader('Content-Type', 'application/json').end(JSON.stringify({ token }));
    })
    .ws('/*', {
        compression: uWS.SHARED_COMPRESSOR,
        maxPayloadLength: 16 * 1024 * 1024,
        idleTimeout: 10,

        upgrade: (res, req, context) => {
            const queryString = `?${req.getQuery()}`;
            const searchParams = new URLSearchParams(queryString);
            const token = searchParams.get('token');

            console.log('WebSocket upgrade request received', token);

            if (!token) {
                res.writeStatus('401').end('Unauthorized: No token provided');
                return;
            }

            // Store token validation result in userData for use in open handler
            const validationResult = validateToken(token);

            if (!validationResult.valid) {
                res.writeStatus('401').end('Unauthorized: Invalid token');
                return;
            }

            res.upgrade(
                { token, user: validationResult.user }, // Data to pass to websocket
                req.getHeader('sec-websocket-key'),
                req.getHeader('sec-websocket-protocol'),
                req.getHeader('sec-websocket-extensions'),
                context
            );
        },

        open: (ws) => {
            console.log('A client connected');

            console.log('New WebSocket connection established');
            console.log('Authenticated user:', ws.user);

            // Subscribe to Redis channel for broadcasting messages
            redisSubscriber.subscribe('broadcast', (message) => {
                ws.send(message);
            });

            // Send welcome message to client
            ws.send(JSON.stringify({
                type: 'connection_success',
                message: `Welcome ${ws.user.username}!`
            }));
        },

        message: (ws, message, isBinary) => {
            const msg = Buffer.from(message).toString('utf-8');
            console.log(`Received message from ${ws.user.username}:`, msg);

            // Broadcast the message to all clients via Redis
            redisPublisher.publish('broadcast', JSON.stringify({
                type: 'message',
                from: ws.user.username,
                message: msg
            }));
        },

        close: (ws, code, message) => {
            console.log(`Client ${ws.user?.username || 'unknown'} disconnected`);

            // Unsubscribe from Redis channel when client disconnects
            redisSubscriber.unsubscribe('broadcast');
        },
    })
    .listen(port, (token) => {
        if (token) {
            console.log(`Server is listening on port ${port}`);
        } else {
            console.log(`Failed to listen on port ${port}`);
        }
    });