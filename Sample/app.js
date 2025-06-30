/////////////////////////////////////////////////////////////////////////////////////////////////
//
// March 22, 2025
// yosuke.sawamura@zoom.us
// Workvivo Chatbot webserver to programmatically create chatbot thread.  
//
// node v20.17.0
// npm 11.0.0
//
// Note)
// 1. Make sure app.js (this) and package.json is present in the same directory.
//  $ npm install
// 2. Run the script
//  $ node app.js
// 3. Follow the web page provided by app.js.
//     - Enter User ID (Workvivo User ID)
//     - Enter Bot User ID (Retrieve your Bot ID)
//
/////////////////////////////////////////////////////////////////////////////////////////////////


const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 8991;
const JWToken = '<YOUR WORKVIVO API JWT>';
const WORKVIVO_ID = <YOUR WORKVIVO ID>;


// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Route for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// New endpoint to handle the channels API request
app.post('/api/channels', async (req, res) => {
    try {
        const { userId, botUserId } = req.body;
        
        const response = await axios.post('https://api.workvivo.io/v1/chat/bots/channels', {
            user_id: userId,
            bot_userid: botUserId
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${JWToken}`,
                'Workvivo-id': WORKVIVO_ID
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// New endpoint to handle sending messages
app.post('/api/send-message', async (req, res) => {
    try {
        const { bot_userid, channel_url, message } = req.body;
        
        const response = await axios.post('https://api.workvivo.io/v1/chat/bots/message', {
            bot_userid: bot_userid,
            channel_url: channel_url,
            type: "message",
            message: message
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${JWToken}`,
                'Workvivo-id': WORKVIVO_ID
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}); 
