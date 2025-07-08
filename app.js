// app.js
const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const fsPromises   = require('fs/promises');
const jwt          = require('jsonwebtoken');
const jwksClient   = require('jwks-rsa');
const axios        = require('axios');
const Database     = require('better-sqlite3');
require('dotenv').config();

const app   = express();
const port  = process.env.PORT || 10000;
const logDir  = path.join(__dirname, 'log');
const logFile = path.join(logDir, 'webhook.log');

// ensure log directory
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

console.log('🟡 Starting chatbot server...');

// ———————————
// MIDDLEWARE
// ———————————
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ———————————
// DB SETUP
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
// JWT VERIFICATION HELPER
// ———————————
async function verifyWorkvivoRequest(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header?.kid || !decoded.payload?.publicKeyUrl) {
    throw new Error('Malformed JWT');
  }
  const { kid } = decoded.header;
  const jwksUri = decoded.payload.publicKeyUrl;
  const client = jwksClient({ jwksUri });
  const key = await client.getSigningKey(kid);
  const pub = key.getPublicKey();
  return jwt.verify(token, pub);
}

// ———————————
// WEBHOOK ENDPOINT
// ———————————
app.post('/webhook', async (req, res) => {
  // 1) log
  console.log('🚨 /webhook called');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body   :', JSON.stringify(req.body,   null, 2));
  await fsPromises.appendFile(logFile, JSON.stringify({
    time: new Date().toISOString(),
    headers: req.headers,
    body: req.body
  }, null, 2) + '\n');

  // 2) get token
  const token = req.headers['x-workvivo-jwt'];
  if (!token) {
    console.error('❌ Missing JWT header');
    return res.status(401).json({ error: 'Missing JWT' });
  }

  // 3) dummy-token bypass
  const isDummy = token === 'dummy-token';
  if (!isDummy) {
    // real verify
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

  // 4) extract & validate payload
  const { action, category, message, bot, channel } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ message: 'Ignored non-message action' });
  }
  const userText = message?.text?.trim().toLowerCase();
  if (!userText) {
    return res.status(400).json({ error: 'Message text missing' });
  }

  // 5) lookup FAQ
  let answer = "Sorry, I don't know how to respond to that.";
  try {
    const row = db.prepare(
      `SELECT answer
         FROM faqs
        WHERE LOWER(question)=?`
    ).get(userText);
    if (row) answer = row.answer;
  } catch (err) {
    console.error('❌ DB error:', err.message);
  }

  // 6) build response
  const payload = {
    bot_userid:  bot.bot_userid,
    channel_url: channel.channel_url,
    type:        'message',
    message:     answer
  };

  // 7) dummy-token: just echo it back
  if (isDummy) {
    console.log('🟡 Dummy response payload:', payload);
    return res.status(200).json(payload);
  }

  // 8) otherwise POST back to Workvivo API
  try {
    const resp = await axios.post(
      process.env.WORKVIVOAPIURL,
      payload,
      {
        headers: {
          'Workvivo-Id':  process.env.WORKVIVOID,
          'Authorization': `Bearer ${process.env.WORKVIVOTOKEN}`,
          'Content-Type':  'application/json'
        }
      }
    );
    console.log('✅ Sent to Workvivo:', resp.data);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Failed to send to Workvivo:', err.message);
    return res.status(500).json({ error: 'Failed to send response' });
  }
});

// ———————————
// HEALTHCHECK
// ———————————
app.get('/', (req, res) => {
  res.send('Chatbot is running.');
});

// ———————————
// START
// ———————————
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
