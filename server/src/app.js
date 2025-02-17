const express = require('express')
const app = express()
const port = 3000
const { v4: uuidv4 } = require("uuid");

// Generate a UUID v4
const uuid = uuidv4();

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
    res.send({
        server_id: uuid
    })
})

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})