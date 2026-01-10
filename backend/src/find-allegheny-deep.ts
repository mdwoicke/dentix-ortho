/**
 * Deep search for Allegheny appointments using schedule view GUIDs
 * and extended date ranges
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
  console.log('║  Deep Search: Allegheny Appointments via Schedule Views       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Get all chair schedules for Allegheny locations
    console.log('\n### Step 1: Get Chair Schedules for Allegheny Locations ###');
    const chairsXml = await callApi('GetChairSchedules', '');
    const chairRecords = extractRecords(chairsXml);

    const alleghenyChairs: Array<Record<string, string>> = [];
    for (const record of chairRecords) {
      const chair = parseRecordFields(record);
      const locName = chair.locName || '';
      if (locName.toLowerCase().includes('allegh')) {
        alleghenyChairs.push(chair);
      }
    }

    console.log(`Found ${alleghenyChairs.length} chair schedules for Allegheny locations\n`);

    // Group by location
    const locSchedules = new Map<string, Array<Record<string, string>>>();
    for (const chair of alleghenyChairs) {
      const locName = chair.locName || 'Unknown';
      if (!locSchedules.has(locName)) {
        locSchedules.set(locName, []);
      }
      locSchedules.get(locName)!.push(chair);
    }

    // Show schedule views
    for (const [locName, chairs] of locSchedules) {
      console.log(`\n${locName}:`);
      console.log(`  LocationGUID: ${chairs[0]?.locGUID}`);
      console.log(`  Schedule Views:`);

      // Get unique schedule views
      const views = new Map<string, string>();
      for (const c of chairs) {
        if (c.schdvwGUID && !views.has(c.schdvwGUID)) {
          views.set(c.schdvwGUID, c.schdvwDescription || '');
        }
      }
      for (const [guid, desc] of views) {
        console.log(`    - ${desc} (${guid})`);
      }
    }

    // Step 2: Query appointments using schedule view GUIDs
    console.log('\n\n### Step 2: Query Appointments by Schedule View ###');

    const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const allAppointments: Array<Record<string, string>> = [];

    // Get unique schedule view GUIDs for Allegheny
    const scheduleViews = new Map<string, { locName: string; viewDesc: string }>();
    for (const chair of alleghenyChairs) {
      if (chair.schdvwGUID && !scheduleViews.has(chair.schdvwGUID)) {
        scheduleViews.set(chair.schdvwGUID, {
          locName: chair.locName || '',
          viewDesc: chair.schdvwDescription || ''
        });
      }
    }

    console.log(`\nQuerying ${scheduleViews.size} schedule views...`);

    // Query each schedule view for the past year
    for (const [schdvwGUID, info] of scheduleViews) {
      console.log(`\n  Querying: ${info.locName} - ${info.viewDesc}`);
      console.log(`  schdvwGUID: ${schdvwGUID}`);

      // Query multiple date ranges going back 1 year
      for (let monthsBack = 0; monthsBack <= 12; monthsBack += 3) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - monthsBack);
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 3);

        const params = `<dtAppointment>${formatDate(startDate)}</dtAppointment>
          <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>
          <schdvwGUID>${schdvwGUID}</schdvwGUID>`;

        try {
          const apptsXml = await callApi('GetAppointmentsByDate', params);
          const apptRecords = extractRecords(apptsXml);

          if (apptRecords.length > 0) {
            console.log(`    ${formatDate(startDate)} - ${formatDate(endDate)}: ${apptRecords.length} appointments`);

            for (const record of apptRecords) {
              const appt = parseRecordFields(record);
              appt.SourceScheduleView = schdvwGUID;
              appt.SourceLocation = info.locName;
              allAppointments.push(appt);
            }
          }
        } catch (err: any) {
          // Try single date query if range fails
        }
      }
    }

    console.log(`\n\n📍 Total Allegheny appointments found: ${allAppointments.length}`);

    if (allAppointments.length > 0) {
      // Track types and providers
      const typeMap = new Map<string, { guid: string; desc: string; count: number }>();
      const provMap = new Map<string, { guid: string; name: string; count: number }>();

      console.log('\n### SAMPLE APPOINTMENTS ###');
      console.log('='.repeat(60));

      for (const appt of allAppointments.slice(0, 15)) {
        console.log(`\n  Source: ${appt.SourceLocation}`);
        console.log(`  Patient: ${appt.PatientFirstName || appt.patFirstName} ${appt.PatientLastName || appt.patLastName}`);
        console.log(`  PatientGUID: ${appt.PatientGUID || appt.patGUID}`);
        console.log(`  AppointmentGUID: ${appt.AppointmentGUID || appt.apptGUID}`);
        console.log(`  DateTime: ${appt.AppointmentDateTime || appt.apptDateTime}`);
        console.log(`  Type: ${appt.AppointmentTypeDescription || appt.apptTypeDescription}`);
        console.log(`  AppointmentTypeGUID: ${appt.AppointmentTypeGUID || appt.apptTypeGUID}`);
        console.log(`  Status: ${appt.AppointmentStatusDescription || appt.apptStatus}`);
        console.log(`  Doctor: ${appt.OrthodontistName || appt.orthoName}`);
        console.log(`  OrthodontistGUID: ${appt.OrthodontistGUID || appt.orthoGUID}`);
      }

      // Track types and providers
      for (const appt of allAppointments) {
        const typeGUID = appt.AppointmentTypeGUID || appt.apptTypeGUID;
        const typeDesc = appt.AppointmentTypeDescription || appt.apptTypeDescription;
        if (typeGUID) {
          if (typeMap.has(typeGUID)) {
            typeMap.get(typeGUID)!.count++;
          } else {
            typeMap.set(typeGUID, { guid: typeGUID, desc: typeDesc || '', count: 1 });
          }
        }

        const provGUID = appt.OrthodontistGUID || appt.orthoGUID;
        const provName = appt.OrthodontistName || appt.orthoName;
        if (provGUID) {
          if (provMap.has(provGUID)) {
            provMap.get(provGUID)!.count++;
          } else {
            provMap.set(provGUID, { guid: provGUID, name: provName || '', count: 1 });
          }
        }
      }

      // Summary
      console.log('\n\n### APPOINTMENT TYPES ###');
      const sortedTypes = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);
      for (const t of sortedTypes.slice(0, 20)) {
        console.log(`\n  AppointmentTypeGUID: ${t.guid}`);
        console.log(`  Description: ${t.desc}`);
        console.log(`  Count: ${t.count}`);
      }

      console.log('\n\n### PROVIDERS ###');
      const sortedProvs = Array.from(provMap.values()).sort((a, b) => b.count - a.count);
      for (const p of sortedProvs) {
        console.log(`\n  OrthodontistGUID: ${p.guid}`);
        console.log(`  Name: ${p.name}`);
        console.log(`  Count: ${p.count}`);
      }

      // Save results
      fs.writeFileSync('./allegheny-deep-results.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        scheduleViews: Array.from(scheduleViews.entries()).map(([guid, info]) => ({
          schdvwGUID: guid,
          ...info
        })),
        appointmentCount: allAppointments.length,
        appointmentTypes: sortedTypes,
        providers: sortedProvs,
        appointments: allAppointments
      }, null, 2));

      console.log('\n\n✅ Results saved to: ./allegheny-deep-results.json');

    } else {
      console.log('\n⚠️ No appointments found via schedule views.');

      // Try alternative: GetAppointmentListByDate filtered by location
      console.log('\n### Trying Alternative: GetAppointmentListByDate ###');

      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1); // Go back 1 year

      console.log(`Querying all appointments from ${formatDate(startDate)} to ${formatDate(endDate)}...`);

      const params = `<dtAppointment>${formatDate(startDate)}</dtAppointment>
        <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>`;

      const apptsXml = await callApi('GetAppointmentListByDate', params);
      const apptRecords = extractRecords(apptsXml);

      console.log(`Total returned: ${apptRecords.length}`);

      // Filter for any CDH location
      const cdhAppts: Array<Record<string, string>> = [];
      for (const record of apptRecords) {
        const appt = parseRecordFields(record);
        const locName = appt.LocationName || '';
        if (locName.startsWith('CDH')) {
          cdhAppts.push(appt);
        }
      }

      console.log(`CDH location appointments: ${cdhAppts.length}`);

      if (cdhAppts.length > 0) {
        for (const appt of cdhAppts.slice(0, 10)) {
          console.log(`\n  Location: ${appt.LocationName}`);
          console.log(`  Patient: ${appt.PatientFirstName} ${appt.PatientLastName}`);
          console.log(`  DateTime: ${appt.AppointmentDateTime}`);
          console.log(`  Type: ${appt.AppointmentTypeDescription}`);
        }
      }
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

main().catch(console.error);
