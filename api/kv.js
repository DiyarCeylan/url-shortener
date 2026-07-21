const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

function generateShortCode(length = 7) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getLink(code) {
  return redis.get(`link:${code}`);
}

async function saveLink(code, data) {
  await redis.set(`link:${code}`, data);
  await redis.zadd('links:idx', { score: Date.now(), member: code });
}

async function updateLink(code, data) {
  await redis.set(`link:${code}`, data);
}

async function deleteLink(code) {
  await redis.del(`link:${code}`);
  await redis.zrem('links:idx', code);
}

async function linkExists(code) {
  const link = await redis.get(`link:${code}`);
  return link !== null;
}

async function getAllLinks({ page = 1, limit = 50, search = '' } = {}) {
  const allCodes = await redis.zrange('links:idx', 0, -1);
  
  let links = [];
  for (const code of allCodes) {
    const link = await redis.get(`link:${code}`);
    if (link) {
      links.push({ code, ...link });
    }
  }
  
  if (search) {
    const q = search.toLowerCase();
    links = links.filter(l => 
      l.url.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    );
  }
  
  links.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const total = links.length;
  const start = (page - 1) * limit;
  const paged = links.slice(start, start + limit);
  
  return {
    links: paged,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit)
  };
}

async function addClick(code, referrer, userAgent) {
  const link = await redis.get(`link:${code}`);
  if (!link) return null;
  
  link.clicks = (link.clicks || 0) + 1;
  await redis.set(`link:${code}`, link);
  
  const clickData = {
    code,
    referrer: (referrer || '').slice(0, 500),
    user_agent: (userAgent || '').slice(0, 300),
    created_at: new Date().toISOString()
  };
  
  await redis.lpush(`clicks:${code}`, JSON.stringify(clickData));
  await redis.ltrim(`clicks:${code}`, 0, 9999);
  
  return link;
}

async function getClicks(code) {
  const raw = await redis.lrange(`clicks:${code}`, 0, -1);
  return raw.map(r => typeof r === 'string' ? JSON.parse(r) : r);
}

async function getStatsSummary() {
  const allCodes = await redis.zrange('links:idx', 0, -1);
  let total_links = allCodes.length;
  let total_clicks = 0;
  
  for (const code of allCodes) {
    const link = await redis.get(`link:${code}`);
    if (link) total_clicks += (link.clicks || 0);
  }
  
  return { total_links, total_clicks };
}

async function getDetailedStats(code) {
  const link = await redis.get(`link:${code}`);
  if (!link) return null;
  
  const clicks = await getClicks(code);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const timeline = {};
  const referrerCounts = {};
  const deviceCounts = {};
  const browserCounts = {};
  
  for (const click of clicks) {
    const clickDate = new Date(click.created_at);
    
    if (clickDate >= thirtyDaysAgo) {
      const dateKey = clickDate.toISOString().split('T')[0];
      timeline[dateKey] = (timeline[dateKey] || 0) + 1;
    }
    
    const ref = categorizeReferrer(click.referrer);
    referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    
    const device = categorizeDevice(click.user_agent);
    deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    
    const browser = categorizeBrowser(click.user_agent);
    browserCounts[browser] = (browserCounts[browser] || 0) + 1;
  }
  
  const timelineArr = Object.entries(timeline)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  const referrers = Object.entries(referrerCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
  
  const devices = Object.entries(deviceCounts)
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count);
  
  const browsers = Object.entries(browserCounts)
    .map(([browser, count]) => ({ browser, count }))
    .sort((a, b) => b.count - a.count);
  
  return {
    url: link.url,
    total_clicks: link.clicks || 0,
    timeline: timelineArr,
    referrers,
    devices,
    browsers
  };
}

function categorizeReferrer(ref) {
  if (!ref) return 'direct';
  if (ref.includes('google.')) return 'Google';
  if (ref.includes('facebook.') || ref.includes('fb.')) return 'Facebook';
  if (ref.includes('twitter.') || ref.includes('x.')) return 'Twitter/X';
  if (ref.includes('instagram.')) return 'Instagram';
  if (ref.includes('linkedin.')) return 'LinkedIn';
  if (ref.includes('youtube.')) return 'YouTube';
  if (ref.includes('github.')) return 'GitHub';
  if (ref.includes('reddit.')) return 'Reddit';
  return 'other';
}

function categorizeDevice(ua) {
  if (!ua) return 'desktop';
  if (ua.includes('Mobile') || ua.includes('Android')) return 'mobile';
  if (ua.includes('iPad')) return 'tablet';
  return 'desktop';
}

function categorizeBrowser(ua) {
  if (!ua) return 'other';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  return 'other';
}

module.exports = {
  generateShortCode,
  getLink,
  saveLink,
  updateLink,
  deleteLink,
  linkExists,
  getAllLinks,
  addClick,
  getClicks,
  getStatsSummary,
  getDetailedStats
};
