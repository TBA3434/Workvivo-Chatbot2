// app.js
const fs       = require('fs');
const path     = require('path');
const express  = require('express');
const jwt      = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios    = require('axios');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '.env') });

//
// Environment variables
//
const PORT             = process.env.PORT || 10000;
const WORKVIVO_API_URL = process.env.WORKVIVO_API_URL;
const WORKVIVO_ID      = process.env.WORKVIVO_ID;
const WORKVIVO_TOKEN   = process.env.WORKVIVO_TOKEN;
const QA_DB_PATH       = process.env.QA_DB_PATH || path.join(__dirname, 'db', 'faq.db');

//
// Open your SQLite FAQ database (readonly)
//
const db = new Database(QA_DB_PATH, { readonly: true });

//
// Express setup
//
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//
// Helper: verify real JWTs, but allow dummy-token for testing
//
async function verifyWorkvivoRequest(token) {
  if (token === 'dummy-token') {
    console.log('⚠️  Skipping JWT verification for dummy-token');
    return true;
  }
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error('Invalid token format');
  const { kid } = decoded.header;
  const { publicKeyUrl } = decoded.payload;
  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key = await client.getSigningKey(kid);
  const publicKey = key.getPublicKey();
  return jwt.verify(token, publicKey);
}

//
// Webhook endpoint
//
app.post('/webhook', async (req, res) => {
  console.log('🚨  /webhook called', req.headers, req.body);
  const token   = req.headers['x-workvivo-jwt'];
  const hook    = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Missing Workvivo JWT' });
  }
  try {
    await verifyWorkvivoRequest(token);
  } catch (err) {
    console.error('❌ JWT verification failed', err);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (hook.action === 'chat_bot_message_sent' && hook.category === 'bot_message_notification') {
    const userQ = hook.message?.text?.trim().toLowerCase() || '';
    // try to find a matching FAQ (simple LIKE match)
    let answer = "Sorry, I don't know that one yet.";
    const row = db.prepare('SELECT answer FROM faq WHERE question LIKE ? LIMIT 1')
                  .get(`%${userQ}%`);
    if (row) answer = row.answer;

    // build the reply payload
    const payload = {
      bot_userid:   hook.bot.bot_userid,
      channel_url:  hook.channel.channel_url,
      type:         'message',
      message:      answer
    };

    try {
      await axios.post(WORKVIVO_API_URL, payload, {
        headers: {
          'Workvivo-Id':   WORKVIVO_ID,
          'Authorization': `Bearer ${WORKVIVO_TOKEN}`,
          'Content-Type':  'application/json'
        }
      });
      console.log('✅ Reply sent:', answer);
      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ Workvivo API error', err.response?.status, err.response?.data);
      return res.status(500).json({ error: 'Failed to send reply' });
    }
  }

  // catch-all
  return res.sendStatus(200);
});

//
// Health-check
//
app.get('/', (req, res) => {
  res.status(200).send('Workvivo chatbot webhook is running.');
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
