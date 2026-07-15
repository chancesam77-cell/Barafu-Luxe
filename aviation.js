// Vercel serverless proxy for AviationStack
const https = require('https');
const http = require('http');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if(req.method === 'OPTIONS') return res.status(200).end();

  const ACCESS_KEY = '4bb243f37125db45391eb3b5400df3ca';
  const { airport, type, flight } = req.query;

  let path;
  if(flight) {
    path = `/v1/flights?access_key=${ACCESS_KEY}&flight_iata=${flight}`;
  } else if(airport) {
    const param = (type === 'dep') ? 'dep_iata' : 'arr_iata';
    path = `/v1/flights?access_key=${ACCESS_KEY}&${param}=${airport}&limit=15`;
  } else {
    return res.status(400).json({ error: 'Provide airport or flight param' });
  }

  // Use Node's built-in http module to call AviationStack (free plan = http only)
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.aviationstack.com',
      port: 80,
      path: path,
      method: 'GET'
    };

    const request = http.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.status(200).json(parsed);
        } catch(e) {
          res.status(500).json({ error: 'Parse error', raw: data.substring(0, 200) });
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });

    request.setTimeout(8000, () => {
      request.destroy();
      res.status(504).json({ error: 'Timeout' });
      resolve();
    });

    request.end();
  });
};
