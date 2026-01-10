/**
 * Fast query for CDH - Allegheny 202 appointments
 * Uses GetAppointmentListByDate and filters by LocationGUID
 */

import axios from 'axios';
import * as fs from 'fs';

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

// CDH - Allegheny 202
const ALLEGHENY_202 = {
  locGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
  locName: 'CDH - Allegheny 202'
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
  console.log('║  Fast Query: CDH - Allegheny 202 Appointments                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\nTarget:', ALLEGHENY_202.locName);
  console.log('LocationGUID:', ALLEGHENY_202.locGUID);

  try {
    // Query appointments by date range and filter by location
    const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3); // Last 3 months

    console.log(`\nQuerying appointments from ${formatDate(startDate)} to ${formatDate(endDate)}...`);

    const dateParams = `<dtAppointment>${formatDate(startDate)}</dtAppointment>
      <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>`;

    const apptsXml = await callApi('GetAppointmentListByDate', dateParams);
    const apptRecords = extractRecords(apptsXml);

    console.log(`Total appointments returned: ${apptRecords.length}`);

    // Filter for Allegheny 202
    const allegheny202Appts: Array<Record<string, string>> = [];

    for (const record of apptRecords) {
      const appt = parseRecordFields(record);
      if (appt.LocationGUID === ALLEGHENY_202.locGUID ||
          appt.LocationName?.includes('Allegheny 202')) {
        allegheny202Appts.push(appt);
      }
    }

    console.log(`\n📍 Allegheny 202 appointments: ${allegheny202Appts.length}`);

    if (allegheny202Appts.length > 0) {
      // Track appointment types and providers
      const typeMap = new Map<string, { guid: string; desc: string; count: number }>();
      const provMap = new Map<string, { guid: string; name: string; count: number }>();

      console.log('\n### SAMPLE APPOINTMENTS AT ALLEGHENY 202 ###');
      console.log('='.repeat(60));

      for (const appt of allegheny202Appts.slice(0, 10)) {
        console.log(`\n  Patient: ${appt.PatientFirstName} ${appt.PatientLastName}`);
        console.log(`  PatientGUID: ${appt.PatientGUID}`);
        console.log(`  AppointmentGUID: ${appt.AppointmentGUID}`);
        console.log(`  DateTime: ${appt.AppointmentDateTime}`);
        console.log(`  Type: ${appt.AppointmentTypeDescription}`);
        console.log(`  AppointmentTypeGUID: ${appt.AppointmentTypeGUID}`);
        console.log(`  Status: ${appt.AppointmentStatusDescription}`);
        console.log(`  Doctor: ${appt.OrthodontistName}`);
        console.log(`  OrthodontistGUID: ${appt.OrthodontistGUID}`);
        console.log(`  LocationGUID: ${appt.LocationGUID}`);
      }

      // Track types and providers
      for (const appt of allegheny202Appts) {
        if (appt.AppointmentTypeGUID) {
          const key = appt.AppointmentTypeGUID;
          if (typeMap.has(key)) {
            typeMap.get(key)!.count++;
          } else {
            typeMap.set(key, { guid: key, desc: appt.AppointmentTypeDescription || '', count: 1 });
          }
        }
        if (appt.OrthodontistGUID) {
          const key = appt.OrthodontistGUID;
          if (provMap.has(key)) {
            provMap.get(key)!.count++;
          } else {
            provMap.set(key, { guid: key, name: appt.OrthodontistName || '', count: 1 });
          }
        }
      }

      // Summary
      console.log('\n\n### APPOINTMENT TYPES AT ALLEGHENY 202 ###');
      const sortedTypes = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);
      for (const t of sortedTypes) {
        console.log(`\n  AppointmentTypeGUID: ${t.guid}`);
        console.log(`  Description: ${t.desc}`);
        console.log(`  Count: ${t.count}`);
      }

      console.log('\n\n### PROVIDERS AT ALLEGHENY 202 ###');
      const sortedProvs = Array.from(provMap.values()).sort((a, b) => b.count - a.count);
      for (const p of sortedProvs) {
        console.log(`\n  OrthodontistGUID: ${p.guid}`);
        console.log(`  Name: ${p.name}`);
        console.log(`  Count: ${p.count}`);
      }

      // Save results
      fs.writeFileSync('./allegheny-202-appointments.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        target: ALLEGHENY_202,
        dateRange: { start: formatDate(startDate), end: formatDate(endDate) },
        totalQueried: apptRecords.length,
        allegheny202Count: allegheny202Appts.length,
        appointmentTypes: sortedTypes,
        providers: sortedProvs,
        sampleAppointments: allegheny202Appts.slice(0, 50)
      }, null, 2));

      console.log('\n\n✅ Results saved to: ./allegheny-202-appointments.json');

    } else {
      console.log('\n⚠️ No appointments found for Allegheny 202 in the date range.');
      console.log('Note: API returns max 1000 records sorted by location.');
      console.log('CDH - Allegheny 202 may be outside the returned set.');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

main().catch(console.error);
