const { getAllLinks } = require('./kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.q || '').trim();

    const data = await getAllLinks({ page, limit, search });
    return res.json(data);
  } catch (err) {
    console.error('Error fetching links:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
