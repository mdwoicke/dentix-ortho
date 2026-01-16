#!/usr/bin/env node
/**
 * Direct API test for Chair 8 Exams slots in Production
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const headers = { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + credentials };
const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';

async function test() {
  console.log('=== DIRECT API TEST FOR CHAIR 8 EXAMS ===\n');

  // Search a wide date range
  const resp = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
    method: 'POST',
    headers,
    body: JSON.stringify({ uui, startDate: '01/14/2026', endDate: '04/14/2026' })
  });
  const data = await resp.json();

  console.log('Total slots returned:', data.slots?.length || 0);

  if (data.slots && data.slots.length > 0) {
    // Count by appointment class
    const byClass = {};
    data.slots.forEach(s => {
      const cls = s.AppointmentClassDescription || 'Unknown';
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(s);
    });

    console.log('\nBy Appointment Class:');
    Object.entries(byClass).forEach(([cls, slots]) => {
      console.log('  ' + cls + ': ' + slots.length + ' slots');
    });

    // Filter for Chair 8 Exams
    const chair8Exams = data.slots.filter(s =>
      (s.scheduleColumnGUID === CHAIR_8_GUID || s.ScheduleColumnGUID === CHAIR_8_GUID) &&
      s.AppointmentClassDescription === 'Exams'
    );

    console.log('\nChair 8 Exams slots:', chair8Exams.length);
    if (chair8Exams.length > 0) {
      console.log('First 5 Chair 8 Exams slots:');
      chair8Exams.slice(0, 5).forEach((s, i) => {
        console.log('  ' + (i+1) + '. ' + s.startTime + ' (' + s.minutes + ' min)');
      });
    }

    // Check all Chair 8 slots (any class)
    const allChair8 = data.slots.filter(s =>
      s.scheduleColumnGUID === CHAIR_8_GUID || s.ScheduleColumnGUID === CHAIR_8_GUID
    );
    console.log('\nAll Chair 8 slots (any class):', allChair8.length);
    if (allChair8.length > 0) {
      const chair8ByClass = {};
      allChair8.forEach(s => {
        const cls = s.AppointmentClassDescription || 'Unknown';
        if (!chair8ByClass[cls]) chair8ByClass[cls] = 0;
        chair8ByClass[cls]++;
      });
      console.log('Chair 8 by class:', JSON.stringify(chair8ByClass));
    }
  }
}

test().catch(console.error);
