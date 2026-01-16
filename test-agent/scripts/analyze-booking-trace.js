const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');
const db = new Database(DB_PATH, { readonly: true });
// Use Production Langfuse (config 1)
const config = db.prepare('SELECT * FROM langfuse_configs WHERE id = 1').get();
db.close();

const traceId = process.argv[2] || 'd2202490-868e-40cb-b6f9-2d489fed0b13';
const auth = Buffer.from(config.public_key + ':' + config.secret_key).toString('base64');

console.log('='.repeat(80));
console.log('TRACE ANALYSIS: ' + traceId);
console.log('='.repeat(80));

fetchObservations(traceId, auth);

function fetchObservations(traceId, auth) {
    const options = {
        hostname: 'langfuse-6x3cj-u15194.vm.elestio.app',
        path: '/api/public/observations?traceId=' + traceId + '&limit=100',
        method: 'GET',
        headers: {
            'Authorization': 'Basic ' + auth
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.log('Error:', res.statusCode, data);
                return;
            }
            const result = JSON.parse(data);
            analyzeObservations(result.data);
        });
    });
    req.on('error', e => console.log('Request error:', e.message));
    req.end();
}

function analyzeObservations(observations) {
    // Sort by startTime
    observations.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    console.log('\nTotal observations:', observations.length);

    // Find the booking-related sequence (after slots call)
    let slotsFound = false;
    let bookingSequence = [];

    console.log('\n' + '='.repeat(80));
    console.log('BOOKING SEQUENCE ANALYSIS (after slots call)');
    console.log('='.repeat(80) + '\n');

    for (const obs of observations) {
        // Look for slots call
        if (obs.name && obs.name.includes('schedule_appointment_ortho')) {
            const input = typeof obs.input === 'string' ? JSON.parse(obs.input || '{}') : obs.input;
            if (input?.action === 'slots' || (obs.input && JSON.stringify(obs.input).includes('slots'))) {
                slotsFound = true;
                console.log('>>> SLOTS CALL FOUND <<<');
                console.log('Time:', obs.startTime);
                console.log('Input:', JSON.stringify(input).substring(0, 200));
                if (obs.output) {
                    const output = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output);
                    // Check if llm_guidance is present
                    if (output.includes('BOOKING_SEQUENCE_MANDATORY')) {
                        console.log('✓ BOOKING_SEQUENCE_MANDATORY guidance present in response');
                    }
                    // Extract slot count
                    const match = output.match(/"count":(\d+)/);
                    if (match) console.log('Slots returned:', match[1]);
                }
                console.log('\n');
            }
        }

        // After slots, track all tool calls
        if (slotsFound) {
            bookingSequence.push(obs);
        }
    }

    console.log('='.repeat(80));
    console.log('TOOL CALLS AFTER USER CONFIRMED SLOT');
    console.log('='.repeat(80) + '\n');

    // Find chord_ortho_patient and book_child calls
    let patientCreateCalls = [];
    let bookChildCalls = [];
    let generations = [];

    for (const obs of bookingSequence) {
        if (obs.name && obs.name.includes('chord_ortho_patient')) {
            console.log('--- chord_ortho_patient CALL ---');
            console.log('Time:', obs.startTime);
            console.log('ID:', obs.id);

            let input = obs.input;
            if (typeof input === 'string') {
                try { input = JSON.parse(input); } catch(e) {}
            }
            console.log('Input:', JSON.stringify(input, null, 2).substring(0, 500));

            let output = obs.output;
            if (typeof output === 'string') {
                try { output = JSON.parse(output); } catch(e) {}
            }
            console.log('Output:', JSON.stringify(output, null, 2).substring(0, 1000));

            // Check for patientGUID in output
            const outputStr = JSON.stringify(output);
            if (outputStr.includes('patientGUID') || outputStr.includes('PatientGUID')) {
                const guidMatch = outputStr.match(/[pP]atient[gG][uU][iI][dD].*?([a-f0-9-]{36})/i);
                if (guidMatch) {
                    console.log('*** PATIENT GUID FOUND:', guidMatch[1]);
                }
            }

            if (obs.statusMessage) console.log('Status:', obs.statusMessage);
            if (obs.level === 'ERROR') console.log('ERROR LEVEL OBSERVATION');

            patientCreateCalls.push(obs);
            console.log('\n');
        }

        if (obs.name && obs.name.includes('schedule_appointment_ortho')) {
            let input = obs.input;
            if (typeof input === 'string') {
                try { input = JSON.parse(input); } catch(e) {}
            }

            if (input?.action === 'book_child' || (obs.input && JSON.stringify(obs.input).includes('book_child'))) {
                console.log('--- book_child CALL ---');
                console.log('Time:', obs.startTime);
                console.log('ID:', obs.id);
                console.log('Input:', JSON.stringify(input, null, 2).substring(0, 800));

                let output = obs.output;
                console.log('Output:', JSON.stringify(output, null, 2).substring(0, 500));

                bookChildCalls.push(obs);
                console.log('\n');
            }
        }

        // Track generations (LLM responses)
        if (obs.type === 'GENERATION') {
            generations.push(obs);
        }
    }

    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log('chord_ortho_patient calls:', patientCreateCalls.length);
    console.log('book_child calls:', bookChildCalls.length);
    console.log('Generations after slots:', generations.length);

    if (patientCreateCalls.length > 0 && bookChildCalls.length === 0) {
        console.log('\n⚠️  ISSUE: Patient create was called but book_child was NOT called!');
        console.log('The agent created/attempted to create patient but never booked.');
    }

    if (bookChildCalls.length > 0) {
        const firstBookChild = bookChildCalls[0];
        const input = typeof firstBookChild.input === 'string' ?
            JSON.parse(firstBookChild.input || '{}') : firstBookChild.input;
        if (!input.patientGUID || input.patientGUID === '') {
            console.log('\n⚠️  ISSUE: book_child was called with EMPTY patientGUID!');
        }
    }

    // Check last generation to see what agent decided
    if (generations.length > 0) {
        const lastGen = generations[generations.length - 1];
        console.log('\n--- LAST GENERATION (agent decision) ---');
        if (lastGen.output) {
            const output = typeof lastGen.output === 'string' ? lastGen.output : JSON.stringify(lastGen.output);
            console.log('Output:', output.substring(0, 500));
        }
    }
}
