const express = require('express');
const path = require('path');
const apiHandler = require('./api/index.js');

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.all('/api/*', apiHandler);
app.all('/privacy', apiHandler);
app.all('/robots.txt', apiHandler);
app.all('/sitemap.xml', apiHandler);
app.all('/:code', (req, res, next) => {
  const skip = ['api', 'favicon.svg', 'google4505ca1a3a4868b3.html', 'index.js', 'package.json', 'vercel.json', 'node_modules'];
  if (skip.includes(req.params.code)) return next();
  apiHandler(req, res);
});

module.exports = app;
