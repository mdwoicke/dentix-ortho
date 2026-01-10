/**
 * Cloud9 API Query: Find Allegany 300 + Chair 8 Appointments
 * Run with: npx ts-node scripts/find-allegany-chair8.ts
 */

import axios from 'axios';

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

function buildRequest(procedure: string, parameters: string = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>${PROD_CONFIG.clientId}</ClientID>
    <UserName>${PROD_CONFIG.userName}</UserName>
    <Password>${PROD_CONFIG.password}</Password>
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
    // Cloud9 API uses GET with XML body
    const response = await axios.get(PROD_CONFIG.endpoint, {
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
  console.log('\nProduction Endpoint:', PROD_CONFIG.endpoint);
  console.log('Current UTC Time:', new Date().toISOString());
  console.log('\n⚠️  Note: Production API available 12:00 AM - 11:00 AM UTC only');

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
        console.log(`    ^^^ MATCH FOUND: Allegany 300`);
      } else if (name.toLowerCase().includes('allegany')) {
        console.log(`    ^^^ Partial match: Contains "Allegany"`);
        if (!allegany300Guid) allegany300Guid = guid;
      }
    }

    if (!allegany300Guid) {
      console.log('\n⚠️  "Allegany 300" not found exactly. Using best match or showing all.');
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
    // STEP 3: Get Appointments by Date
    // ==========================================
    console.log('\n\n### STEP 3: Get Appointments ###');

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 14); // 2 weeks ago
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 14); // 2 weeks ahead

    const formatDate = (d: Date) =>
      `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

    const dateParams = `<dtAppointment>${formatDate(startDate)}</dtAppointment>
        <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>`;

    console.log(`\nQuerying appointments from ${formatDate(startDate)} to ${formatDate(endDate)}`);

    const apptsXml = await callApi('GetAppointmentListByDate', dateParams);

    const apptRecords = extractRecords(apptsXml);
    console.log(`\nFound ${apptRecords.length} total appointments`);

    // Parse and filter appointments
    const allAppointments: Array<Record<string, string>> = [];
    const filteredAppointments: Array<Record<string, string>> = [];

    for (const record of apptRecords) {
      const fields = parseRecordFields(record);
      allAppointments.push(fields);

      // Check for Allegany or Chair 8 match
      const allValues = Object.values(fields).join(' ').toLowerCase();
      const isAlleganyMatch = allValues.includes('allegany');
      const isChair8Match = allValues.includes('chair 8') || fields.ProviderType?.includes('8');

      if (isAlleganyMatch || isChair8Match) {
        filteredAppointments.push(fields);
      }
    }

    if (filteredAppointments.length > 0) {
      console.log(`\n\n### ${filteredAppointments.length} MATCHING APPOINTMENTS ###`);
      for (const appt of filteredAppointments) {
        console.log('\n' + '-'.repeat(50));
        console.log(`Patient: ${appt.PatientFirstName || ''} ${appt.PatientLastName || ''}`);
        console.log(`Date/Time: ${appt.AppointmentDateTime || appt.apptDateTime || 'N/A'}`);
        console.log(`Location: ${appt.LocationName || appt.locName || 'N/A'}`);
        console.log(`Status: ${appt.AppointmentStatus || appt.apptStatus || 'N/A'}`);
        console.log(`GUID: ${appt.AppointmentGUID || appt.apptGUID || 'N/A'}`);
        console.log('Full record:', JSON.stringify(appt, null, 2));
      }
    } else {
      console.log('\n⚠️  No appointments found matching Allegany 300 + Chair 8 criteria.');

      // Show sample appointments for reference
      if (allAppointments.length > 0) {
        console.log('\n--- Sample of 5 appointments for reference: ---');
        for (const appt of allAppointments.slice(0, 5)) {
          console.log('\n' + '-'.repeat(40));
          console.log(JSON.stringify(appt, null, 2));
        }
      }
    }

    // Save results to file
    const fs = await import('fs');
    const results = {
      timestamp: new Date().toISOString(),
      query: 'Allegany 300 + Chair 8',
      locations: allLocations,
      allegany300Guid,
      chair8Records,
      alleganyChairs,
      targetChairs,
      appointmentCount: allAppointments.length,
      matchingAppointments: filteredAppointments,
      sampleAppointments: allAppointments.slice(0, 20)
    };

    const outputPath = 'scripts/allegany-chair8-results.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n\n✅ Full results saved to: ${outputPath}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.response?.data?.includes('Error code: 7') ||
        error.message?.includes('allowance window')) {
      console.error('\n⚠️  ERROR CODE 7: Not authorized to collect data outside of allowance window');
      console.error('Production API is only available 12:00 AM - 11:00 AM UTC');
      console.error(`Current UTC time: ${new Date().toISOString()}`);
    }
  }
}

main().catch(console.error);
