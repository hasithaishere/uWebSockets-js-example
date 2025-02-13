import uWS from 'uWebSockets.js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const port = parseInt(process.env.PORT) || 3000; // Parse port as integer
const SECRET_KEY = 'your-secret-key';

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

const connections = new Map();
const channelConnections = new Map();

const handleArrayBuffer = (message) => {
    if (message instanceof ArrayBuffer) {
        const decoder = new TextDecoder();
        return decoder.decode(message);
    }
    return message;
};

const app = uWS.App()
    // Global CORS options handler
    .options('/*', (res, req) => {
        res.writeHeader('Access-Control-Allow-Origin', '*');
        res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.end();
    })
    // Authentication endpoint
    .post('/api/auth/token', (res, req) => {
        res.writeHeader('Access-Control-Allow-Origin', '*');
        res.writeHeader('Content-Type', 'application/json');

        const username = 'john_doe'; // In real app, this would come from request body
        const token = generateToken(username);
        res.end(JSON.stringify({ token }));
    })
    // Message sending endpoint
    .post('/api/messages/send', (res, req) => {
        res.onData(async (dataBuffer) => {
            const stringed = handleArrayBuffer(dataBuffer);
            
            const { connectionId, channelId, data } = JSON.parse(stringed);

            const ws = connections.get(connectionId);
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'channel_message',
                    channelId,
                    data,
                    timestamp: Date.now()
                }));   
            }
        });
        res.write("Great knowing you");
        res.writeStatus("200OK");
        res.end();
    })

    // WebSocket endpoint under /api/ws
    .ws('/api/ws', {
        compression: uWS.SHARED_COMPRESSOR,
        maxPayloadLength: 16 * 1024 * 1024,
        idleTimeout: 60,

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
                    user: validationResult.user,
                    currentChannels: new Set()
                },
                req.getHeader('sec-websocket-key'),
                req.getHeader('sec-websocket-protocol'),
                req.getHeader('sec-websocket-extensions'),
                context
            );
        },

        open: (ws) => {
            console.log(`New connection (${ws.connectionId}) established for user: ${ws.user.username}`);
            connections.set(ws.connectionId, ws);

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
                    ws.currentChannels.add(channel);
                    if (!channelConnections.has(channel)) {
                        channelConnections.set(channel, new Set([ws.connectionId]));
                    } else {
                        channelConnections.get(channel).add(ws.connectionId);
                    }

                    console.log(`Connection ${ws.connectionId} subscribed to channel ${channel}`, channelConnections.get(channel));

                    ws.send(JSON.stringify({
                        type: 'subscription_success',
                        channel,
                        connectionId: ws.connectionId,
                        timestamp
                    }));

                } else if (action === 'unsubscribe' && channel) {
                    ws.currentChannels.delete(channel);

                    if (channelConnections.has(channel)) {
                        channelConnections.get(channel).delete(ws.connectionId);
                    }

                    console.log(`Connection ${ws.connectionId} unsubscribed from channel ${channel}`, channelConnections.get(channel));

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
            connections.delete(ws.connectionId);
            ws.currentChannels = null;
        },
    })
    .listen(port, (listenSocket) => {
        if (listenSocket) {
            console.log(`Server is listening on port ${port}`);
        } else {
            console.log(`Failed to listen on port ${port}`);
            process.exit(1); // Exit if we can't bind to the port
        }
    });