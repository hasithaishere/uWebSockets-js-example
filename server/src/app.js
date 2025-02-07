import uWS from 'uWebSockets.js';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

const port = 3000;
const SECRET_KEY = 'your-secret-key';

const redisClient = createClient({ url: 'redis://redis:6379' });

redisClient.on('error', (err) => console.error('Redis Error:', err));

(async () => {
    await redisClient.connect();
    console.log('Connected to Redis');
})();

const generateToken = (username) => {
    return jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
};

function validateToken(token) {
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        return { valid: true, user: decoded };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

const app = uWS.App()
    .options('/token', (res, req) => {
        res.writeHeader('Access-Control-Allow-Origin', '*');
        res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.end();
    })
    .get('/token', (res, req) => {
        res.writeHeader('Access-Control-Allow-Origin', '*');
        res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        const username = 'john_doe';
        const token = generateToken(username);
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

            if (!token) {
                res.writeStatus('401').end('Unauthorized: No token provided');
                return;
            }

            const validationResult = validateToken(token);

            if (!validationResult.valid) {
                res.writeStatus('401').end('Unauthorized: Invalid token');
                return;
            }

            const connectionId = uuidv4();

            res.upgrade(
                {
                    connectionId,
                    token,
                    user: validationResult.user,
                    currentChannels: new Set() // Track all channels this connection is subscribed to
                },
                req.getHeader('sec-websocket-key'),
                req.getHeader('sec-websocket-protocol'),
                req.getHeader('sec-websocket-extensions'),
                context
            );
        },

        open: (ws) => {
            console.log(`New connection (${ws.connectionId}) established for user: ${ws.user.username}`);

            ws.send(JSON.stringify({
                type: 'connection_success',
                message: `Welcome ${ws.user.username}!`,
                connectionId: ws.connectionId
            }));
        },

        message: async (ws, message, isBinary) => {
            const msg = Buffer.from(message).toString('utf-8');
            console.log(`Received message from connection ${ws.connectionId}:`, msg);

            try {
                const { action, channel } = JSON.parse(msg);

                if (action === 'listen' && channel) {
                    const timestamp = Date.now();

                    // Primary: Add to channel HSET with timestamp
                    await redisClient.hSet(`channel:${channel}`, ws.connectionId, timestamp.toString());

                    // Secondary: Add channel to connection's SET
                    await redisClient.sAdd(`conn:${ws.connectionId}`, channel);

                    // Update connection's local channel tracking
                    ws.currentChannels.add(channel);

                    console.log(`Connection ${ws.connectionId} subscribed to channel ${channel}`);

                    ws.send(JSON.stringify({
                        type: 'subscription_success',
                        channel,
                        connectionId: ws.connectionId,
                        timestamp
                    }));

                } else if (action === 'unsubscribe' && channel) {
                    // Primary: Remove from channel HSET
                    await redisClient.hDel(`channel:${channel}`, ws.connectionId);

                    // Secondary: Remove channel from connection's SET
                    await redisClient.sRem(`conn:${ws.connectionId}`, channel);

                    // Update connection's local channel tracking
                    ws.currentChannels.delete(channel);

                    console.log(`Connection ${ws.connectionId} unsubscribed from channel ${channel}`);

                    ws.send(JSON.stringify({
                        type: 'unsubscribe_success',
                        channel,
                        connectionId: ws.connectionId
                    }));

                } else {
                    console.log('Invalid action or channel');
                }
            } catch (err) {
                console.error('Error processing message:', err);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Failed to process message',
                    connectionId: ws.connectionId
                }));
            }
        },

        close: async (ws, code, message) => {
            console.log(`Connection ${ws.connectionId} closed`);

            try {
                // Get all channels this connection was subscribed to
                const channels = await redisClient.sMembers(`conn:${ws.connectionId}`);

                // Clean up primary storage (HSET) for each channel
                for (const channel of channels) {
                    await redisClient.hDel(`channel:${channel}`, ws.connectionId);
                    console.log(`Removed connection ${ws.connectionId} from channel:${channel} HSET`);
                }

                // Clean up secondary storage (SET)
                await redisClient.del(`conn:${ws.connectionId}`);
                console.log(`Removed connection SET conn:${ws.connectionId}`);

            } catch (err) {
                console.error('Error cleaning up Redis mappings:', err);
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