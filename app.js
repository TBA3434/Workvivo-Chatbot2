const path        = require('path');
const express     = require('express');
const jwt         = require('jsonwebtoken');
const jwksClient  = require('jwks-rsa');
const axios       = require('axios');
const Database    = require('better-sqlite3');

// load .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

// env vars
const PORT             = process.env.PORT           || 10000;
const WORKVIVO_API_URL = process.env.WORKVIVO_API_URL;
const WORKVIVO_ID      = process.env.WORKVIVO_ID;
const WORKVIVO_TOKEN   = process.env.WORKVIVO_TOKEN;
const QA_DB_PATH       = process.env.QA_DB_PATH     || path.join(__dirname, 'db', 'faq.db');

// open your QA database
const db = new Database(QA_DB_PATH, { readonly: true });

const app = express();
app.use(express.json());

// verify the incoming Workvivo webhook JWT
async function verifyWorkvivoRequest(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error('Invalid token format');
  const { kid } = decoded.header;
  const { publicKeyUrl } = decoded.payload;
  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key    = await client.getSigningKey(kid);
  const pubKey = key.getPublicKey();
  return jwt.verify(token, pubKey);
}

app.post('/webhook', async (req, res) => {
  console.log('🚨 /webhook called', req.headers, req.body);

  const token = req.headers['x-workvivo-jwt'];
  if (!token) return res.status(401).json({ error: 'Missing Workvivo JWT' });

  try {
    await verifyWorkvivoRequest(token);
  } catch (e) {
    console.error('❌ JWT verification failed', e);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { action, category, bot, channel, message } = req.body;

  // only respond to user messages
  if (action === 'chat_bot_message_sent' && category === 'bot_message_notification') {
    const userText = (message.text || '').trim().toLowerCase();

    // simple LIKE match against your sqlite FAQ table
    const stmt = db.prepare(`
      SELECT answer
      FROM faq
      WHERE lower(question) LIKE ?
      LIMIT 1
    `);
    const row = stmt.get(`%${userText}%`);
    const answer = row
      ? row.answer
      : "Sorry, I don't have an answer for that yet.";

    // build your reply payload (message must be a string)
    const payload = {
      bot_userid:  bot.bot_userid,
      channel_url: channel.channel_url,
      type:       'message',
      message:    answer
    };

    try {
      const resp = await axios.post(
        WORKVIVO_API_URL,
        payload,
        {
          headers: {
            'Workvivo-Id': WORKVIVO_ID,
            'Authorization': `Bearer ${WORKVIVO_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Workvivo reply sent', resp.data);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('❌ Workvivo API error', err.response?.data || err);
      return res.status(500).json({ error: 'Failed to post reply' });
    }
  }

  // otherwise just 200 OK
  res.status(200).json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🤖 Workvivo bot listening on port ${PORT}`);
});
