const { getStatsSummary } = require('../kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getStatsSummary();
    return res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
