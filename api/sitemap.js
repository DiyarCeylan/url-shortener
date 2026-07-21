module.exports = function handler(req, res) {
  const host = req.headers.host || 's.whetkit.me';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${protocol}://${host}/</loc><priority>1.0</priority></url>
</urlset>
`);
};
