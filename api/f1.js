const https = require('https');

var FLAGS = {
  'British':'🇬🇧','Italian':'🇮🇹','Dutch':'🇳🇱','Monegasque':'🇲🇨','Australian':'🇦🇺',
  'French':'🇫🇷','German':'🇩🇪','Spanish':'🇪🇸','Finnish':'🇫🇮','Canadian':'🇨🇦',
  'Mexican':'🇲🇽','Thai':'🇹🇭','Japanese':'🇯🇵','Danish':'🇩🇰','New Zealander':'🇳🇿',
  'Argentine':'🇦🇷','Brazilian':'🇧🇷','American':'🇺🇸','Chinese':'🇨🇳','Belgian':'🇧🇪',
  'Austrian':'🇦🇹','Swiss':'🇨🇭','Polish':'🇵🇱','Russian':'🇷🇺','Swedish':'🇸🇪',
  'Indian':'🇮🇳','Indonesian':'🇮🇩'
};

function flagFor(nat){ return FLAGS[nat] || '🏁'; }

function fetchJSON(path) {
  return new Promise(function(resolve, reject) {
    const options = {
      hostname: 'api.jolpi.ca',
      path: path,
      method: 'GET',
      headers: { 'User-Agent': 'BarafuLuxe/1.0', 'Accept': 'application/json' }
    };
    const request = https.request(options, function(apiRes) {
      let data = '';
      apiRes.on('data', function(chunk){ data += chunk; });
      apiRes.on('end', function(){
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('parse_failed: ' + data.substring(0,200))); }
      });
    });
    request.on('error', reject);
    request.setTimeout(10000, function(){ request.destroy(); reject(new Error('timeout')); });
    request.end();
  });
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if(req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type || 'all';

  try {
    const jobs = {
      standings: fetchJSON('/ergast/f1/current/driverstandings/?limit=10'),
      calendar: fetchJSON('/ergast/f1/current/races/?limit=30'),
      pos1: fetchJSON('/ergast/f1/current/results/1/?limit=30'),
      pos2: fetchJSON('/ergast/f1/current/results/2/?limit=30'),
      pos3: fetchJSON('/ergast/f1/current/results/3/?limit=30')
    };

    const keys = Object.keys(jobs);
    const settled = await Promise.all(keys.map(function(k){ return jobs[k]; }));
    const data = {};
    keys.forEach(function(k, i){ data[k] = settled[i]; });

    // ── Standings ──
    var standingsList = data.standings.MRData.StandingsTable.StandingsLists[0];
    var afterRound = standingsList ? parseInt(standingsList.round, 10) : null;
    var standings = (standingsList ? standingsList.DriverStandings : []).map(function(d){
      return {
        pos: parseInt(d.position, 10),
        driver: d.Driver.givenName + ' ' + d.Driver.familyName,
        team: d.Constructors && d.Constructors[0] ? d.Constructors[0].name : '',
        pts: parseInt(d.points, 10),
        flag: flagFor(d.Driver.nationality)
      };
    });

    // ── Full season calendar (all rounds, incl. future) ──
    var calendar = (data.calendar.MRData.RaceTable.Races || []).map(function(r){
      return {
        r: parseInt(r.round, 10),
        n: r.raceName,
        v: r.Circuit.circuitName,
        date: r.date
      };
    });

    // ── Completed race podiums, merged by round ──
    var byRound = {};
    [1,2,3].forEach(function(posFilter, idx){
      var key = ['pos1','pos2','pos3'][idx];
      var races = data[key].MRData.RaceTable.Races || [];
      races.forEach(function(r){
        var round = parseInt(r.round, 10);
        if(!byRound[round]){
          byRound[round] = { r: round, n: r.raceName, v: r.Circuit.circuitName, date: r.date };
        }
        var result = r.Results && r.Results[0];
        if(!result) return;
        var driverName = result.Driver.givenName + ' ' + result.Driver.familyName;
        if(posFilter === 1){
          byRound[round].p1 = driverName;
        } else if(posFilter === 2){
          byRound[round].p2 = driverName;
          var t = (result.Time && result.Time.time) ? result.Time.time : null;
          byRound[round].margin = t ? t.replace('+','') + 's' : null;
        } else if(posFilter === 3){
          byRound[round].p3 = driverName;
        }
      });
    });
    var results = Object.keys(byRound).map(function(k){ return byRound[k]; })
      .sort(function(a,b){ return a.r - b.r; });

    if(type === 'standings') return res.status(200).json({ standings: standings, afterRound: afterRound });
    if(type === 'calendar')  return res.status(200).json({ calendar: calendar });
    if(type === 'results')   return res.status(200).json({ results: results });

    return res.status(200).json({
      standings: standings,
      afterRound: afterRound,
      calendar: calendar,
      results: results
    });

  } catch(e) {
    return res.status(200).json({ error: 'request_failed', message: e.message });
  }
};
