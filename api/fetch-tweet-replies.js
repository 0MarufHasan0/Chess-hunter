const http = require('http');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { url } = req.query || {};
  if (!url) {
    res.status(400).json({ success: false, error: 'Missing post URL query parameter' });
    return;
  }

  const vpsUrl = `http://89.144.8.148:3005/api/fetch-tweet-replies?url=${encodeURIComponent(url)}`;

  try {
    const vpsRes = await fetch(vpsUrl);
    if (!vpsRes.ok) {
      res.status(vpsRes.status).json({ success: false, error: `VPS backend returned HTTP ${vpsRes.status}` });
      return;
    }
    const data = await vpsRes.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('Vercel serverless proxy error:', err.message);
    res.status(500).json({ success: false, error: `Proxy connection error: ${err.message}` });
  }
};
