const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');

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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    expires_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clicks_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    referrer TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Migration: ensure columns exist for older databases
  try { db.run("ALTER TABLE urls ADD COLUMN updated_at TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE urls ADD COLUMN expires_at TEXT"); } catch (e) {}

  saveDb();
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

app.enable('trust proxy');
app.use(express.json());

// Serve index.html with dynamic canonical/OG URLs based on the actual host
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('html').send(indexHtml.replace(/https:\/\/url-shortener-production-f970\.up\.railway\.app/g, base));
});

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

app.get('/api/qr/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const stmt = db.prepare('SELECT code FROM urls WHERE code = ?');
    stmt.bind([code]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Link not found' });
    }
    stmt.free();

    const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
    const qrBuffer = await QRCode.toBuffer(shortUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#e6edf3', light: '#0d1117' }
    });

    res.type('image/png');
    return res.send(qrBuffer);
  } catch (err) {
    console.error('Error generating QR code:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/:code', (req, res) => {
  try {
    const { code } = req.params;

    // Skip API routes that might be caught as codes
    if (code === 'api') return res.status(404).json({ error: 'Not found' });

    const stmt = db.prepare('SELECT url, clicks, expires_at FROM urls WHERE code = ?');
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

    // Check expiration
    if (row.expires_at) {
      const expiresAt = new Date(row.expires_at + (row.expires_at.includes('T') ? '' : 'T23:59:59'));
      if (expiresAt < new Date()) {
        const wantsJson = req.accepts(['json', 'html']) === 'json';
        if (wantsJson) {
          return res.status(410).json({ error: 'This link has expired' });
        }
        return res.status(410).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Link Expired — URL Shortener</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}h1{font-size:4rem;margin:0;color:#8b949e}p{margin:8px 0 24px;color:#8b949e}a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>⏰</h1><p>This link has expired.</p><p><a href="/">Create a short link →</a></p></body></html>`);
      }
    }

    db.run('UPDATE urls SET clicks = clicks + 1 WHERE code = ?', [code]);
    db.run('INSERT INTO clicks_log (code, referrer, user_agent) VALUES (?, ?, ?)', [
      code,
      (req.get('Referer') || '').slice(0, 500),
      (req.get('User-Agent') || '').slice(0, 300)
    ]);
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

    const stmt = db.prepare('SELECT url, clicks, created_at, expires_at FROM urls WHERE code = ?');
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
      created_at: row.created_at,
      expires_at: row.expires_at || null
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

app.get('/api/stats/detailed/:code', (req, res) => {
  try {
    const { code } = req.params;

    // Verify link exists
    const exists = db.prepare('SELECT code, url, clicks FROM urls WHERE code = ?');
    exists.bind([code]);
    if (!exists.step()) {
      exists.free();
      return res.status(404).json({ error: 'Link not found' });
    }
    const link = exists.getAsObject();
    exists.free();

    // Timeline: clicks per day (last 30 days)
    const timelineStmt = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM clicks_log WHERE code = ?
      AND created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    timelineStmt.bind([code]);
    const timeline = [];
    while (timelineStmt.step()) {
      const row = timelineStmt.getAsObject();
      timeline.push({ date: row.date, count: row.count });
    }
    timelineStmt.free();

    // Referrers
    const refStmt = db.prepare(`
      SELECT
        CASE
          WHEN referrer = '' THEN 'direct'
          WHEN referrer LIKE '%google.%' THEN 'Google'
          WHEN referrer LIKE '%facebook.%' OR referrer LIKE '%fb.%' THEN 'Facebook'
          WHEN referrer LIKE '%twitter.%' OR referrer LIKE '%x.%' THEN 'Twitter/X'
          WHEN referrer LIKE '%instagram.%' THEN 'Instagram'
          WHEN referrer LIKE '%linkedin.%' THEN 'LinkedIn'
          WHEN referrer LIKE '%youtube.%' THEN 'YouTube'
          WHEN referrer LIKE '%github.%' THEN 'GitHub'
          WHEN referrer LIKE '%reddit.%' THEN 'Reddit'
          ELSE 'other'
        END as source,
        COUNT(*) as count
      FROM clicks_log WHERE code = ?
      GROUP BY source
      ORDER BY count DESC
    `);
    refStmt.bind([code]);
    const referrers = [];
    while (refStmt.step()) {
      const row = refStmt.getAsObject();
      referrers.push({ source: row.source, count: row.count });
    }
    refStmt.free();

    // Devices (simple browser detection from user_agent)
    const deviceStmt = db.prepare(`
      SELECT
        CASE
          WHEN user_agent LIKE '%Mobile%' OR user_agent LIKE '%Android%' THEN 'mobile'
          WHEN user_agent LIKE '%iPad%' THEN 'tablet'
          ELSE 'desktop'
        END as device,
        COUNT(*) as count
      FROM clicks_log WHERE code = ?
      GROUP BY device
      ORDER BY count DESC
    `);
    deviceStmt.bind([code]);
    const devices = [];
    while (deviceStmt.step()) {
      const row = deviceStmt.getAsObject();
      devices.push({ device: row.device, count: row.count });
    }
    deviceStmt.free();

    // Browsers (simple detection)
    const browserStmt = db.prepare(`
      SELECT
        CASE
          WHEN user_agent LIKE '%Chrome%' AND user_agent NOT LIKE '%Edg%' THEN 'Chrome'
          WHEN user_agent LIKE '%Edg%' THEN 'Edge'
          WHEN user_agent LIKE '%Firefox%' THEN 'Firefox'
          WHEN user_agent LIKE '%Safari%' AND user_agent NOT LIKE '%Chrome%' THEN 'Safari'
          WHEN user_agent LIKE '%OPR%' OR user_agent LIKE '%Opera%' THEN 'Opera'
          ELSE 'other'
        END as browser,
        COUNT(*) as count
      FROM clicks_log WHERE code = ?
      GROUP BY browser
      ORDER BY count DESC
    `);
    browserStmt.bind([code]);
    const browsers = [];
    while (browserStmt.step()) {
      const row = browserStmt.getAsObject();
      browsers.push({ browser: row.browser, count: row.count });
    }
    browserStmt.free();

    return res.json({
      url: link.url,
      total_clicks: link.clicks || 0,
      timeline,
      referrers,
      devices,
      browsers
    });
  } catch (err) {
    console.error('Error fetching detailed stats:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/links', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.q || '').trim();

    let whereClause = '';
    let params = [];
    if (search) {
      whereClause = 'WHERE url LIKE ? OR code LIKE ?';
      const pattern = '%' + search + '%';
      params = [pattern, pattern];
    }

    // Count total matching
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM urls ' + whereClause);
    countStmt.bind(params);
    countStmt.step();
    const total = countStmt.getAsObject().total;
    countStmt.free();

    const stmt = db.prepare('SELECT code, url, clicks, created_at, expires_at FROM urls ' + whereClause + ' ORDER BY created_at DESC LIMIT ? OFFSET ?');
    stmt.bind([...params, limit, offset]);
    const links = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      links.push({
        code: row.code,
        url: row.url,
        clicks: row.clicks,
        created_at: row.created_at,
        expires_at: row.expires_at
      });
    }
    stmt.free();

    return res.json({
      links,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error fetching links:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/links/:code', (req, res) => {
  try {
    const { code } = req.params;

    const stmt = db.prepare('SELECT code FROM urls WHERE code = ?');
    stmt.bind([code]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Link not found' });
    }
    stmt.free();

    db.run('DELETE FROM urls WHERE code = ?', [code]);
    saveDb();
    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting link:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/links/:code', (req, res) => {
  try {
    const { code } = req.params;
    const { url, expires_at } = req.body;

    const stmt = db.prepare('SELECT code FROM urls WHERE code = ?');
    stmt.bind([code]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Link not found' });
    }
    stmt.free();

    if (url !== undefined) {
      if (typeof url !== 'string' || url.trim().length === 0) {
        return res.status(400).json({ error: 'URL is required' });
      }
      const trimmed = url.trim();
      let parsed;
      try {
        parsed = new URL(trimmed);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only http and https URLs are allowed' });
      }
      db.run('UPDATE urls SET url = ?, updated_at = datetime(\'now\') WHERE code = ?', [trimmed, code]);
    }

    if (expires_at !== undefined) {
      if (expires_at !== null) {
        const d = new Date(expires_at);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: 'Invalid expiration date' });
        }
      }
      db.run('UPDATE urls SET expires_at = ?, updated_at = datetime(\'now\') WHERE code = ?', [expires_at, code]);
    }

    saveDb();
    return res.json({ success: true, code });
  } catch (err) {
    console.error('Error updating link:', err.message);
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
