module.exports = function handler(req, res) {
  const host = req.headers.host || 's.whetkit.me';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: ${protocol}://${host}/sitemap.xml
`);
};
