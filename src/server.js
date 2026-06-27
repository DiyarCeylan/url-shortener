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

app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Privacy Policy — URL Shortener</title><meta name="robots" content="noindex,follow"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;max-width:700px;margin:0 auto;padding:40px 20px;line-height:1.7}h1{font-size:28px;margin-bottom:8px}h2{font-size:18px;margin-top:32px;margin-bottom:8px}p{color:#8b949e}a{color:#58a6ff}</style></head><body><h1>Privacy Policy</h1><p>Last updated: June 2026</p><h2>What we collect</h2><p>We store the original URL, a randomly generated short code, and a click counter. We do not collect IP addresses, browser fingerprints, or any personal information.</p><h2>Analytics</h2><p>We use GoatCounter, a privacy-focused analytics service. GoatCounter does not use cookies and does not track individual users across sessions.</p><h2>Data deletion</h2><p>You can request deletion of any link by contacting us. Data may be retained in backups for up to 30 days.</p><h2>Contact</h2><p>Open an issue on <a href="https://github.com/DiyarCeylan/url-shortener">GitHub</a>.</p><p style="margin-top:40px"><a href="/">← Back to URL Shortener</a></p></body></html>`);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml
`);
});

app.get('/sitemap.xml', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${host}/</loc><priority>1.0</priority></url>
</urlset>
`);
});

app.post('/api/shorten', (req, res) => {
  try {
    const { url, code: customCode } = req.body;

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

    let code;
    if (customCode && typeof customCode === 'string') {
      const slug = customCode.trim();
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(slug)) {
        return res.status(400).json({ error: 'Custom code must be 3-32 characters (letters, numbers, -, _)' });
      }
      const existing = db.prepare('SELECT code FROM urls WHERE code = ?');
      existing.bind([slug]);
      if (existing.step()) {
        existing.free();
        return res.status(409).json({ error: 'This custom code is already taken' });
      }
      existing.free();
      code = slug;
    } else {
      code = generateShortCode();
    }

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

    // Skip API routes that might be caught as codes
    if (code === 'api') return res.status(404).json({ error: 'Not found' });

    const stmt = db.prepare('SELECT url, clicks FROM urls WHERE code = ?');
    stmt.bind([code]);
    if (!stmt.step()) {
      stmt.free();
      const wantsJson = req.accepts(['json', 'html']) === 'json';
      if (wantsJson) {
        return res.status(404).json({ error: 'Link not found' });
      }
      return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Link Not Found — URL Shortener</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}h1{font-size:4rem;margin:0;color:#8b949e}p{margin:8px 0 24px;color:#8b949e}a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>404</h1><p>This link doesn't exist or has been removed.</p><p><a href="/">Create a short link →</a></p></body></html>`);
    }

    const row = stmt.getAsObject();
    stmt.free();

    db.run('UPDATE urls SET clicks = clicks + 1 WHERE code = ?', [code]);
    saveDb();

    const wantsJson = req.accepts(['json', 'html']) === 'json';
    if (!wantsJson) {
      res.redirect(301, row.url);
      return res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=${row.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Redirecting...</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}p{color:#8b949e}a{color:#58a6ff}</style></head><body><p>Redirecting to <a href="${row.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${row.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}</a></p></body></html>`);
    }

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

app.get('/api/stats/summary', (req, res) => {
  try {
    const stmt = db.prepare('SELECT COUNT(*) as total_links, SUM(clicks) as total_clicks FROM urls');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return res.json({ total_links: row.total_links, total_clicks: row.total_clicks || 0 });
  } catch (err) {
    console.error('Error fetching stats summary:', err.message);
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
