const express = require('express');
const path = require('path');
const { Redis } = require('@upstash/redis');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

app.use(express.static(path.join(__dirname, 'public')));

function generateShortCode(length = 7) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function categorizeReferrer(ref) {
  if (!ref) return 'direct';
  if (ref.includes('google.')) return 'Google';
  if (ref.includes('facebook.') || ref.includes('fb.')) return 'Facebook';
  if (ref.includes('twitter.') || ref.includes('x.')) return 'Twitter/X';
  if (ref.includes('instagram.')) return 'Instagram';
  if (ref.includes('linkedin.')) return 'LinkedIn';
  if (ref.includes('youtube.')) return 'YouTube';
  if (ref.includes('github.')) return 'GitHub';
  if (ref.includes('reddit.')) return 'Reddit';
  return 'other';
}

function categorizeDevice(ua) {
  if (!ua) return 'desktop';
  if (ua.includes('Mobile') || ua.includes('Android')) return 'mobile';
  if (ua.includes('iPad')) return 'tablet';
  return 'desktop';
}

function categorizeBrowser(ua) {
  if (!ua) return 'other';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  return 'other';
}

app.post('/api/shorten', async (req, res) => {
  try {
    const r = getRedis();
    const { url: longUrl, code: customCode } = req.body || {};
    if (!longUrl || typeof longUrl !== 'string' || longUrl.trim().length === 0) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const trimmedUrl = longUrl.trim();
    let parsed;
    try { parsed = new URL(trimmedUrl); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http and https URLs are allowed' });
    }

    let code;
    if (customCode && typeof customCode === 'string') {
      const slug = customCode.trim();
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(slug)) {
        return res.status(400).json({ error: 'Custom code must be 3-32 characters (letters, numbers, -, _)' });
      }
      const existing = await r.get('link:' + slug);
      if (existing) return res.status(409).json({ error: 'This custom code is already taken' });
      code = slug;
    } else {
      code = generateShortCode();
      let tries = 0;
      while (await r.get('link:' + code) && tries < 10) {
        code = generateShortCode();
        tries++;
      }
    }

    const linkData = {
      url: trimmedUrl,
      clicks: 0,
      created_at: new Date().toISOString(),
      updated_at: null,
      expires_at: req.body.expires_at || null,
    };

    await r.set('link:' + code, linkData);
    await r.zadd('links:idx', { score: Date.now(), member: code });

    const host = req.headers.host || 's.whetkit.me';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return res.status(201).json({ shortUrl: proto + '://' + host + '/' + code, code });
  } catch (err) {
    console.error('Shorten error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const r = getRedis();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.q || '').trim();

    const allCodes = await r.zrange('links:idx', 0, -1);
    let links = [];
    for (const code of allCodes) {
      const link = await r.get('link:' + code);
      if (link) links.push({ code, ...link });
    }

    if (search) {
      const q = search.toLowerCase();
      links = links.filter(l => l.url.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
    }

    links.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = links.length;
    const start = (page - 1) * limit;
    const paged = links.slice(start, start + limit);

    return res.json({ links: paged, total, page, limit, total_pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Links error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats/summary', async (req, res) => {
  try {
    const r = getRedis();
    const allCodes = await r.zrange('links:idx', 0, -1);
    let total_links = allCodes.length;
    let total_clicks = 0;
    for (const code of allCodes) {
      const link = await r.get('link:' + code);
      if (link) total_clicks += (link.clicks || 0);
    }
    return res.json({ total_links, total_clicks });
  } catch (err) {
    console.error('Stats summary error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats/detailed/:code', async (req, res) => {
  try {
    const r = getRedis();
    const code = req.params.code;
    const link = await r.get('link:' + code);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const raw = await r.lrange('clicks:' + code, 0, -1);
    const clicks = raw.map(c => typeof c === 'string' ? JSON.parse(c) : c);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const timeline = {};
    const referrerCounts = {};
    const deviceCounts = {};
    const browserCounts = {};

    for (const click of clicks) {
      const clickDate = new Date(click.created_at);
      if (clickDate >= thirtyDaysAgo) {
        const dateKey = clickDate.toISOString().split('T')[0];
        timeline[dateKey] = (timeline[dateKey] || 0) + 1;
      }
      const ref = categorizeReferrer(click.referrer);
      referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
      const device = categorizeDevice(click.user_agent);
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
      const browser = categorizeBrowser(click.user_agent);
      browserCounts[browser] = (browserCounts[browser] || 0) + 1;
    }

    return res.json({
      url: link.url,
      total_clicks: link.clicks || 0,
      timeline: Object.entries(timeline).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
      referrers: Object.entries(referrerCounts).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      devices: Object.entries(deviceCounts).map(([device, count]) => ({ device, count })).sort((a, b) => b.count - a.count),
      browsers: Object.entries(browserCounts).map(([browser, count]) => ({ browser, count })).sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    console.error('Stats detailed error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/links/:code', async (req, res) => {
  try {
    const r = getRedis();
    const code = req.params.code;
    const link = await r.get('link:' + code);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    await r.del('link:' + code);
    await r.zrem('links:idx', code);
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/links/:code', async (req, res) => {
  try {
    const r = getRedis();
    const code = req.params.code;
    const link = await r.get('link:' + code);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const { url: newUrl, expires_at } = req.body || {};
    if (newUrl !== undefined) {
      if (typeof newUrl !== 'string' || newUrl.trim().length === 0) {
        return res.status(400).json({ error: 'URL is required' });
      }
      let parsed;
      try { parsed = new URL(newUrl.trim()); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only http and https URLs are allowed' });
      }
      link.url = newUrl.trim();
    }
    if (expires_at !== undefined) {
      link.expires_at = expires_at;
    }
    link.updated_at = new Date().toISOString();
    await r.set('link:' + code, link);
    return res.json({ success: true, code });
  } catch (err) {
    console.error('Patch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/qr/:code', async (req, res) => {
  try {
    const r = getRedis();
    const code = req.params.code;
    const link = await r.get('link:' + code);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const host = req.headers.host || 's.whetkit.me';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const shortUrl = proto + '://' + host + '/' + code;

    const qrBuffer = await QRCode.toBuffer(shortUrl, {
      width: 400, margin: 2,
      color: { dark: '#e6edf3', light: '#0d1117' },
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.send(qrBuffer);
  } catch (err) {
    console.error('QR error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy - WhetKit URL Shortener</title><meta name="robots" content="noindex"><style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;justify-content:center;padding:40px 20px}div{max-width:700px}h1{color:#58a6ff;margin-bottom:20px}p{line-height:1.7;color:#8b949e;margin-bottom:12px}a{color:#58a6ff}</style></head><body><div><h1>Privacy Policy</h1><p><strong>WhetKit URL Shortener</strong> is a privacy-friendly tool. Here is how we handle data:</p><p>All shortened URLs and click statistics are stored in an encrypted database. We do not sell, share, or monetize your data in any way.</p><p><strong>Click Tracking:</strong> When someone clicks a short link, we record the referrer, user agent (browser/device type), and timestamp. This data is only visible to the link creator.</p><p><strong>No Cookies:</strong> This service does not use cookies or any tracking technologies.</p><p><strong>No Accounts:</strong> We do not require registration. There are no user accounts.</p><p><strong>Link Expiration:</strong> You can set an expiration date on your links. Expired links stop working and return a 410 status.</p><p><strong>Data Deletion:</strong> You can delete your links at any time from the dashboard. Deleted data is permanently removed.</p><p>If you have questions, contact us at <a href="https://github.com/DiyarCeylan/url-shortener">GitHub</a>.</p></div></body></html>');
});

app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /privacy\nSitemap: https://s.whetkit.me/sitemap.xml');
});

app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://s.whetkit.me/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url><url><loc>https://s.whetkit.me/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url></urlset>');
});

app.get('/:code', async (req, res) => {
  const code = req.params.code;
  const skip = ['api', 'favicon.svg', 'google4505ca1a3a4868b3.html', 'privacy', 'robots.txt', 'sitemap.xml'];
  if (skip.includes(code)) return res.status(404).json({ error: 'Not found' });

  try {
    const r = getRedis();
    const link = await r.get('link:' + code);
    if (!link) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(404).send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link Not Found</title><style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#58a6ff}</style></head><body><div><h1>404</h1><p>This link doesn\'t exist.</p><a href="/">Create a short link</a></div></body></html>');
    }

    if (link.expires_at) {
      const expiresAt = new Date(link.expires_at + (link.expires_at.includes('T') ? '' : 'T23:59:59'));
      if (expiresAt < new Date()) {
        res.setHeader('Content-Type', 'text/html');
        return res.status(410).send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link Expired</title><style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#58a6ff}</style></head><body><div><h1>This link has expired.</h1><a href="/">Create a short link</a></div></body></html>');
      }
    }

    link.clicks = (link.clicks || 0) + 1;
    await r.set('link:' + code, link);

    const clickData = {
      code,
      referrer: (req.headers.referer || '').slice(0, 500),
      user_agent: (req.headers['user-agent'] || '').slice(0, 300),
      created_at: new Date().toISOString(),
    };
    await r.lpush('clicks:' + code, JSON.stringify(clickData));
    await r.ltrim('clicks:' + code, 0, 9999);

    return res.redirect(301, link.url);
  } catch (err) {
    console.error('Redirect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;
