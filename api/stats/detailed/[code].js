const { getDetailedStats } = require('../../kv');

module.exports = async function handler(req, res) {
  const { code } = req.query;

  try {
    const stats = await getDetailedStats(code);
    if (!stats) {
      return res.status(404).json({ error: 'Link not found' });
    }
    return res.json(stats);
  } catch (err) {
    console.error('Error fetching detailed stats:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
