// app.js
const fs        = require('fs');
const path      = require('path');
const express   = require('express');
const jwt       = require('jsonwebtoken');
const jwksRsa   = require('jwks-rsa');
const axios     = require('axios');
const Database  = require('better-sqlite3');

// load .env into process.env
require('dotenv').config({
  path: path.join(__dirname, '.env')
});

// ─── Environment Variables ─────────────────────────────────────────────────────
const PORT             = process.env.PORT || 10000;
const WORKVIVO_API_URL = process.env.WORKVIVO_API_URL;
const WORKVIVO_ID      = process.env.WORKVIVO_ID;
const WORKVIVO_TOKEN   = process.env.WORKVIVO_TOKEN;
const QA_DB_PATH       = process.env.QA_DB_PATH;
const SKIP_JWT         = process.env.SKIP_JWT_VERIFICATION === 'true';

// ─── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Open FAQ SQLite DB ────────────────────────────────────────────────────────
let db;
try {
  db = new Database(path.resolve(__dirname, QA_DB_PATH), { fileMustExist: true });
  console.log(`✅ Opened DB at ${QA_DB_PATH}`);
} catch (e) {
  console.error(`❌ Could not open DB at ${QA_DB_PATH}:`, e.message);
  process.exit(1);
}

// ─── (Optional) JWT Verification Helper ────────────────────────────────────────
async function verifyWorkvivoRequest(token) {
  const decoded = jwt.decode(token, { complete: true });
  const { kid } = decoded.header;
  const { publicKeyUrl } = decoded.payload;
  const client = jwksRsa({ jwksUri: publicKeyUrl });
  const key    = await client.getSigningKey(kid);
  return jwt.verify(token, key.getPublicKey());
}

// ─── Webhook Endpoint ─────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  console.log('🚨 /webhook called', req.headers, req.body);

  const token = req.headers['x-workvivo-jwt'];
  if (!SKIP_JWT) {
    if (!token) return res.status(401).json({ error: 'Missing JWT' });
    try {
      await verifyWorkvivoRequest(token);
    } catch (err) {
      console.error('❌ JWT verification failed', err.message);
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    console.log('⚠️  Skipping JWT verification');
  }

  const { action, category, bot, channel, message } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ ok: true });
  }

  // Lookup Q/A
  const userText = (message.text || '').toLowerCase();
  const stmt     = db.prepare(
    `SELECT answer FROM faq
     WHERE lower(question) LIKE ?
     LIMIT 1`
  );
  const row = stmt.get(`%${userText}%`);
  const replyText = row
    ? row.answer
    : "Sorry, I don't know the answer to that yet.";

  // Build payload
  const payload = {
    bot_userid:  bot.bot_userid,
    channel_url: channel.channel_url,
    type:        'message',
    message:     replyText
  };

  // Send back to Workvivo
  try {
    await axios.post(
      WORKVIVO_API_URL,
      payload,
      {
        headers: {
          'Content-Type':  'application/json',
          'Workvivo-Id':    WORKVIVO_ID,
          'Authorization': `Bearer ${WORKVIVO_TOKEN}`
        }
      }
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Workvivo send error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to send response' });
  }
});

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('✅ Bot server is running');
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
