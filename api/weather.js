// Fetches current weather conditions for Arusha/Kilimanjaro area — relevant
// context for weather-dependent services (Helicopter, Yacht, Equestrian,
// outdoor events) rather than a general-purpose weather app feature.
// Requires OPENWEATHER_API_KEY set as a Vercel environment variable.

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  const apiKey = (process.env.OPENWEATHER_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'Weather is not configured yet (missing OPENWEATHER_API_KEY)' });
  }

  // Default to Arusha; allow lat/lon override for a specific spot (e.g. a
  // yacht departure point) if ever needed later.
  const lat = req.query.lat || '-3.3869';
  const lon = req.query.lon || '36.6822';

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const wRes = await fetch(url);
    if (!wRes.ok) {
      return res.status(502).json({ error: 'Weather service returned an error (status ' + wRes.status + ')' });
    }
    const data = await wRes.json();

    res.status(200).json({
      ok: true,
      tempC: Math.round(data.main.temp),
      feelsLikeC: Math.round(data.main.feels_like),
      condition: (data.weather && data.weather[0] && data.weather[0].main) || '',
      description: (data.weather && data.weather[0] && data.weather[0].description) || '',
      windKph: Math.round((data.wind && data.wind.speed || 0) * 3.6),
      humidity: data.main.humidity,
      location: data.name || 'Arusha'
    });
  } catch (err) {
    console.log('weather fetch error:', err);
    res.status(500).json({ error: 'Could not reach the weather service' });
  }
};
