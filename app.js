const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 10000;

// Start message
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

// Middleware to parse JSON
app.use(express.json());

// Webhook endpoint - this is your callback URL for Workvivo
app.post('/webhook', async (req, res) => {
  console.log("🟢 Incoming webhook payload:", JSON.stringify(req.body, null, 2));

  const { action, message, bot, channel } = req.body;

  if (action === 'chat_bot_message_sent' && message?.text) {
    const userMessage = message.text.toLowerCase();
    let answer = "Sorry, I don't know how to respond to that.";

    try {
      const row = db.prepare("SELECT answer FROM faqs WHERE LOWER(question) = LOWER(?)").get(userMessage);
      if (row) answer = row.answer;
    } catch (err) {
      console.error("❌ DB error:", err.message);
    }

    return res.json({
      bot_userid: bot.bot_userid,
      channel_url: channel.channel_url,
      type: "message",
      message: answer
    });
  }

  return res.status(200).json({ message: "Non-message action received." });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('✅ Chatbot server is running.');
});

app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
