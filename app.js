require('dotenv').config();
const express       = require('express');
const bodyParser    = require('body-parser');
const path          = require('path');
const fs            = require('fs');
const fsPromises    = require('fs/promises');
const jwt           = require('jsonwebtoken');
const jwksClient    = require('jwks-rsa');
const axios         = require('axios');
const Database      = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 10000;
const logFile = path.join(__dirname, 'log', 'webhook.log');

//— Make sure our log folder exists
if (!fs.existsSync(path.dirname(logFile))) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}

//— Parse JSON bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

//— SQLite
let db;
try {
  const dbPath = path.join(__dirname, 'db', 'faq.db');
  db = new Database(dbPath);
  console.log('✅ Connected to SQLite DB at', dbPath);
} catch (err) {
  console.error('❌ DB connection failed:', err.message);
  process.exit(1);
}

//— Your Workvivo creds from .env
const WORKVIVO_API_URL = process.env.WORKVIVO_API_URL;   // e.g. https://api.workvivo.io/v1/chat/bots/message
const WORKVIVO_TOKEN   = process.env.WORKVIVO_TOKEN;     // e.g. 396|abc...
const WORKVIVO_ID      = process.env.WORKVIVO_ID;        // e.g. 3399

//— (Optional) your JWT-verification stub
async function verifyWorkvivoRequest(token) {
  const decoded = jwt.decode(token, { complete: true });
  const { kid } = decoded.header;
  const publicKeyUrl = decoded.payload.publicKeyUrl;
  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key = await client.getSigningKey(kid);
  return jwt.verify(token, key.getPublicKey());
}

//— Webhook endpoint
app.post('/webhook', async (req, res) => {
  console.log('🚨  /webhook called');
  console.log('Headers:', req.headers);
  console.log('Body   :', req.body);
  await fsPromises.appendFile(logFile, JSON.stringify(req.body) + '\n');

  // JWT
  const token = req.headers['x-workvivo-jwt'];
  if (!token) return res.status(401).json({ error: 'Missing JWT' });
  if (token !== 'dummy-token') {
    try {
      await verifyWorkvivoRequest(token);
    } catch (err) {
      console.error('❌ JWT failed:', err.message);
      return res.status(401).json({ error: 'Invalid JWT' });
    }
  } else {
    console.log('⚠️  Skipping JWT verify for dummy-token');
  }

  // Only handle chat_bot_message_sent
  const { action, category, message, bot, channel } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ message: 'Ignored' });
  }

  const userText = message?.text?.trim().toLowerCase();
  if (!userText) return res.status(400).json({ error: 'No message text' });

  // DB lookup
  let answer = "Sorry, I don't know how to respond to that.";
  try {
    const row = db.prepare(
      "SELECT answer FROM faqs WHERE LOWER(question)=LOWER(?)"
    ).get(userText);
    if (row) answer = row.answer;
  } catch (err) {
    console.error('❌ DB error:', err);
  }

  const payload = {
    bot_userid:  bot.bot_userid,
    channel_url: channel.channel_url,
    type:        'message',
    message:     answer
  };

  // POST back to Workvivo
  try {
    const resp = await axios.post(
      WORKVIVO_API_URL,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${WORKVIVO_TOKEN}`,
          'Workvivo-Id':   WORKVIVO_ID,
          'Content-Type':  'application/json'
        }
      }
    );
    console.log('✅ Workvivo replied with', resp.data);
    return res.status(200).json({ success: true });
  } catch (err) {
    // log full response for debugging
    console.error(
      '❌ Workvivo API error:',
      err.response?.status,
      err.response?.data || err.message
    );
    return res.status(500).json({ error: 'Failed to send response' });
  }
});

//— Healthcheck
app.get('/', (req, res) => res.send('Chatbot is running.'));

app.listen(port, () => {
  console.log(`✅ Listening on port ${port}`);
});
