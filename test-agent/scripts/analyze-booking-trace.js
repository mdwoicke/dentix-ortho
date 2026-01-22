const Database = require('better-sqlite3');
const fetch = require('node-fetch');

const traceId = process.argv[2] || 'ad798cd3-1ad8-449d-98a7-7191ee676f6d';
const db = new Database('./data/test-results.db');

async function analyze() {
    const config = db.prepare('SELECT * FROM langfuse_configs WHERE id = 1').get();
    const auth = Buffer.from(config.public_key + ':' + config.secret_key).toString('base64');

    const obsRes = await fetch(config.host + '/api/public/observations?traceId=' + traceId + '&limit=100', {
        headers: { 'Authorization': 'Basic ' + auth }
    });

    const obsData = await obsRes.json();
    const observations = obsData.data || [];
    console.log('Observations:', observations.length);

    // Sort by time
    const sorted = observations.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    // Show all observations
    console.log('\n=== All Observations ===');
    for (const obs of sorted) {
        const hasIn = obs.input ? 'IN' : '--';
        const hasOut = obs.output ? 'OUT' : '---';
        console.log(
            (obs.startTime || '').substring(11, 23),
            '|', (obs.type || '-').padEnd(10),
            '|', (obs.name || 'unnamed').substring(0, 50).padEnd(50),
            '|', hasIn,
            '|', hasOut
        );
    }

    // Find chord_ortho_patient with output (patient create)
    console.log('\n=== Patient Create Output ===');
    const patientObs = observations.find(o => o.name && o.name.includes('chord_ortho_patient') && o.output);
    if (patientObs) {
        console.log(JSON.stringify(patientObs.output).substring(0, 1500));
    } else {
        console.log('No patient create output found - checking all chord_ortho_patient observations...');
        const allPatient = observations.filter(o => o.name && o.name.includes('chord_ortho_patient'));
        for (const p of allPatient) {
            console.log('  - input:', JSON.stringify(p.input).substring(0, 200));
            console.log('    output:', p.output ? JSON.stringify(p.output).substring(0, 300) : 'NULL');
        }
    }

    // Find schedule_appointment observations
    console.log('\n=== Schedule Appointment Observations ===');
    const scheduleObs = observations.filter(o => o.name && o.name.includes('schedule_appointment'));
    for (const s of scheduleObs) {
        console.log('\n--- ' + s.name + ' ---');
        console.log('Time:', s.startTime);
        if (s.input) {
            const inp = s.input;
            console.log('action:', inp.action);
            console.log('startTime:', inp.startTime);
            console.log('childName:', inp.childName);
            console.log('bookingAuthToken:', inp.bookingAuthToken ? 'PRESENT' : 'MISSING');
        }
        console.log('output:', s.output ? JSON.stringify(s.output).substring(0, 500) : 'NULL');
    }

    db.close();
}

analyze().catch(e => console.error('Error:', e.message));
