/**
 * Check if Allegheny 300M has ANY appointments at all
 */

import axios from 'axios';

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

const ALLEGHENY_300M = {
  name: 'CDH - Allegheny 300M',
  locGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6',
  schdvwGUID: 'b1946f40-3b0b-4e01-87a9-c5060b88443e'
};

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
  console.log('║  Check ALL Appointments at Allegheny 300M                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\nLocation:', ALLEGHENY_300M.name);
  console.log('LocationGUID:', ALLEGHENY_300M.locGUID);
  console.log('schdvwGUID:', ALLEGHENY_300M.schdvwGUID);

  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  let totalFound = 0;
  const allAppts: Array<Record<string, string>> = [];

  // Query past 90 days
  console.log('\n### Querying past 90 days... ###');
  for (let daysBack = 0; daysBack <= 90; daysBack++) {
    const queryDate = new Date();
    queryDate.setDate(queryDate.getDate() - daysBack);

    const params = `<dtAppointment>${formatDate(queryDate)}</dtAppointment>
      <schdvwGUID>${ALLEGHENY_300M.schdvwGUID}</schdvwGUID>`;

    try {
      const xml = await callApi('GetAppointmentsByDate', params);
      const records = extractRecords(xml);

      if (records.length > 0) {
        console.log(`  ${formatDate(queryDate)}: ${records.length} appointments`);
        totalFound += records.length;

        for (const record of records) {
          allAppts.push(parseFields(record));
        }
      }
    } catch (err) {
      // Continue
    }
  }

  console.log(`\nPast 90 days total: ${totalFound}`);

  if (totalFound === 0) {
    // Check future 30 days
    console.log('\n### Checking future 30 days... ###');
    for (let daysAhead = 1; daysAhead <= 30; daysAhead++) {
      const queryDate = new Date();
      queryDate.setDate(queryDate.getDate() + daysAhead);

      const params = `<dtAppointment>${formatDate(queryDate)}</dtAppointment>
        <schdvwGUID>${ALLEGHENY_300M.schdvwGUID}</schdvwGUID>`;

      try {
        const xml = await callApi('GetAppointmentsByDate', params);
        const records = extractRecords(xml);

        if (records.length > 0) {
          console.log(`  ${formatDate(queryDate)}: ${records.length} appointments`);
          totalFound += records.length;

          for (const record of records) {
            allAppts.push(parseFields(record));
          }
        }
      } catch (err) {
        // Continue
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TOTAL APPOINTMENTS AT ALLEGHENY 300M: ${totalFound}`);
  console.log('='.repeat(60));

  if (allAppts.length > 0) {
    console.log('\n### SAMPLE APPOINTMENTS ###');
    for (const appt of allAppts.slice(0, 10)) {
      console.log(`\n  Patient: ${appt.PatientFullName}`);
      console.log(`  DateTime: ${appt.AppointmentDateTime}`);
      console.log(`  Type: ${appt.AppointmentTypeDescription}`);
      console.log(`  Status: ${appt.apptstDescription}`);
      console.log(`  Chair: ${appt.Chair}`);
    }
  } else {
    console.log('\n⚠️ Allegheny 300M has ZERO appointments in past 90 days and next 30 days.');
  }
}

main().catch(console.error);
