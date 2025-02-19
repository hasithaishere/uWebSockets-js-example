require('dotenv').config();
const SocketServer = require('./SocketServer');

const config = {
  corsOrigin: process.env.CORS_ORIGIN,
  jwtSecret: process.env.JWT_SECRET,
  port: process.env.PORT
};

const socketServer = new SocketServer(config);
socketServer.listen(config.port);

