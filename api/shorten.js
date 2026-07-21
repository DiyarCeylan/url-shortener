const { generateShortCode, saveLink, linkExists } = require('./kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      if (await linkExists(slug)) {
        return res.status(409).json({ error: 'This custom code is already taken' });
      }
      code = slug;
    } else {
      code = generateShortCode();
      while (await linkExists(code)) {
        code = generateShortCode();
      }
    }

    const linkData = {
      url: trimmedUrl,
      clicks: 0,
      created_at: new Date().toISOString(),
      updated_at: null,
      expires_at: req.body.expires_at || null
    };

    await saveLink(code, linkData);

    const host = req.headers.host || 's.whetkit.me';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const shortUrl = `${protocol}://${host}/${code}`;

    return res.status(201).json({ shortUrl, code });
  } catch (err) {
    console.error('Error creating short URL:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
