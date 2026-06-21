const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, '..', 'data', 'links.db');

let db;

function generateShortCode(length = 7) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const dir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  saveDb();
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

app.enable('trust proxy');
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/api/shorten', (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const trimmedUrl = url.trim();

    let parsed;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http and https URLs are allowed' });
    }

    const code = generateShortCode();

    db.run('INSERT INTO urls (code, url) VALUES (?, ?)', [code, trimmedUrl]);
    saveDb();

    const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;

    return res.status(201).json({ shortUrl, code });
  } catch (err) {
    console.error('Error creating short URL:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/:code', (req, res) => {
  try {
    const { code } = req.params;

    const stmt = db.prepare('SELECT url, clicks FROM urls WHERE code = ?');
    stmt.bind([code]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Link not found' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    db.run('UPDATE urls SET clicks = clicks + 1 WHERE code = ?', [code]);
    saveDb();

    return res.redirect(301, row.url);
  } catch (err) {
    console.error('Error redirecting:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats/:code', (req, res) => {
  try {
    const { code } = req.params;

    const stmt = db.prepare('SELECT url, clicks, created_at FROM urls WHERE code = ?');
    stmt.bind([code]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Link not found' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    return res.json({
      url: row.url,
      clicks: row.clicks,
      created_at: row.created_at
    });
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/links', (req, res) => {
  try {
    const stmt = db.prepare('SELECT code, url, clicks, created_at FROM urls ORDER BY created_at DESC');
    const links = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      links.push({
        code: row.code,
        url: row.url,
        clicks: row.clicks,
        created_at: row.created_at
      });
    }
    stmt.free();

    return res.json(links);
  } catch (err) {
    console.error('Error fetching links:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const ready = initDb();
ready.then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = { app, ready };
