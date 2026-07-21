const { getLink, deleteLink, updateLink } = require('../kv');

module.exports = async function handler(req, res) {
  const { code } = req.query;

  if (req.method === 'DELETE') {
    try {
      const link = await getLink(code);
      if (!link) {
        return res.status(404).json({ error: 'Link not found' });
      }
      await deleteLink(code);
      return res.json({ success: true });
    } catch (err) {
      console.error('Error deleting link:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const link = await getLink(code);
      if (!link) {
        return res.status(404).json({ error: 'Link not found' });
      }

      const { url, expires_at } = req.body;

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
        link.url = trimmed;
      }

      if (expires_at !== undefined) {
        if (expires_at !== null) {
          const d = new Date(expires_at);
          if (isNaN(d.getTime())) {
            return res.status(400).json({ error: 'Invalid expiration date' });
          }
        }
        link.expires_at = expires_at;
      }

      link.updated_at = new Date().toISOString();
      await updateLink(code, link);
      return res.json({ success: true, code });
    } catch (err) {
      console.error('Error updating link:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
