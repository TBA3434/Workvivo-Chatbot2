require('dotenv').config();
const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const fsPromises   = require('fs/promises');
const jwt          = require('jsonwebtoken');
const jwksClient   = require('jwks-rsa');
const axios        = require('axios');
const Database     = require('better-sqlite3');

const app    = express();
const port   = process.env.PORT || 10000;
const logDir = path.join(__dirname, 'log');
const logFile= path.join(logDir, 'webhook.log');

// ensure log dir
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// — DB setup
let db;
try {
  const dbPath = path.join(__dirname, 'db', 'faq.db');
  db = new Database(dbPath);
  console.log('✅ Connected to SQLite DB at', dbPath);
} catch (e) {
  console.error('❌ DB connection failed:', e.message);
  process.exit(1);
}

// — JWT verify (real)  
async function verifyWorkvivoRequest(token) {
  const decoded = jwt.decode(token, { complete: true });
  const { kid } = decoded.header;
  const publicKeyUrl = decoded.payload.publicKeyUrl;
  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key = await client.getSigningKey(kid);
  return jwt.verify(token, key.getPublicKey());
}

app.post('/webhook', async (req, res) => {
  console.log('🚨  /webhook called');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body   :', JSON.stringify(req.body, null, 2));
  await fsPromises.appendFile(logFile, JSON.stringify(req.body) + '\n');

  const token = req.headers['x-workvivo-jwt'];
  if (!token) return res.status(401).json({ error: 'Missing JWT' });

  if (token !== 'dummy-token') {
    try {
      await verifyWorkvivoRequest(token);
      console.log('✅ JWT verified');
    } catch (err) {
      console.error('❌ JWT verify failed:', err.message);
      return res.status(401).json({ error: 'Invalid JWT' });
    }
  } else {
    console.log('⚠️  Skipping JWT verify for dummy-token');
  }

  const { action, category, message, bot, channel } = req.body;
  if (
    action !== 'chat_bot_message_sent' ||
    category !== 'bot_message_notification'
  ) {
    return res.status(200).json({ message: 'Ignored non-chat event.' });
  }

  const userText = message?.text;
  if (!userText) {
    return res.status(400).json({ error: 'Message text missing' });
  }

  // — FAQ lookup
  let answer = "Sorry, I don't know how to respond to that.";
  try {
    const row = db
      .prepare('SELECT answer FROM faqs WHERE LOWER(question)=LOWER(?)')
      .get(userText);
    if (row) answer = row.answer;
  } catch (e) {
    console.error('❌ DB error:', e.message);
  }

  // — Build payload for Workvivo
  const payload = {
    bot_userid:  bot.bot_userid,
    channel_url: channel.channel_url,
    type:        'message',
    message: {
      text: answer
    }
  };
  console.log('🟡 Reply payload:', JSON.stringify(payload, null, 2));

  // — Post back
  try {
    const resp = await axios.post(
      process.env.WORKVIVO_API_URL,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WORKVIVO_TOKEN}`,
          'Workvivo-Id':   process.env.WORKVIVO_ID,
          'Content-Type':  'application/json'
        }
      }
    );
    console.log('✅ Sent to Workvivo:', resp.data);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(
      '❌ Workvivo API error:',
      err.response?.status,
      JSON.stringify(err.response?.data, null, 2)
    );
    return res.status(500).json({ error: 'Failed to send response' });
  }
});

app.get('/', (req, res) => {
  res.send('Chatbot is running.');
});

app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
