const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const { Server } = require("socket.io")
const io = new Server(server)

app.use(express.static('public'))


const port = 3000
const { v4: uuidv4 } = require("uuid")

// Generate a UUID v4
const uuid = uuidv4();

const server_info = {
    server_id: uuid
}

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

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

app.get('/server-info', (req, res) => {
    res.send(server_info)
})

app.get('/', (req, res) => {
    res.sendFile('index.html')
})


app.post('/api/messages/send', (req, res) => {
    console.log("message received", req.body)
    const { connectionId, data } = req.body;

    io.to(connectionId).emit("message", data)
    res.json({})
})

io.on('connection', (socket) => {

    setTimeout(_ => {
        socket.emit("server-info", server_info, socket.id)
    }, 3000)
    console.log("new connection", socket.id);
});

server.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})