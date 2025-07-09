// ─── Imports ───────────────────────────────────────────────────────────────────
const path       = require('path');
const express    = require('express');
const axios      = require('axios');
const jwt        = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const Database   = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ─── Environment Variables ─────────────────────────────────────────────────────
const PORT             = process.env.PORT || 10000;
const WORKVIVO_API_URL = process.env.WORKVIVO_API_URL;
const WORKVIVO_ID      = process.env.WORKVIVO_ID;
const WORKVIVO_TOKEN   = process.env.WORKVIVO_TOKEN;
// fallback to ./db/faq.db if QA_DB_PATH isn’t set
const QA_DB_PATH       = process.env.QA_DB_PATH
                          ? path.resolve(__dirname, process.env.QA_DB_PATH)
                          : path.join(__dirname, 'db', 'faq.db');
const SKIP_JWT         = process.env.SKIP_JWT_VERIFICATION === 'true';

// ─── Setup Express ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── Open your SQLite Q&A DB ─────────────────────────────────────────────────
let db;
try {
  db = new Database(QA_DB_PATH, { fileMustExist: true });
  console.log(`✅ Opened DB at ${QA_DB_PATH}`);
} catch (err) {
  console.error(`❌ Could not open DB at ${QA_DB_PATH}:`, err.message);
  process.exit(1);
}

// Pre-prepare a statement for fast queries
const findAnswer = db.prepare(
  `SELECT answer 
     FROM faq 
    WHERE question LIKE ? 
    LIMIT 1`
);

// ─── Optional JWT Verification ────────────────────────────────────────────────
async function verifyWorkvivoRequest(token) {
  if (SKIP_JWT) {
    console.log('⚠️  Skipping JWT verification (dev mode)');
    return;
  }
  const decoded = jwt.decode(token, { complete: true });
  const { kid } = decoded.header;
  const { publicKeyUrl } = decoded.payload;
  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key = await client.getSigningKey(kid);
  return jwt.verify(token, key.getPublicKey());
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  console.log('🚨  /webhook called', req.headers, req.body);

  const token = req.headers['x-workvivo-jwt'];
  try {
    if (!token) throw new Error('Missing Workvivo JWT');
    await verifyWorkvivoRequest(token);
  } catch (err) {
    console.error('❌ JWT verification failed', err.message);
    return res.status(401).json({ error: 'Invalid or missing JWT' });
  }

  const { action, category, bot, channel, message } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ skipped: true });
  }

  // lookup in your Q&A table using a simple LIKE
  const userQ = message.text.trim();
  const row   = findAnswer.get(`%${userQ}%`);
  const answer = row ? row.answer : "Sorry, I don't know the answer to that yet.";

  // build the payload Workvivo expects
  const payload = {
    bot_userid:  bot.bot_userid,
    channel_url: channel.channel_url,
    type:        'message',
    message:     answer
  };

  try {
    await axios.post(
      WORKVIVO_API_URL,
      payload,
      {
        headers: {
          'Workvivo-Id':  WORKVIVO_ID,
          'Authorization': `Bearer ${WORKVIVO_TOKEN}`,
          'Content-Type':  'application/json'
        }
      }
    );
    console.log('🟢 Replied:', answer);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Workvivo API error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to send response' });
  }
});

// ─── Healthcheck ──────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.send('Workvivo chatbot webhook is up ✅');
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
