/**
 * Search BOTH Allegheny locations for Chair 8 appointments
 */

import axios from 'axios';
import * as fs from 'fs';

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
    <Parameters>${parameters}</Parameters>
</GetDataRequest>`;
}

async function callApi(procedure: string, parameters: string = ''): Promise<string> {
  const xml = buildRequest(procedure, parameters);
  const response = await axios.get(PROD_CONFIG.endpoint, {
    headers: { 'Content-Type': 'application/xml' },
    data: xml,
    timeout: 60000
  });
  return response.data;
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
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Search Chair 8 at Both Allegheny Locations                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Get ALL chair schedules to find Chair 8 at both locations
    console.log('\n### Step 1: Find Chair 8 Schedules at Allegheny Locations ###');
    const chairsXml = await callApi('GetChairSchedules', '');
    const chairRecords = extractRecords(chairsXml);

    console.log(`Total chair schedules: ${chairRecords.length}`);

    const chair8Schedules: Array<Record<string, string>> = [];

    for (const record of chairRecords) {
      const chair = parseRecordFields(record);
      const locName = chair.locName || '';
      const colDesc = chair.schdcolDescription || '';

      // Find Chair 8 at any Allegheny location
      if (locName.toLowerCase().includes('allegh') && colDesc.toLowerCase().includes('chair 8')) {
        chair8Schedules.push(chair);
        console.log(`\n  Found Chair 8:`);
        console.log(`    Location: ${locName}`);
        console.log(`    Chair: ${colDesc}`);
        console.log(`    locGUID: ${chair.locGUID}`);
        console.log(`    schdvwGUID: ${chair.schdvwGUID}`);
        console.log(`    schdcolGUID: ${chair.schdcolGUID}`);
      }
    }

    if (chair8Schedules.length === 0) {
      console.log('\n  No Chair 8 found at Allegheny locations.');
      console.log('\n  Showing all chairs at Allegheny locations:');

      for (const record of chairRecords) {
        const chair = parseRecordFields(record);
        const locName = chair.locName || '';
        if (locName.toLowerCase().includes('allegh')) {
          console.log(`\n    ${locName} - ${chair.schdcolDescription}`);
          console.log(`      schdvwGUID: ${chair.schdvwGUID}`);
          console.log(`      schdcolGUID: ${chair.schdcolGUID}`);
        }
      }
    }

    // Step 2: Query appointments for each Chair 8 schedule
    console.log('\n\n### Step 2: Query Appointments for Chair 8 ###');

    const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const allAppointments: Array<Record<string, string>> = [];

    // Query each Chair 8 schedule view for a wide date range
    for (const chair of chair8Schedules) {
      console.log(`\nQuerying: ${chair.locName} - ${chair.schdcolDescription}`);

      // Try querying by date for 2 years back
      for (let year = 0; year <= 2; year++) {
        for (let month = 0; month < 12; month += 2) {
          const queryDate = new Date();
          queryDate.setFullYear(queryDate.getFullYear() - year);
          queryDate.setMonth(queryDate.getMonth() - month);

          const params = `<dtAppointment>${formatDate(queryDate)}</dtAppointment>
            <schdvwGUID>${chair.schdvwGUID}</schdvwGUID>`;

          try {
            const apptsXml = await callApi('GetAppointmentsByDate', params);
            const apptRecords = extractRecords(apptsXml);

            if (apptRecords.length > 0) {
              console.log(`  ${formatDate(queryDate)}: ${apptRecords.length} appointments`);

              for (const record of apptRecords) {
                const appt = parseRecordFields(record);
                appt.SourceChair = chair.schdcolDescription;
                appt.SourceLocation = chair.locName;
                appt.QueryDate = formatDate(queryDate);
                allAppointments.push(appt);
              }
            }
          } catch (err) {
            // Continue on error
          }
        }
      }
    }

    console.log(`\n\n📍 Total Chair 8 appointments found: ${allAppointments.length}`);

    if (allAppointments.length > 0) {
      // Show sample appointments
      console.log('\n### SAMPLE CHAIR 8 APPOINTMENTS ###');
      console.log('='.repeat(60));

      for (const appt of allAppointments.slice(0, 20)) {
        console.log(`\n  Location: ${appt.SourceLocation}`);
        console.log(`  Chair: ${appt.SourceChair}`);
        console.log(`  Query Date: ${appt.QueryDate}`);
        console.log(`  Patient: ${appt.PatientFirstName || appt.patFirstName} ${appt.PatientLastName || appt.patLastName}`);
        console.log(`  PatientGUID: ${appt.PatientGUID || appt.patGUID}`);
        console.log(`  AppointmentGUID: ${appt.AppointmentGUID || appt.apptGUID}`);
        console.log(`  DateTime: ${appt.AppointmentDateTime || appt.apptDateTime}`);
        console.log(`  Type: ${appt.AppointmentTypeDescription || appt.apptTypeDescription}`);
        console.log(`  AppointmentTypeGUID: ${appt.AppointmentTypeGUID || appt.apptTypeGUID}`);
        console.log(`  Minutes: ${appt.AppointmentMinutes || appt.apptMinutes}`);
        console.log(`  Status: ${appt.AppointmentStatusDescription || appt.apptStatus}`);
        console.log(`  Doctor: ${appt.OrthodontistName || appt.orthoName}`);
        console.log(`  OrthodontistGUID: ${appt.OrthodontistGUID || appt.orthoGUID}`);
      }

      // Save results
      fs.writeFileSync('./chair8-allegheny-results.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        chair8Schedules: chair8Schedules,
        appointmentCount: allAppointments.length,
        appointments: allAppointments
      }, null, 2));

      console.log('\n\n✅ Results saved to: ./chair8-allegheny-results.json');

    } else {
      console.log('\n⚠️ No Chair 8 appointments found at Allegheny locations.');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

main().catch(console.error);
