const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

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

// This is the Workvivo webhook endpoint (your callback URL)
app.post('/webhook', (req, res) => {
  console.log("🟢 Received Workvivo message:", req.body);

  // Extract user message text from Workvivo payload
  const userMessage = req.body.message?.text?.toLowerCase();

  if (!userMessage) {
    return res.status(400).json({ error: 'No message text provided' });
  }

  // Query your FAQ database for a matching answer
  let answer = "Sorry, I don't know how to respond to that.";

  try {
    const row = db.prepare("SELECT answer FROM faqs WHERE LOWER(question) = LOWER(?)").get(userMessage);
    if (row) answer = row.answer;
  } catch (err) {
    console.error("❌ DB error:", err.message);
  }

  // Respond to Workvivo with JSON formatted reply
  // This example sends a plain text message back to the user
  res.json({
    type: "message",
    message: answer
  });
});

// Test route
app.get('/', (req, res) => {
  res.send('Chatbot is running.');
});

app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
