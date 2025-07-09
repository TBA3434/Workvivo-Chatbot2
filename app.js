/////////////////////////////////////////////////////////////////////////////////////////////////
//
// Workvivo Chatbot + FAQ Webhook Server
// Adapted from Yosuke Sawamura sample demo
//
// node v20+, npm 11+
//
/////////////////////////////////////////////////////////////////////////////////////////////////

// import modules
const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Create Express app
const app = express();
app.use(express.json()); // parse JSON bodies

// Environment variables
const PORT = process.env.PORT || 10000;
const WORKVIVO_API_URL = process.env.WORKVIVO_API_URL;
const WORKVIVO_ID       = process.env.WORKVIVO_ID;
const WORKVIVO_TOKEN    = process.env.WORKVIVO_TOKEN;
const QA_DB_PATH        = process.env.QA_DB_PATH || path.join(__dirname, 'db', 'faq.db');

// Open SQLite database (read-only)
const db = new sqlite3.Database(QA_DB_PATH, sqlite3.OPEN_READONLY, err => {
  if (err) console.error('Failed to open FAQ DB:', err);
  else console.log('Connected to FAQ DB at', QA_DB_PATH);
});

// Utility: verify Workvivo JWT header
async function verifyWorkvivoRequest(token) {
  const decoded = jwt.decode(token, { complete: true });
  const { kid } = decoded.header;
  const { publicKeyUrl } = decoded.payload;
  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key = await client.getSigningKey(kid);
  const signingKey = key.getPublicKey();
  return jwt.verify(token, signingKey);
}

// Webhook handler
async function handleWebhook(req, res) {
  console.log('/webhook called');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body));

  const payload = req.body;
  const token = req.headers['x-workvivo-jwt'];

  // Only handle chat bot message events
  if (payload.action !== 'chat_bot_message_sent') {
    return res.status(200).json({ success: true });
  }

  // Verify signature
  if (!token) {
    return res.status(401).json({ error: 'Missing Workvivo JWT' });
  }
  try {
    await verifyWorkvivoRequest(token);
  } catch (err) {
    console.error('JWT verification failed:', err);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Extract message details
  const msg = payload.message;
  const userQuestion = msg.message;        // user's text
  const botUserId    = msg.bot_userid;     // bot ID
  const channelUrl   = msg.channel_url;    // channel to reply

  // Lookup answer in SQLite DB (exact match for now)
  db.get(
    'SELECT answer FROM faq WHERE question = ?',
    [userQuestion],
    (err, row) => {
      if (err) {
        console.error('DB lookup error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      const answer = row ? row.answer :
        'Sorry, I don\'t have an answer for that right now.';

      // Build reply payload
      const replyPayload = {
        bot_userid: botUserId,
        channel_url: channelUrl,
        type: 'message',
        message: answer
      };

      // Send reply back to Workvivo
      axios({
        method: 'post',
        url: WORKVIVO_API_URL,
        headers: {
          'Workvivo-Id': WORKVIVO_ID,
          'Authorization': `Bearer ${WORKVIVO_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: replyPayload
      })
      .then(apiRes => {
        console.log('Replied:', apiRes.data);
        res.status(200).json({ success: true });
      })
      .catch(apiErr => {
        console.error('Workvivo API error:', apiErr.response?.data || apiErr);
        res.status(500).json({ error: 'Failed to send response' });
      });
    }
  );
}

// Routes
app.post('/webhook', handleWebhook);
app.get('/', (req, res) => {
  res.status(200).send('Workvivo Chatbot Webhook is running.');
});

// Start server
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});