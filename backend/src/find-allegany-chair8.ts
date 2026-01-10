/**
 * Cloud9 API Query: Find Allegany 300 + Chair 8 Appointments
 * Run with: cd backend && npx ts-node src/find-allegany-chair8.ts
 *
 * Strategy:
 * 1. GetLocations - Find "Allegany 300" location GUID
 * 2. GetChairSchedules - Find "Chair 8" schdcolGUID for that location
 * 3. GetAppointmentListByDate - Query appointments and filter by location/chair
 */

import axios from 'axios';
import * as fs from 'fs';

// Production credentials (use sandbox for testing)
const USE_PRODUCTION = true;

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

const SANDBOX_CONFIG = {
  endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
  clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
  userName: 'IntelepeerTest',
  password: '#!InteleP33rTest!#'
};

const CONFIG = USE_PRODUCTION ? PROD_CONFIG : SANDBOX_CONFIG;

function buildRequest(procedure: string, parameters: string = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>${CONFIG.clientId}</ClientID>
    <UserName>${CONFIG.userName}</UserName>
    <Password>${CONFIG.password}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>
        ${parameters}
    </Parameters>
</GetDataRequest>`;
}

async function callApi(procedure: string, parameters: string = ''): Promise<string> {
  const xml = buildRequest(procedure, parameters);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Calling: ${procedure}`);
  console.log('='.repeat(60));

  try {
    const response = await axios.get(CONFIG.endpoint, {
      headers: {
        'Content-Type': 'application/xml'
      },
      data: xml,
      timeout: 30000
    });

    return response.data;
  } catch (error: any) {
    console.error(`Error calling ${procedure}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

function extractRecords(xml: string): string[] {
  const records: string[] = [];
  const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
  let match;
  while ((match = recordRegex.exec(xml)) !== null) {
    records.push(match[1]);
  }
  return records;
}

function parseRecordFields(recordXml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRegex = /<(\w+)>(.*?)<\/\1>/g;
  let match;
  while ((match = fieldRegex.exec(recordXml)) !== null) {
    fields[match[1]] = match[2];
  }
  return fields;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Cloud9 API Query: Find Allegany 300 + Chair 8 Appointments ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nEnvironment: ${USE_PRODUCTION ? 'PRODUCTION' : 'SANDBOX'}`);
  console.log('Endpoint:', CONFIG.endpoint);
  console.log('Current UTC Time:', new Date().toISOString());

  if (USE_PRODUCTION) {
    console.log('\n⚠️  Note: Production API available 12:00 AM - 11:00 AM UTC only');
  }

  try {
    // ==========================================
    // STEP 1: Get Locations - Find Allegany 300
    // ==========================================
    console.log('\n\n### STEP 1: Get Locations - Finding Allegany 300 ###');
    const locationsXml = await callApi('GetLocations', '<showDeleted>False</showDeleted>');

    const locationRecords = extractRecords(locationsXml);
    console.log(`\nFound ${locationRecords.length} locations:`);

    let allegany300Guid: string | null = null;
    const allLocations: Array<{ name: string; guid: string }> = [];

    for (const record of locationRecords) {
      const fields = parseRecordFields(record);
      const name = fields.LocationName || fields.locName || 'Unknown';
      const guid = fields.LocationGUID || fields.locGUID || '';

      allLocations.push({ name, guid });
      console.log(`  - ${name} (GUID: ${guid})`);

      // Look for Allegany 300
      if (name.toLowerCase().includes('allegany') && name.includes('300')) {
        allegany300Guid = guid;
        console.log(`    ^^^ EXACT MATCH: Allegany 300`);
      } else if (name.toLowerCase().includes('allegany')) {
        console.log(`    ^^^ Partial match: Contains "Allegany"`);
        if (!allegany300Guid) allegany300Guid = guid;
      }
    }

    if (!allegany300Guid) {
      console.log('\n⚠️  "Allegany 300" not found exactly. Showing all for reference.');
    } else {
      console.log(`\n✅ Target Location GUID: ${allegany300Guid}`);
    }

    // ==========================================
    // STEP 2: Get Chair Schedules - Find Chair 8
    // ==========================================
    console.log('\n\n### STEP 2: Get Chair Schedules - Finding Chair 8 ###');
    const chairsXml = await callApi('GetChairSchedules');

    const chairRecords = extractRecords(chairsXml);
    console.log(`\nFound ${chairRecords.length} chair schedules`);

    const chair8Records: Array<Record<string, string>> = [];
    const alleganyChairs: Array<Record<string, string>> = [];
    const allChairs: Array<Record<string, string>> = [];

    for (const record of chairRecords) {
      const fields = parseRecordFields(record);
      allChairs.push(fields);

      const locName = fields.locName || '';
      const colDesc = fields.schdcolDescription || '';

      // Check for Chair 8
      const isChair8 = colDesc.toLowerCase().includes('chair 8') ||
                       colDesc === 'Chair 8' ||
                       colDesc === '8';

      // Check for Allegany
      const isAllegany = locName.toLowerCase().includes('allegany');

      if (isChair8) {
        chair8Records.push(fields);
        console.log(`\n🎯 CHAIR 8 FOUND:`);
        console.log(`   Location: ${locName}`);
        console.log(`   Chair: ${colDesc}`);
        console.log(`   locGUID: ${fields.locGUID}`);
        console.log(`   schdcolGUID: ${fields.schdcolGUID}`);
        console.log(`   schdvwGUID: ${fields.schdvwGUID}`);
      }

      if (isAllegany) {
        alleganyChairs.push(fields);
        console.log(`\n📍 ALLEGANY CHAIR:`);
        console.log(`   Location: ${locName}`);
        console.log(`   Chair: ${colDesc}`);
        console.log(`   locGUID: ${fields.locGUID}`);
        console.log(`   schdcolGUID: ${fields.schdcolGUID}`);
      }
    }

    // Find target: Chair 8 at Allegany
    const targetChairs = chair8Records.filter(c =>
      alleganyChairs.some(a => a.locGUID === c.locGUID)
    );

    if (targetChairs.length > 0) {
      console.log('\n\n' + '★'.repeat(60));
      console.log('TARGET FOUND: Chair 8 at Allegany 300');
      console.log('★'.repeat(60));
      for (const tc of targetChairs) {
        console.log(JSON.stringify(tc, null, 2));
      }
    }

    // ==========================================
    // STEP 3: Get Appointments at Allegheny 300M using LocationGUID filter
    // ==========================================
    console.log('\n\n### STEP 3: Get Appointments for Allegheny 300M ###');

    // Target: CDH - Allegheny 300M
    const allegheny300MGUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';
    const chair8SchdvwGUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';
    const chair8SchdcolGUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1';  // Chair 8 column GUID

    console.log(`\nTarget Location: CDH - Allegheny 300M (${allegheny300MGUID})`);
    console.log(`Target Chair 8 - schdvwGUID: ${chair8SchdvwGUID}`);
    console.log(`Target Chair 8 - schdcolGUID: ${chair8SchdcolGUID}`);

    const today = new Date();
    const formatDate = (d: Date) =>
      `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

    // First: Get all appointments and filter by Allegheny 300M location
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 14);

    const dateParams = `<dtAppointment>${formatDate(startDate)}</dtAppointment>
        <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>`;

    console.log(`\nQuerying all appointments from ${formatDate(startDate)} to ${formatDate(endDate)}`);
    console.log('Then filtering for Allegheny 300M location...');

    const apptsXml = await callApi('GetAppointmentListByDate', dateParams);

    const apptRecords = extractRecords(apptsXml);
    console.log(`\nFound ${apptRecords.length} total appointments`);

    // Filter for Allegheny 300M
    const allAppointments: Array<Record<string, string>> = [];
    const allegheny300MAppointments: Array<Record<string, string>> = [];

    for (const record of apptRecords) {
      const fields = parseRecordFields(record);
      allAppointments.push(fields);

      // Filter by Allegheny 300M LocationGUID
      if (fields.LocationGUID === allegheny300MGUID ||
          fields.LocationName?.includes('Allegheny 300') ||
          fields.LocationCode === 'A300' ||
          fields.LocationName?.toLowerCase().includes('allegheny')) {
        allegheny300MAppointments.push(fields);
      }
    }

    console.log(`\n📍 Found ${allegheny300MAppointments.length} appointments at Allegheny 300M`);

    if (allegheny300MAppointments.length > 0) {
      console.log('\n### ALLEGHENY 300M APPOINTMENTS ###');
      for (const appt of allegheny300MAppointments.slice(0, 20)) {
        console.log('\n' + '-'.repeat(50));
        console.log(`Patient: ${appt.PatientFirstName || ''} ${appt.PatientLastName || ''}`);
        console.log(`Date/Time: ${appt.AppointmentDateTime || 'N/A'}`);
        console.log(`Location: ${appt.LocationName || 'N/A'} (${appt.LocationCode || ''})`);
        console.log(`Type: ${appt.AppointmentTypeDescription || 'N/A'}`);
        console.log(`AppointmentTypeGUID: ${appt.AppointmentTypeGUID || 'N/A'}`);
        console.log(`Status: ${appt.AppointmentStatusDescription || 'N/A'}`);
        console.log(`Doctor: ${appt.OrthodontistName || 'N/A'}`);
        console.log(`OrthodontistGUID: ${appt.OrthodontistGUID || 'N/A'}`);
        console.log(`AppointmentGUID: ${appt.AppointmentGUID || 'N/A'}`);
        console.log(`LocationGUID: ${appt.LocationGUID || 'N/A'}`);
        console.log(`PatientGUID: ${appt.PatientGUID || 'N/A'}`);
      }
    }

    // Now use GetAppointmentsByDate with the Chair 8 schedule view GUID
    console.log('\n\n### STEP 4: Query Chair 8 specifically using GetAppointmentsByDate ###');
    console.log(`Using schdvwGUID: ${chair8SchdvwGUID}`);

    // Query for multiple dates around today
    const filteredAppointments: Array<Record<string, string>> = [];

    for (let dayOffset = -3; dayOffset <= 7; dayOffset++) {
      const queryDate = new Date(today);
      queryDate.setDate(queryDate.getDate() + dayOffset);

      const specificDateParams = `<dtAppointment>${formatDate(queryDate)}</dtAppointment>
        <schdvwGUID>${chair8SchdvwGUID}</schdvwGUID>`;

      console.log(`\nQuerying ${formatDate(queryDate)} for Chair 8 schedule view...`);

      try {
        const chairApptsXml = await callApi('GetAppointmentsByDate', specificDateParams);
        const chairApptRecords = extractRecords(chairApptsXml);

        if (chairApptRecords.length > 0) {
          console.log(`  ✅ Found ${chairApptRecords.length} appointments on Chair 8`);

          for (const record of chairApptRecords) {
            const fields = parseRecordFields(record);
            fields.QueryDate = formatDate(queryDate);
            fields.Chair = 'Chair 8';
            filteredAppointments.push(fields);
          }
        }
      } catch (err: any) {
        console.log(`  ⚠️ Error querying ${formatDate(queryDate)}: ${err.message}`);
      }
    }

    if (filteredAppointments.length > 0) {
      console.log(`\n\n${'★'.repeat(60)}`);
      console.log(`CHAIR 8 APPOINTMENTS AT ALLEGHENY 300M: ${filteredAppointments.length} found`);
      console.log('★'.repeat(60));

      for (const appt of filteredAppointments) {
        console.log('\n' + '-'.repeat(50));
        console.log(`📅 Date: ${appt.QueryDate}`);
        console.log(`👤 Patient: ${appt.PatientFirstName || ''} ${appt.PatientLastName || ''}`);
        console.log(`⏰ Time: ${appt.AppointmentDateTime || appt.apptDateTime || 'N/A'}`);
        console.log(`🪑 Chair: ${appt.Chair}`);
        console.log(`📋 Type: ${appt.AppointmentTypeDescription || 'N/A'}`);
        console.log(`📋 AppointmentTypeGUID: ${appt.AppointmentTypeGUID || 'N/A'}`);
        console.log(`📊 Status: ${appt.AppointmentStatusDescription || appt.apptStatus || 'N/A'}`);
        console.log(`🆔 AppointmentGUID: ${appt.AppointmentGUID || appt.apptGUID || 'N/A'}`);
        console.log(`👨‍⚕️ OrthodontistGUID: ${appt.OrthodontistGUID || 'N/A'}`);
        console.log(`📍 LocationGUID: ${appt.LocationGUID || 'N/A'}`);
        console.log('\nFull record:', JSON.stringify(appt, null, 2));
      }
    } else {
      console.log('\n⚠️  No Chair 8 appointments found in the date range.');

      // Show sample appointments for reference
      if (allAppointments.length > 0) {
        console.log('\n--- Sample of 3 appointments for reference: ---');
        for (const appt of allAppointments.slice(0, 3)) {
          console.log('\n' + '-'.repeat(40));
          console.log(JSON.stringify(appt, null, 2));
        }
      }
    }

    // Save results to file
    const results = {
      timestamp: new Date().toISOString(),
      environment: USE_PRODUCTION ? 'PRODUCTION' : 'SANDBOX',
      query: 'Allegany 300 + Chair 8',
      locations: allLocations,
      allegany300Guid,
      allChairSchedules: allChairs,
      chair8Records,
      alleganyChairs,
      targetChairs,
      appointmentCount: allAppointments.length,
      matchingAppointments: filteredAppointments,
      sampleAppointments: allAppointments.slice(0, 20)
    };

    const outputPath = './allegany-chair8-results.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n\n✅ Full results saved to: ${outputPath}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.response?.data?.includes('Error code: 7') ||
        error.response?.data?.includes('allowance window') ||
        error.message?.includes('Error code: 7')) {
      console.error('\n⚠️  ERROR CODE 7: Not authorized to collect data outside of allowance window');
      console.error('Production API is only available 12:00 AM - 11:00 AM UTC');
      console.error(`Current UTC time: ${new Date().toISOString()}`);
    }
  }
}

main().catch(console.error);
