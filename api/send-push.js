// api/send-push.js
// Sends a Web Push notification to a single subscriber using VAPID auth.
// Requires environment variables on Vercel:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. "mailto:you@barafuluxe.com")
// Requires "web-push" in package.json dependencies.

const webpush = require('web-push');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:concierge@barafuluxe.com';

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({ error: 'VAPID keys not configured on server' });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    var body = req.body || {};
    // Vercel sometimes delivers body as a string depending on config — normalize.
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    var subscription = body.subscription;
    var title = body.title || 'Barafu Luxe';
    var message = body.body || '';
    var url = body.url || '/';
    var tag = body.tag || undefined;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription' });
    }

    var payload = JSON.stringify({
      title: title,
      body: message,
      url: url,
      tag: tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png'
    });

    await webpush.sendNotification(subscription, payload);
    return res.status(200).json({ ok: true });

  } catch (err) {
    // A 410/404 from the push service means the subscription has expired —
    // that's expected over time (browser reinstalls, etc.), not a real error.
    var statusCode = (err && err.statusCode) || 0;
    if (statusCode === 404 || statusCode === 410) {
      return res.status(200).json({ ok: false, expired: true });
    }
    console.log('send-push error:', err && err.message);
    return res.status(200).json({ ok: false, error: err && err.message });
  }
};
