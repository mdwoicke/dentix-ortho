/**
 * Find PAST Chair 8 appointments at both Allegheny locations
 */

import axios from 'axios';
import * as fs from 'fs';

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

const LOCATIONS = [
  {
    name: 'CDH - Allegheny 202',
    locGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b',
    schdvwGUID: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d',
    schdcolGUID: '07687884-7e37-49aa-8028-d43b751c9034'
  },
  {
    name: 'CDH - Allegheny 300M',
    locGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6',
    schdvwGUID: 'b1946f40-3b0b-4e01-87a9-c5060b88443e',
    schdcolGUID: 'dda0b40c-ace5-4427-8b76-493bf9aa26f1'
  }
];

function buildRequest(procedure: string, parameters: string = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
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
  const regex = /<Record>([\s\S]*?)<\/Record>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) records.push(match[1]);
  return records;
}

function parseFields(xml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /<(\w+)>(.*?)<\/\1>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) fields[match[1]] = match[2];
  return fields;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Find PAST Chair 8 Appointments at Both Allegheny Locations   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const allResults: Record<string, any> = {};

  for (const loc of LOCATIONS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Location: ${loc.name}`);
    console.log(`schdvwGUID: ${loc.schdvwGUID}`);
    console.log('='.repeat(60));

    const appointments: Array<Record<string, string>> = [];

    // Query past 60 days
    for (let daysBack = 1; daysBack <= 60; daysBack++) {
      const queryDate = new Date();
      queryDate.setDate(queryDate.getDate() - daysBack);

      const params = `<dtAppointment>${formatDate(queryDate)}</dtAppointment>
        <schdvwGUID>${loc.schdvwGUID}</schdvwGUID>`;

      try {
        const xml = await callApi('GetAppointmentsByDate', params);
        const records = extractRecords(xml);

        if (records.length > 0) {
          console.log(`  ${formatDate(queryDate)}: ${records.length} appointments`);

          for (const record of records) {
            const appt = parseFields(record);
            appt.QueryDate = formatDate(queryDate);
            appt.SourceLocation = loc.name;
            appointments.push(appt);
          }
        }
      } catch (err) {
        // Continue
      }
    }

    console.log(`\nTotal PAST appointments: ${appointments.length}`);

    if (appointments.length > 0) {
      console.log('\n### SAMPLE PAST APPOINTMENTS ###');
      for (const appt of appointments.slice(0, 5)) {
        console.log(`\n  Date: ${appt.QueryDate}`);
        console.log(`  Patient: ${appt.PatientFullName}`);
        console.log(`  PatientID: ${appt.PatientID}`);
        console.log(`  AppointmentGUID: ${appt.AppointmentGUID}`);
        console.log(`  DateTime: ${appt.AppointmentDateTime}`);
        console.log(`  Type: ${appt.AppointmentTypeDescription}`);
        console.log(`  AppointmentTypeGUID: ${appt.AppointmentTypeGUID}`);
        console.log(`  Status: ${appt.apptstDescription}`);
        console.log(`  LocationGUID: ${appt.LocationGUID}`);
      }
    }

    allResults[loc.name] = {
      ...loc,
      appointmentCount: appointments.length,
      appointments: appointments
    };
  }

  // Save
  fs.writeFileSync('./past-chair8-both-locations.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    results: allResults
  }, null, 2));

  console.log('\n\n✅ Results saved to: ./past-chair8-both-locations.json');
}

main().catch(console.error);
