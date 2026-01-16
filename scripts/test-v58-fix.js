#!/usr/bin/env node
/**
 * Unit Test: v58 Cloud9 API Date Quirk Fix
 *
 * Tests:
 * 1. Date range correction - starts 30+ days out
 * 2. Chair 8 Exams filter - filters slots correctly
 * 3. API integration - verifies real slots returned
 */

const fetch = require('node-fetch');

// ========== V58 CONFIGURATION (copy from tool) ==========
const CHAIR_8_CONFIG = {
    scheduleColumnGUID: '07687884-7e37-49aa-8028-d43b751c9034',
    scheduleViewGUID: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d',
    appointmentTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705',
    locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
    appointmentClass: 'Exams',
    defaultMinutes: 40
};

const EXAMS_MIN_DAYS_OUT = 30;
const DATE_EXPANSION_TIERS = [30, 60, 90];
const MIN_DATE_RANGE_DAYS = 30;
const MAX_FUTURE_DAYS = 120;
const SANDBOX_MIN_DATE = new Date(2026, 0, 13);

// ========== HELPER FUNCTIONS ==========
function formatDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${date.getFullYear()}`;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}

// v58 correctDateRange function
function correctDateRange(startDate, endDate, expansionDays = DATE_EXPANSION_TIERS[0]) {
    let correctedStart = startDate ? parseDate(startDate) : null;
    let correctedEnd = endDate ? parseDate(endDate) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let datesCorrected = false;

    const maxFutureDate = new Date(today);
    maxFutureDate.setDate(maxFutureDate.getDate() + MAX_FUTURE_DAYS);

    if (correctedStart && correctedStart > maxFutureDate) {
        correctedStart = null;
        datesCorrected = true;
    }
    if (correctedEnd && correctedEnd > maxFutureDate) {
        correctedEnd = null;
        datesCorrected = true;
    }

    // v58: Cloud9 API quirk - Exams slots only returned when searching 30+ days out
    const minExamsStart = new Date(today);
    minExamsStart.setDate(minExamsStart.getDate() + EXAMS_MIN_DAYS_OUT);

    if (!correctedStart || correctedStart < minExamsStart) {
        correctedStart = new Date(Math.max(minExamsStart.getTime(), SANDBOX_MIN_DATE.getTime()));
        datesCorrected = true;
    }
    if (correctedStart < SANDBOX_MIN_DATE) correctedStart = new Date(SANDBOX_MIN_DATE);

    let daysDiff = 0;
    if (correctedEnd && correctedEnd > correctedStart) {
        daysDiff = Math.ceil((correctedEnd - correctedStart) / (1000 * 60 * 60 * 24));
    }

    if (!correctedEnd || correctedEnd <= correctedStart || daysDiff < MIN_DATE_RANGE_DAYS) {
        correctedEnd = new Date(correctedStart);
        correctedEnd.setDate(correctedEnd.getDate() + expansionDays);
    }

    return { startDate: formatDate(correctedStart), endDate: formatDate(correctedEnd), expansionDays, datesCorrected };
}

// v58 filterForChair8Exams function
function filterForChair8Exams(slots) {
    if (!slots || !Array.isArray(slots)) return [];
    return slots.filter(slot => {
        const isChair8 = slot.ScheduleColumnGUID === CHAIR_8_CONFIG.scheduleColumnGUID ||
                         slot.scheduleColumnGUID === CHAIR_8_CONFIG.scheduleColumnGUID;
        const isExams = slot.AppointmentClassDescription === CHAIR_8_CONFIG.appointmentClass;
        return isChair8 && isExams;
    });
}

// ========== TEST CASES ==========
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

console.log('=== V58 UNIT TESTS ===\n');

// Test 1: Date range starts 30+ days from today
test('Date range starts 30+ days from today (no input)', () => {
    const result = correctDateRange(null, null, 30);
    const startDate = parseDate(result.startDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const minStart = new Date(today);
    minStart.setDate(minStart.getDate() + EXAMS_MIN_DAYS_OUT);

    assert(startDate >= minStart, `Start ${result.startDate} should be >= ${formatDate(minStart)}`);
});

// Test 2: Date range corrects "tomorrow" to 30+ days out
test('Corrects near-future date to 30+ days out', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = correctDateRange(formatDate(tomorrow), null, 30);
    const startDate = parseDate(result.startDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const minStart = new Date(today);
    minStart.setDate(minStart.getDate() + EXAMS_MIN_DAYS_OUT);

    assert(startDate >= minStart, `Start ${result.startDate} should be >= ${formatDate(minStart)}`);
    assert(result.datesCorrected === true, 'Should flag dates as corrected');
});

// Test 3: Chair 8 filter works correctly
test('Chair 8 Exams filter keeps only matching slots', () => {
    const testSlots = [
        { scheduleColumnGUID: CHAIR_8_CONFIG.scheduleColumnGUID, AppointmentClassDescription: 'Exams', startTime: '02/15/2026 09:00 AM' },
        { scheduleColumnGUID: CHAIR_8_CONFIG.scheduleColumnGUID, AppointmentClassDescription: 'Adjustments', startTime: '02/15/2026 09:20 AM' },
        { scheduleColumnGUID: 'other-guid', AppointmentClassDescription: 'Exams', startTime: '02/15/2026 09:40 AM' },
        { scheduleColumnGUID: 'other-guid', AppointmentClassDescription: 'Adjustments', startTime: '02/15/2026 10:00 AM' },
    ];

    const filtered = filterForChair8Exams(testSlots);
    assert(filtered.length === 1, `Expected 1 slot, got ${filtered.length}`);
    assert(filtered[0].startTime === '02/15/2026 09:00 AM', 'Wrong slot kept');
});

// Test 4: Chair 8 filter handles empty input
test('Chair 8 filter handles empty/null input', () => {
    assert(filterForChair8Exams(null).length === 0, 'null should return []');
    assert(filterForChair8Exams([]).length === 0, '[] should return []');
    assert(filterForChair8Exams(undefined).length === 0, 'undefined should return []');
});

// Test 5: Date expansion uses correct tiers
test('Date expansion tiers are [30, 60, 90]', () => {
    assert(DATE_EXPANSION_TIERS[0] === 30, 'Tier 0 should be 30');
    assert(DATE_EXPANSION_TIERS[1] === 60, 'Tier 1 should be 60');
    assert(DATE_EXPANSION_TIERS[2] === 90, 'Tier 2 should be 90');
});

// Test 6: Chair 8 config has correct GUIDs
test('Chair 8 config has correct GUIDs', () => {
    assert(CHAIR_8_CONFIG.scheduleColumnGUID === '07687884-7e37-49aa-8028-d43b751c9034', 'Wrong scheduleColumnGUID');
    assert(CHAIR_8_CONFIG.appointmentClass === 'Exams', 'Wrong appointmentClass');
    assert(CHAIR_8_CONFIG.defaultMinutes === 40, 'Wrong defaultMinutes');
});

console.log(`\n--- Unit Tests: ${passed} passed, ${failed} failed ---\n`);

// ========== INTEGRATION TEST ==========
async function integrationTest() {
    console.log('=== INTEGRATION TEST: Real API Call ===\n');

    const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
    const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + credentials };
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    // Get corrected date range (30+ days out)
    const corrected = correctDateRange(null, null, 60);
    console.log(`Search range (v58 corrected): ${corrected.startDate} to ${corrected.endDate}`);

    try {
        const resp = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
            method: 'POST',
            headers,
            body: JSON.stringify({ uui, startDate: corrected.startDate, endDate: corrected.endDate })
        });
        const data = await resp.json();

        console.log(`\nAPI returned: ${data.slots?.length || 0} total slots`);

        if (data.slots && data.slots.length > 0) {
            // Count by appointment class
            const byClass = {};
            data.slots.forEach(s => {
                const cls = s.AppointmentClassDescription || 'Unknown';
                if (!byClass[cls]) byClass[cls] = 0;
                byClass[cls]++;
            });
            console.log('By class:', JSON.stringify(byClass));

            // Apply Chair 8 Exams filter
            const chair8Exams = filterForChair8Exams(data.slots);
            console.log(`After Chair 8 Exams filter: ${chair8Exams.length} slots`);

            if (chair8Exams.length > 0) {
                console.log('\n✓ SUCCESS: Found Chair 8 Exams slots!');
                console.log('First 3 Chair 8 Exams slots:');
                chair8Exams.slice(0, 3).forEach((s, i) => {
                    console.log(`  ${i + 1}. ${s.startTime} (${s.minutes} min)`);
                });
            } else {
                console.log('\n✗ FAIL: No Chair 8 Exams slots found after filtering');
                console.log('This could indicate the v58 fix needs adjustment or Chair 8 is fully booked');
            }
        } else {
            console.log('\n✗ FAIL: API returned no slots at all');
        }

    } catch (e) {
        console.log('\n✗ FAIL: API error - ' + e.message);
    }
}

// Run integration test
integrationTest().then(() => {
    console.log('\n=== TEST COMPLETE ===');
    process.exit(failed > 0 ? 1 : 0);
});
