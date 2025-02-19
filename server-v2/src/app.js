const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const { Server } = require("socket.io")
const io = new Server(server)

app.use(express.static('public'))
app.use(express.json()) // Add middleware to parse JSON bodies

const port = 3000
const { v4: uuidv4 } = require("uuid")

// Generate a UUID v4
const uuid = uuidv4();

const server_info = {
    server_id: uuid
}

// Store socket connections
const connections = {}

app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
});

app.get('/set-cookie', (req, res) => {
    const name = req.query.name
    const value = req.query.value

    res.cookie(name, value)
    res.send({
        "command": "set-cookie",
        "cookies": {
            [name]: value
        }
    })
})

app.get('/server-info', (req, res) => {
    res.send(server_info)
})

app.get('/', (req, res) => {
    res.sendFile('index.html')
})

// Add POST endpoint for sending messages to specific connection
app.post('/send-message', (req, res) => {
    const { connectionId, payload } = req.body

    if (!connectionId || !payload) {
        return res.status(400).json({ 
            error: 'connectionId and payload are required'
        })
    }

    const socket = connections[connectionId]
    if (!socket) {
        return res.status(404).json({
            error: 'Connection not found'
        })
    }

    try {
        socket.emit('message', payload)
        res.status(200).json({
            success: true,
            message: 'Message sent successfully'
        })
    } catch (error) {
        res.status(500).json({
            error: 'Failed to send message',
            details: error.message
        })
    }
})

io.on('connection', (socket) => {
    const connectionId = `conn_${uuidv4()}`
    connections[connectionId] = socket

    socket.emit('connection-established', { connectionId })

    setTimeout(_ => {
        socket.emit("server-info", server_info)
    }, 3000)
    console.log("new connection", socket.id);

    socket.on('disconnect', () => {
        delete connections[connectionId]
        console.log(`Client disconnected: ${connectionId}`)
    })
});

server.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})