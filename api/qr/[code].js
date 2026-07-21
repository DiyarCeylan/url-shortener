const QRCode = require('qrcode');
const { getLink } = require('../kv');

module.exports = async function handler(req, res) {
  const { code } = req.query;

  try {
    const link = await getLink(code);
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const host = req.headers.host || 's.whetkit.me';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const shortUrl = `${protocol}://${host}/${code}`;

    const qrBuffer = await QRCode.toBuffer(shortUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#e6edf3', light: '#0d1117' }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.send(qrBuffer);
  } catch (err) {
    console.error('Error generating QR code:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
