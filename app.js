const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

console.log("🟡 Starting chatbot server...");

// Connect to SQLite DB
let db;
try {
  const dbPath = path.join(__dirname, 'db', 'faq.db');
  console.log("📁 DB path:", dbPath);
  db = new Database(dbPath);
  console.log("✅ Connected to SQLite DB");
} catch (err) {
  console.error("❌ Failed to connect to DB:", err.message);
  process.exit(1);
}

app.use(express.json());

// Webhook endpoint to receive Workvivo messages
app.post('/webhook', async (req, res) => {
  const webhook = req.body;

  // Validate expected structure
  if (webhook.action !== 'message') {
    return res.status(200).json({ message: 'Non-message action received.' });
  }

  const messageText = webhook.message?.message;
  const channelUrl = webhook.message?.channel_url;
  const botUserId = webhook.message?.bot_userid;

  if (!messageText || !channelUrl || !botUserId) {
    return res.status(400).json({ error: 'Missing required message fields.' });
  }

  // Look up FAQ response
  let answer = "Sorry, I don't know how to respond to that.";
  try {
    const row = db.prepare("SELECT answer FROM faqs WHERE LOWER(question) = LOWER(?)").get(messageText.toLowerCase());
    if (row) answer = row.answer;
  } catch (err) {
    console.error("❌ DB query failed:", err.message);
  }

  // Send response back to Workvivo
  try {
    const response = await axios.post(process.env.WORKVIVOAPIURL, {
      bot_userid: botUserId,
      channel_url: channelUrl,
      type: "message",
      message: answer
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.API_TOKEN}`,
        "Workvivo-Id": process.env.WORKVIVO_ID,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ Sent reply to Workvivo:", response.data);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error replying to Workvivo:", err.message);
    return res.status(500).json({ error: 'Failed to send reply.' });
  }
});

// Simple test route
app.get('/', (req, res) => {
  res.send('Chatbot is running.');
});

app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
