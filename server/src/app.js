const express = require('express');
const crypto = require('crypto');
const os = require('os');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;

// Middleware
app.use(cookieParser());

// Function to get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName of Object.keys(interfaces)) {
        const interface = interfaces[interfaceName];
        for (const address of interface) {
            if (address.family === 'IPv4' && !address.internal) {
                return address.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback to localhost if no other IP is found
}

// Function to hash string using SHA256
function hashSHA256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// IP handling endpoint
app.get('/ip', (req, res) => {
    const localIP = getLocalIP();
    const hashedIP = hashSHA256(localIP);
    
    // Set cookie with hashed IP
    res.cookie('hashed_ip', hashedIP, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
        ip: localIP,
        hashedIP: hashedIP
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Local IP: ${getLocalIP()}`);
});