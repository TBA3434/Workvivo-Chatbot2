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

// Workvivo webhook endpoint
app.post('/webhook', (req, res) => {
  console.log("🟢 Received Workvivo message:");
  console.log(JSON.stringify(req.body, null, 2));

  const userMessage = req.body?.message?.message?.toLowerCase();

  if (!userMessage) {
    return res.status(400).json({ error: 'No message provided in payload.' });
  }

  let answer = "Sorry, I couldn't find an answer for that.";

  try {
    const row = db.prepare("SELECT answer FROM faqs WHERE LOWER(question) = LOWER(?)").get(userMessage);
    if (row) answer = row.answer;
  } catch (err) {
    console.error("❌ DB error:", err.message);
  }

  res.json({
    type: "message",
    message: answer
  });
});

// Test route
app.get('/', (req, res) => {
  res.send('Chatbot is running.');
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
