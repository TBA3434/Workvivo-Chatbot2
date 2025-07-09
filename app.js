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

// ensure logging folder exists
if (!fs.existsSync(path.dirname(logFile))) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}

// parse JSON bodies
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
// JWT VERIFICATION (unused for dummy-token)
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
// WEBHOOK ENDPOINT
// ———————————
app.post('/webhook', async (req, res) => {
  console.log('🚨  /webhook called');
  console.log('Headers:', req.headers);
  console.log('Body   :', req.body);
  await fsPromises.appendFile(logFile, JSON.stringify(req.body) + '\n');

  const token = req.headers['x-workvivo-jwt'];
  if (!token) {
    return res.status(401).json({ error: 'Missing JWT' });
  }
  if (token !== 'dummy-token') {
    try {
      await verifyWorkvivoRequest(token);
      console.log('✅ JWT verified');
    } catch (err) {
      console.error('❌ JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid JWT' });
    }
  } else {
    console.log('⚠️  Skipping JWT verify for dummy-token');
  }

  const { action, category, message, bot, channel } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ message: 'Ignored non-message event.' });
  }

  const userText = message?.text?.trim().toLowerCase();
  if (!userText) {
    return res.status(400).json({ error: 'No message text.' });
  }

  // lookup FAQ
  let answer = "Sorry, I don't know how to respond to that.";
  try {
    const row = db
      .prepare('SELECT answer FROM faqs WHERE LOWER(question)=LOWER(?)')
      .get(userText);
    if (row) answer = row.answer;
  } catch (err) {
    console.error('❌ DB error:', err.message);
  }

  // build the correct payload: message must be a string
  const reply = {
    bot_userid:  bot.bot_userid,
    channel_url: channel.channel_url,
    type:        'message',
    message:     answer
  };
  console.log('🟡 Reply payload:', reply);

  // send it back via Workvivo REST API
  try {
    const resp = await axios.post(
      process.env.WORKVIVO_API_URL,
      reply,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WORKVIVO_TOKEN}`,
          'Workvivo-Id':   process.env.WORKVIVO_ID,
          'Content-Type':  'application/json'
        }
      }
    );
    console.log('✅ Sent to Workvivo:', resp.data);
    return res.sendStatus(200);
  } catch (err) {
    console.error(
      '❌ Workvivo API error:',
      err.response?.status,
      err.response?.data
    );
    return res.status(500).json({ error: 'Failed to send response' });
  }
});

// health check
app.get('/', (req, res) => res.send('Chatbot is running.'));

// start
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
