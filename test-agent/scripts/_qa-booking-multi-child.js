/**
 * QA Booking Multi-Child Test - Full conversation for 2 or 3 children
 */
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const db = new BetterSqlite3(path.join(__dirname, '../data/test-results.db'));

function random4Digits() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

const flowiseConfig = db.prepare(`SELECT url, api_key FROM flowise_configs WHERE id = 1`).get();
const FLOWISE_URL = flowiseConfig.url;
const FLOWISE_API_KEY = flowiseConfig.api_key;

// Get number of children from command line (default 2)
const NUM_CHILDREN = parseInt(process.argv[2]) || 2;

const testId = random4Digits();
const testName = 'Test' + testId;
const testPhone = '555-' + random4Digits();
const testEmail = `test${testId}@example.com`;
const sessionId = 'qa-multi-' + NUM_CHILDREN + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
const testCode = 'QA-' + testName.toUpperCase() + '-' + NUM_CHILDREN + 'KIDS';

// Generate child names
const childNames = [];
for (let i = 1; i <= NUM_CHILDREN; i++) {
    childNames.push(`Child${i}_${testId}`);
}

console.log('='.repeat(70));
console.log(`QA MULTI-CHILD BOOKING TEST (${NUM_CHILDREN} children)`);
console.log('='.repeat(70));
console.log('Parent Name:', testName + ' Parent');
console.log('Children:', childNames.join(', '));
console.log('Phone:', testPhone);
console.log('Email:', testEmail);
console.log('Session:', sessionId);
console.log('');

let turnCount = 0;
const MAX_TURNS = 50;
let childIndex = 0;  // Track which child we're currently handling

async function sendMessage(message) {
    turnCount++;
    console.log(`\n[Turn ${turnCount}] > ${message}`);

    const response = await fetch(FLOWISE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${FLOWISE_API_KEY}`
        },
        body: JSON.stringify({
            question: message,
            overrideConfig: { sessionId }
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.text || data.answer || JSON.stringify(data);

    const answerMatch = text.match(/ANSWER:\s*([\s\S]*?)(?:PAYLOAD:|$)/);
    const answer = answerMatch ? answerMatch[1].trim() : text.substring(0, 500);
    console.log(`< ${answer}`);

    await new Promise(r => setTimeout(r, 2000));
    return answer.toLowerCase();
}

async function main() {
    let lastResponse = '';
    let bookingConfirmed = false;
    let appointmentsBooked = 0;
    let transferred = false;

    try {
        // Initial greeting
        lastResponse = await sendMessage(`Hi, I'd like to schedule orthodontic consultations for my ${NUM_CHILDREN} children`);

        while (turnCount < MAX_TURNS && !bookingConfirmed && !transferred) {

            // Check for transfer
            if (lastResponse.includes('transfer') || lastResponse.includes('representative')) {
                transferred = true;
                console.log('\n⚠ TRANSFERRED TO REPRESENTATIVE');
                break;
            }

            // Check for booking completion (all children)
            if ((lastResponse.includes('scheduled') || lastResponse.includes('booked') ||
                 lastResponse.includes('confirmed your appointment') || lastResponse.includes('appointments have been')) &&
                !lastResponse.includes('confirm your appointment')) {

                // Count how many times we see child names mentioned with times
                const timeMatches = lastResponse.match(/\d{1,2}:\d{2}|a\.?m\.?|p\.?m\.?/gi) || [];
                if (timeMatches.length >= NUM_CHILDREN || lastResponse.includes('all')) {
                    bookingConfirmed = true;
                    appointmentsBooked = NUM_CHILDREN;
                    console.log(`\n✓ BOOKING COMPLETED for ${NUM_CHILDREN} children!`);
                    break;
                }
            }

            // Respond based on what's being asked
            if (lastResponse.includes('orthodontic consultation') && lastResponse.includes('?')) {
                lastResponse = await sendMessage("Yes, that's correct");
            }
            else if (lastResponse.includes('first and last name') || lastResponse.includes('who am i speaking')) {
                lastResponse = await sendMessage(`My name is ${testName} Parent`);
            }
            else if (lastResponse.includes('how many children') || lastResponse.includes('how many kids')) {
                lastResponse = await sendMessage(`${NUM_CHILDREN} children`);
            }
            else if ((lastResponse.includes("child's") || lastResponse.includes("first child") || lastResponse.includes("next child") || lastResponse.includes("second child") || lastResponse.includes("third child")) && lastResponse.includes('name')) {
                if (childIndex < NUM_CHILDREN) {
                    const childName = childNames[childIndex];
                    lastResponse = await sendMessage(`My child's name is ${childName}, spelled ${childName.split('').join(' ')}`);
                    childIndex++;
                } else {
                    lastResponse = await sendMessage("That's all the children");
                }
            }
            else if (lastResponse.includes('spell') && lastResponse.includes('child')) {
                // Spelling child name - use current child
                const idx = Math.max(0, childIndex - 1);
                const childName = childNames[idx];
                lastResponse = await sendMessage(`${childName.split('').join(' ')}`);
            }
            else if (lastResponse.includes('spell') && lastResponse.includes('name') && !lastResponse.includes('child')) {
                lastResponse = await sendMessage(`${testName} P A R E N T`);
            }
            else if (lastResponse.includes('is that correct') || lastResponse.includes('is that right')) {
                lastResponse = await sendMessage("Yes, that's correct");
            }
            else if (lastResponse.includes('date of birth') || lastResponse.includes('birthday')) {
                // Use different DOBs for different children
                const years = ['2012', '2014', '2016'];
                const year = years[Math.min(childIndex - 1, years.length - 1)] || '2014';
                lastResponse = await sendMessage(`March 15, ${year}`);
            }
            else if (lastResponse.includes('email address') || (lastResponse.includes('email') && !lastResponse.includes('phone'))) {
                lastResponse = await sendMessage(`${testEmail}`);
            }
            else if (lastResponse.includes('phone') && lastResponse.includes('best number')) {
                lastResponse = await sendMessage(`Yes, ${testPhone} is the best number`);
            }
            else if (lastResponse.includes('phone') && lastResponse.includes('number') && !lastResponse.includes('email')) {
                lastResponse = await sendMessage(`${testPhone}`);
            }
            else if (lastResponse.includes('prior') && lastResponse.includes('treatment')) {
                lastResponse = await sendMessage("No, this would be their first orthodontic consultation");
            }
            else if (lastResponse.includes('seen at') && lastResponse.includes('office')) {
                lastResponse = await sendMessage("No, they haven't been to your office before");
            }
            else if (lastResponse.includes('referral') || lastResponse.includes('how did you hear')) {
                lastResponse = await sendMessage("Google search");
            }
            else if (lastResponse.includes('insurance')) {
                lastResponse = await sendMessage("No insurance");
            }
            else if (lastResponse.includes('special needs') || lastResponse.includes('medical condition')) {
                lastResponse = await sendMessage("No special needs");
            }
            else if (lastResponse.includes('would you like the address') || lastResponse.includes('need directions')) {
                lastResponse = await sendMessage("No thanks, that's all");
                break;
            }
            else if (lastResponse.includes('does that work') || lastResponse.includes('work for you')) {
                lastResponse = await sendMessage("Yes, that works great");
            }
            else if (lastResponse.includes('available') && (lastResponse.includes('time') || lastResponse.includes('slot'))) {
                lastResponse = await sendMessage("The first available times would be great");
            }
            else if (lastResponse.includes('prefer') && (lastResponse.includes('morning') || lastResponse.includes('afternoon'))) {
                lastResponse = await sendMessage("Any time works for us");
            }
            else if (lastResponse.includes('confirm') && lastResponse.includes('appointment')) {
                lastResponse = await sendMessage("Yes, please confirm all appointments");
            }
            else if (lastResponse.includes('anything else') || lastResponse.includes('help you with')) {
                lastResponse = await sendMessage("No, that's all. Thank you!");
                break;
            }
            else {
                lastResponse = await sendMessage("Yes, please continue");
            }
        }

    } catch (e) {
        console.log('\n✗ Error:', e.message);
    }

    // Determine status
    let status = 'incomplete';
    if (bookingConfirmed) status = 'success';
    else if (transferred) status = 'transfer';

    // Add to prod_test_tracker
    console.log('\n' + '-'.repeat(70));
    console.log('Adding to prod_test_tracker...');

    try {
        const stmt = db.prepare(`
            INSERT INTO prod_test_tracker (test_code, test_type, patient_guid, appointment_guid, patient_name, appointment_time, status, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);

        const result = stmt.run(
            testCode,
            'qa_multi_child',
            null,
            null,
            childNames.join(', '),
            null,
            status,
            `Session: ${sessionId}\nChildren: ${NUM_CHILDREN}\nTurns: ${turnCount}\nBooking: ${bookingConfirmed ? 'YES' : 'NO'}`
        );

        console.log('✓ Added to prod_test_tracker (id:', result.lastInsertRowid + ')');
    } catch (e) {
        console.log('✗ Failed to add:', e.message);
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST RESULT:', status.toUpperCase());
    console.log('Children:', NUM_CHILDREN);
    console.log('Turns:', turnCount);
    console.log('Appointments Booked:', appointmentsBooked);
    console.log('='.repeat(70));

    db.close();
}

main().catch(e => {
    console.error('Test failed:', e);
    db.close();
    process.exit(1);
});
