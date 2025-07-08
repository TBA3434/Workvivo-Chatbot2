const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios = require('axios');
const Database = require('better-sqlite3');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;
const logFile = path.join(__dirname, 'log', 'webhook.log');

// Ensure log directory exists
if (!fs.existsSync(path.dirname(logFile))) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}

console.log('🟡 Starting chatbot server...');

// ———————————
// MIDDLEWARE
// ———————————
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ———————————
// DATABASE SETUP
// ———————————
let db;
try {
  const dbPath = path.join(__dirname, 'db', 'faq.db');
  console.log('📁 DB path:', dbPath);
  db = new Database(dbPath);
  console.log('✅ Connected to SQLite DB');
} catch (err) {
  console.error('❌ Failed to connect to DB:', err.message);
  process.exit(1);
}

// ———————————
// JWT VERIFICATION
// ———————————
async function verifyWorkvivoRequest(token) {
  const decoded = jwt.decode(token, { complete: true });
  const { kid } = decoded.header;
  const publicKeyUrl = decoded.payload.publicKeyUrl;

  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key = await client.getSigningKey(kid);
  const signingKey = key.getPublicKey();
  return jwt.verify(token, signingKey);
}

// ———————————
// WEBHOOK HANDLER
// ———————————
app.post('/webhook', async (req, res) => {
  // — Logging at the top
  console.log('🚨 /webhook was called');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  await fsPromises.appendFile(logFile, JSON.stringify(req.body, null, 2) + '\n');

  // — Verify JWT
  const token = req.headers['x-workvivo-jwt'];
  if (!token) {
    console.error('❌ Missing JWT');
    return res.status(401).json({ error: 'Missing JWT' });
  }
  try {
    await verifyWorkvivoRequest(token);
    console.log('✅ JWT verified');
  } catch (err) {
    console.error('❌ JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid JWT' });
  }

  if (req.headers['x-workvivo-jwt'] === 'dummy-token') {
    console.log('⚠️ Skipping JWT for local test');
  } else {
    // normal verifyWorkvivoRequest(token) logic
  }

  // — Extract and validate payload
  const { action, category, message, bot, channel } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ message: 'Non-message action received.' });
  }
  const userText = message?.text?.toLowerCase();
  if (!userText) {
    return res.status(400).json({ error: 'Message text missing' });
  }

  // — Lookup DB
  let answer = "Sorry, I don't know how to respond to that.";
  try {
    const row = db.prepare("SELECT answer FROM faqs WHERE LOWER(question) = LOWER(?)").get(userText);
    if (row) answer = row.answer;
  } catch (err) {
    console.error('❌ DB error:', err.message);
  }

  // — Build response payload
  const responsePayload = {
    bot_userid: bot.bot_userid,
    channel_url: channel.channel_url,
    type: 'message',
    message: answer
  };

  // — Send it back via Workvivo API
  try {
    const sendResp = await axios.post(process.env.WORKVIVOAPIURL, responsePayload, {
      headers: {
        'Authorization': `Bearer ${process.env.WORKVIVOTOKEN}`,
        'Workvivo-Id': process.env.WORKVIVOID,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Message sent to Workvivo:', sendResp.data);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Failed to send message to Workvivo:', err.message);
    return res.status(500).json({ error: 'Failed to send response' });
  }
});

// ———————————
// HEALTH CHECK
// ———————————
app.get('/', (req, res) => {
  res.send('Chatbot is running.');
});

// ———————————
// START SERVER
// ———————————
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
