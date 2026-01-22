const http = require('http');

const sessionId = 'conv_2_%2B19546824812_1768598936933';
const url = `http://localhost:3001/api/test-monitor/production/sessions/${sessionId}`;

http.get(url, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const json = JSON.parse(data);
    const obs = json.data?.observations || [];
    console.log('Total observations in API response:', obs.length);
    
    const schedObs = obs.find(o => o.name && o.name.includes('schedule'));
    if (schedObs) {
      console.log('\nFound schedule observation:');
      console.log('Name:', schedObs.name);
      console.log('Has output field:', Boolean(schedObs.output));
      if (schedObs.output) {
        const outStr = typeof schedObs.output === 'string' ? schedObs.output : JSON.stringify(schedObs.output);
        console.log('Output has _debug_error:', outStr.includes('_debug_error'));
        console.log('Output snippet:', outStr.substring(0, 300));
      }
    } else {
      console.log('\nNo schedule observation found');
      console.log('Obs names:', obs.map(o => o.name));
    }
  });
}).on('error', e => console.error('Error:', e.message));
