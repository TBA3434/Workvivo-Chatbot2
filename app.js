// app.js
require('dotenv').config();

const express     = require('express');
const bodyParser  = require('body-parser');
const path        = require('path');
const fs          = require('fs');
const fsPromises  = require('fs/promises');
const axios       = require('axios');
const Database    = require('better-sqlite3');
const jwt         = require('jsonwebtoken');
const jwksClient  = require('jwks-rsa');

const app     = express();
const port    = process.env.PORT || 10000;
const logFile = path.join(__dirname, 'log', 'webhook.log');

// ensure log folder
if (!fs.existsSync(path.dirname(logFile))) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}

// parse JSON
app.use(bodyParser.json());
app.use(express.static('public'));

// init DB
let db;
try {
  db = new Database(path.join(__dirname, 'db', 'faq.db'));
  console.log('✅ SQLite connected');
} catch (err) {
  console.error('❌ DB error:', err);
  process.exit(1);
}

// (Optional) JWT verify stub
async function verifyJWT(token) {
  if (token === 'dummy-token') return;
  const decoded = jwt.decode(token, { complete: true });
  const client  = jwksClient({ jwksUri: decoded.payload.publicKeyUrl });
  const key     = await client.getSigningKey(decoded.header.kid);
  const pubKey  = key.getPublicKey();
  jwt.verify(token, pubKey);
}

app.post('/webhook', async (req, res) => {
  console.log('🚨  /webhook called');
  console.log('Headers:', req.headers);
  console.log('Body   :', req.body);
  await fsPromises.appendFile(logFile, JSON.stringify(req.body) + '\n');

  const token = req.headers['x-workvivo-jwt'];
  if (!token) return res.status(401).json({ error: 'Missing JWT' });
  try {
    await verifyJWT(token);
  } catch (err) {
    console.error('❌ JWT verify failed', err.message);
    return res.status(401).json({ error: 'Invalid JWT' });
  }

  const { action, category, bot, channel, message } = req.body;
  if (action !== 'chat_bot_message_sent' || category !== 'bot_message_notification') {
    return res.status(200).json({ message: 'Ignored event' });
  }

  const text = (message.text || '').trim();
  if (!text) return res.status(400).json({ error: 'No message text' });

  // lookup FAQ
  let answer = "Sorry, I don't know that one.";
  const row = db.prepare('SELECT answer FROM faqs WHERE LOWER(question)=LOWER(?)')
                .get(text);
  if (row) answer = row.answer;

  // build reply (message must be a string, no \n)
  const payload = {
    bot_userid:  bot.bot_userid,
    channel_url: channel.channel_url,
    type:        'message',
    message:     answer.trim()
  };
  console.log('🟡 Reply payload:', payload);

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
    console.log('✅ Workvivo response:', resp.data);
    return res.sendStatus(200);
  } catch (err) {
    console.error('❌ Workvivo API error:',
      err.response?.status, err.response?.data);
    return res.status(500).json({ error: 'Failed to send' });
  }
});

app.get('/', (req, res) => res.send('OK')); 

app.listen(port, () => console.log(`🚀 Listening on ${port}`));
