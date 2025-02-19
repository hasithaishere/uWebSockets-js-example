// File: src/SocketServer.js
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const messageApi = require('./messageApi');

class SocketServer {
    constructor(config = {}) {
        this.app = express();
        this.httpServer = createServer(this.app);
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:8081',
            config.corsOrigin
        ].filter(Boolean);

        this.io = new Server(this.httpServer, {
            cors: {
                origin: (origin, callback) => {
                    // Allow requests with no origin (like mobile apps or curl requests)
                    if (!origin) return callback(null, true);

                    if (allowedOrigins.indexOf(origin) !== -1) {
                        callback(null, true);
                    } else {
                        console.warn(`Origin ${origin} not allowed by CORS`);
                        callback(null, true); // Allow all origins in development
                        // In production you might want to restrict: callback(new Error('Not allowed by CORS'))
                    }
                },
                methods: ["GET", "POST"],
                credentials: true,
                allowedHeaders: ["Content-Type", "Authorization"]
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });

        this.JWT_SECRET = config.jwtSecret || 'your-jwt-secret';
        this.setupExpress();
        this.setupMiddleware();
        this.setupEventHandlers();
        this.setupAPI();
    }

    setupExpress() {
        this.app.use(cors({
            origin: [
                'http://localhost:3000',
                'http://localhost:8081'
            ],
            credentials: true
        }));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }

    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) {
                    return next(new Error('Authentication token missing'));
                }

                const decoded = jwt.verify(token, this.JWT_SECRET);
                socket.user = decoded;
                next();
            } catch (error) {
                console.error('Socket authentication error:', error);
                next(new Error('Authentication failed'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);

            socket.on('join', async (data) => {
                try {
                    const { channel } = data;
                    const canAccess = await this.verifyChannelAccess(socket.user, channel);

                    if (!canAccess) {
                        socket.emit('error', {
                            message: 'Channel access denied',
                            channel
                        });
                        return;
                    }

                    socket.join(channel);
                    console.log(`Client ${socket.id} joined channel: ${channel}`);

                    this.io.to(channel).emit(`channel:${channel}:joined`, {
                        userId: socket.user.id,
                        timestamp: new Date()
                    });
                } catch (error) {
                    console.error('Join channel error:', error);
                    socket.emit('error', {
                        message: 'Failed to join channel',
                        error: error.message
                    });
                }
            });

            socket.on('leave', (data) => {
                const { channel } = data;
                socket.leave(channel);
                console.log(`Client ${socket.id} left channel: ${channel}`);

                this.io.to(channel).emit(`channel:${channel}:left`, {
                    userId: socket.user.id,
                    timestamp: new Date()
                });
            });

            socket.onAny((eventName, data) => {
                console.log(`Received event: ${eventName}`, data);
            });

            socket.on('disconnect', (reason) => {
                console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
            });
        });
    }

    setupAPI() {
        this.app.use('/api', messageApi(this));
    }

    async verifyChannelAccess(user, channel) {
        // Implement your channel access verification logic here
        return true;
    }

    broadcastToChannel(channel, eventName, data) {
        this.io.to(channel).emit(`channel:${channel}:${eventName}`, data);
    }

    sendToClient(socketId, eventName, data) {
        this.io.to(socketId).emit(eventName, data);
    }

    broadcastToOthers(socket, channel, eventName, data) {
        socket.broadcast.to(channel).emit(`channel:${channel}:${eventName}`, data);
    }

    listen(port) {
        this.httpServer.listen(port, () => {
            console.log(`Socket.IO server running on port ${port}`);
        });
    }
}

module.exports = SocketServer;
