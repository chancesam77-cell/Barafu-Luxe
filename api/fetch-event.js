// Fetches a single public AllEvents.in event page and extracts its
// structured event data (schema.org JSON-LD, which AllEvents already embeds
// in every event page for search engines). This only ever fetches ONE
// specific event page that admin has chosen and pasted a link to — the
// same as a person opening that page in a browser — not a bulk scrape of
// AllEvents' listings or database. Admin still reviews and edits every
// field before anything is actually posted to the app.

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  try {
    const url = req.query.url;
    if (!url || !/^https:\/\/(www\.)?allevents\.in\//.test(url)) {
      return res.status(400).json({ error: 'Please provide a valid allevents.in event URL' });
    }

    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BarafuLuxeBot/1.0)' }
    });
    if (!pageRes.ok) {
      return res.status(502).json({ error: 'Could not load that page (status ' + pageRes.status + ')' });
    }
    const html = await pageRes.text();

    // Extract every <script type="application/ld+json"> block and find the
    // one that's actually an Event (a page can carry other JSON-LD too,
    // e.g. breadcrumbs or organization data).
    const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    let eventData = null;
    for (const block of blocks) {
      try {
        let parsed = JSON.parse(block[1].trim());
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        const found = candidates.find(c => c['@type'] === 'Event');
        if (found) { eventData = found; break; }
      } catch (e) { /* skip malformed block, try the next one */ }
    }

    if (!eventData) {
      return res.status(422).json({ error: 'Could not find event data on that page — it may not be a valid AllEvents event link' });
    }

    // Extract date/time directly from the ISO string rather than round-
    // tripping through new Date()/.toISOString() — that silently converts
    // to UTC, which would show a wrong local time (e.g. a stated 9:00am
    // EAT start becomes 6:00am after the round-trip). Since AllEvents
    // states times in the event's own local timezone already, reading the
    // string directly preserves exactly what the page actually says.
    const dateMatch = (eventData.startDate || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    const venue = (eventData.location && (eventData.location.name || (eventData.location.address && eventData.location.address.streetAddress))) || '';

    let price = '';
    if (eventData.offers) {
      const offer = Array.isArray(eventData.offers) ? eventData.offers[0] : eventData.offers;
      if (offer) {
        const amount = offer.lowPrice || offer.price || '0';
        price = (Number(amount) === 0) ? 'Free' : (amount + ' ' + (offer.priceCurrency || ''));
      }
    }

    res.status(200).json({
      ok: true,
      name: eventData.name || '',
      date: dateMatch ? dateMatch[1] : '',
      time: dateMatch ? dateMatch[2] : '',
      venue: venue,
      price: price.trim(),
      description: (eventData.description || '').slice(0, 400),
      image: eventData.image || '',
      sourceUrl: url
    });
  } catch (err) {
    console.log('fetch-event error:', err);
    res.status(500).json({ error: 'Something went wrong reading that page' });
  }
};
