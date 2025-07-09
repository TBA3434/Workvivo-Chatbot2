// app.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios = require('axios');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 10000;
const logFile = path.join(__dirname, 'log', 'webhook.log');

// ensure log directory exists
if (!fs.existsSync(path.dirname(logFile))) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}

console.log('🟡 Starting chatbot server...');

// ———————————
// MIDDLEWARE
// ———————————
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
  console.log('🚨 /webhook called');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body   :', JSON.stringify(req.body, null, 2));
  await fsPromises.appendFile(logFile, JSON.stringify(req.body, null, 2) + '\n');

  // JWT check
  const token = req.headers['x-workvivo-jwt'];
  if (!token) {
    console.error('❌ Missing JWT');
    return res.status(401).json({ error: 'Missing JWT' });
  }
  if (token === 'dummy-token') {
    console.log('⚠️  Skipping JWT verify for dummy-token');
  } else {
    try {
      await verifyWorkvivoRequest(token);
      console.log('✅ JWT verified');
    } catch (err) {
      console.error('❌ JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid JWT' });
    }
  }

  // Payload validation
  const { action, category, message, bot, channel } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ message: 'Non-message action received.' });
  }
  const userText = message?.text?.toLowerCase();
  if (!userText) {
    return res.status(400).json({ error: 'Message text missing' });
  }

  // DB lookup
  let answer = "Sorry, I don't know how to respond to that.";
  try {
    const row = db
      .prepare("SELECT answer FROM faqs WHERE LOWER(question) = LOWER(?)")
      .get(userText);
    if (row) answer = row.answer;
  } catch (err) {
    console.error('❌ DB error:', err.message);
  }

  // Build response payload
  const responsePayload = {
    bot_userid: bot.bot_userid,
    channel_url: channel.channel_url,
    type: 'message',
    message: answer
  };

  // Send response back to Workvivo
  try {
    const sendResp = await axios.post(
      process.env.WORKVIVO_API_URL,
      responsePayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WORKVIVO_TOKEN}`,
          'Workvivo-Id': process.env.WORKVIVO_ID,
          'Content-Type': 'application/json'
        }
      }
    );
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
