import uWS from 'uWebSockets.js';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

const port = 3000;
const SECRET_KEY = 'your-secret-key'; // Replace with a secure secret key

// Create Redis clients for publishing and subscribing
const redisPublisher = createClient({ url: 'redis://redis:6379' });
const redisSubscriber = createClient({ url: 'redis://redis:6379' });
const redisClient = createClient({ url: 'redis://redis:6379' });

redisPublisher.on('error', (err) => console.error('Redis Publisher Error:', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
redisClient.on('error', (err) => console.error('Redis Client Error:', err));

(async () => {
    await redisPublisher.connect();
    await redisSubscriber.connect();
    await redisClient.connect();
    console.log('Connected to Redis');
})();

const generateToken = (username) => jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });

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
                { token, user: validationResult.user },
                req.getHeader('sec-websocket-key'),
                req.getHeader('sec-websocket-protocol'),
                req.getHeader('sec-websocket-extensions'),
                context
            );
        },

        open: (ws) => {
            ws.connectionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            console.log('New WebSocket connection established');
            console.log('Authenticated user:', ws.user);

            ws.send(JSON.stringify({
                type: 'connection_success',
                message: `Welcome ${ws.user.username}!`
            }));
        },

        message: async (ws, message, isBinary) => {
            const msg = Buffer.from(message).toString('utf-8');
            console.log(`Received message from ${ws.user.username}:`, msg);
            
            try {
                const parsedMessage = JSON.parse(msg);
                if (parsedMessage.action === 'listen' && parsedMessage.channel) {
                    const channelKey = `channel:${parsedMessage.channel}`;
                    const timestamp = Date.now();

                    console.log('....>>', ws.connectionId)
                    
                    await redisClient.hSet(channelKey, ws.connectionId, timestamp);
                    ws.channel = parsedMessage.channel;

                    console.log(`Subscribed ${ws.user.username} to ${parsedMessage.channel}`);
                    ws.send(JSON.stringify({ type: 'subscribed', channel: parsedMessage.channel }));
                    return;
                } else {
                    // Broadcast non-listen actions
                    redisPublisher.publish('broadcast', JSON.stringify({
                        type: 'message',
                        from: ws.user.username,
                        action: parsedMessage.action,
                        data: parsedMessage
                    }));
                }
            } catch (err) {
                console.error('Error processing message:', err);
            }
        },

        close: async (ws, code, message) => {
            console.log(`Client ${ws.user?.username || 'unknown'} disconnected`);
            if (ws.channel) {
                const channelKey = `channel:${ws.channel}`;
                await redisClient.hDel(channelKey, ws.connectionId);
            }
        },
    })
    .listen(port, (token) => {
        if (token) {
            console.log(`Server is listening on port ${port}`);
        } else {
            console.log(`Failed to listen on port ${port}`);
        }
    });
