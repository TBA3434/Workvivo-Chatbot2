const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;

console.log("🟡 Starting chatbot server...");

// Try to connect to SQLite DB
let db;
try {
  const dbPath = path.join(__dirname, 'db', 'faq.db');
  console.log("📁 DB path:", dbPath);
  db = new Database(dbPath);
  console.log("✅ Connected to SQLite DB");

  // Log all rows in the faqs table
  try {
    const rows = db.prepare("SELECT question, answer FROM faqs").all();
    console.log("📋 FAQ DB Contents:");
    rows.forEach(row => {
      console.log(`Q: ${row.question} → A: ${row.answer}`);
    });
  } catch (queryErr) {
    console.error("⚠️ Failed to query FAQ DB:", queryErr.message);
  }

} catch (err) {
  console.error("❌ Failed to connect to DB:", err.message);
  process.exit(1);
}

app.use(express.json());

// Chat endpoint
app.post('/chat', (req, res) => {
  const userMessage = req.body.message?.toLowerCase();

  if (!userMessage) {
    return res.status(400).json({ error: 'Missing message in request' });
  }

  let response = "Sorry, I don't know how to respond to that.";

  try {
    const row = db.prepare("SELECT answer FROM faqs WHERE LOWER(question) = ?").get(userMessage);
    if (row) response = row.answer;
  } catch (err) {
    console.error("❌ DB error:", err.message);
  }

  res.json({ response });
});

// Test route
app.get('/', (req, res) => {
  res.send('Chatbot is running.');
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
