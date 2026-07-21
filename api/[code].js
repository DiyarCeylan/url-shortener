const { addClick } = require('../kv');

module.exports = async function handler(req, res) {
  const { code } = req.query;

  if (code === 'api') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const link = await addClick(
      code,
      req.headers.referer || '',
      req.headers['user-agent'] || ''
    );

    if (!link) {
      return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Link Not Found</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}h1{font-size:4rem;margin:0;color:#8b949e}p{margin:8px 0 24px;color:#8b949e}a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>404</h1><p>This link doesn't exist or has been removed.</p><p><a href="/">Create a short link →</a></p></body></html>`);
    }

    if (link.expires_at) {
      const expiresAt = new Date(link.expires_at + (link.expires_at.includes('T') ? '' : 'T23:59:59'));
      if (expiresAt < new Date()) {
        return res.status(410).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Link Expired</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}h1{font-size:4rem;margin:0;color:#8b949e}p{margin:8px 0 24px;color:#8b949e}a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>⏰</h1><p>This link has expired.</p><p><a href="/">Create a short link →</a></p></body></html>`);
      }
    }

    return res.redirect(301, link.url);
  } catch (err) {
    console.error('Error redirecting:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
