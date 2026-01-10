/**
 * Query sample patients from CDH - Allegheny 202 and get their appointments
 */

import axios from 'axios';
import * as fs from 'fs';

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

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
    timeout: 30000
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
  console.log('║  Query Allegheny 202 Sample Patients & Appointments           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\nTarget:', ALLEGHENY_202.locName);
  console.log('LocationGUID:', ALLEGHENY_202.locGUID);

  try {
    // Get patients at Allegheny 202
    console.log('\n### Step 1: Get Sample Patients ###');
    const patientsXml = await callApi('GetPatientList', `<LocGUIDs>${ALLEGHENY_202.locGUID}</LocGUIDs>`);
    const patientRecords = extractRecords(patientsXml);

    console.log(`Total patients at Allegheny 202: ${patientRecords.length}`);

    const patients: Array<Record<string, string>> = [];
    for (const record of patientRecords) {
      patients.push(parseRecordFields(record));
    }

    // Query appointments for first 100 patients
    console.log('\n### Step 2: Query Appointments for First 100 Patients ###');
    const allAppts: Array<Record<string, string>> = [];
    const sampleSize = Math.min(100, patients.length);

    for (let i = 0; i < sampleSize; i++) {
      const patient = patients[i];
      const patGUID = patient.PatientGUID;
      if (!patGUID) continue;

      process.stdout.write(`\r  Querying patient ${i + 1}/${sampleSize}...`);

      try {
        const apptsXml = await callApi('GetAppointmentListByPatient', `<patGUID>${patGUID}</patGUID>`);
        const apptRecords = extractRecords(apptsXml);

        for (const record of apptRecords) {
          const appt = parseRecordFields(record);
          allAppts.push(appt);
        }
      } catch (err) {
        // Skip errors
      }
    }

    console.log(`\n\n📍 Total appointments found: ${allAppts.length}`);

    if (allAppts.length > 0) {
      // Track types and providers
      const typeMap = new Map<string, { guid: string; desc: string; count: number }>();
      const provMap = new Map<string, { guid: string; name: string; count: number }>();

      console.log('\n### SAMPLE APPOINTMENTS ###');
      console.log('='.repeat(60));

      for (const appt of allAppts.slice(0, 10)) {
        console.log(`\n  Patient: ${appt.PatientFirstName} ${appt.PatientLastName}`);
        console.log(`  PatientGUID: ${appt.PatientGUID}`);
        console.log(`  AppointmentGUID: ${appt.AppointmentGUID}`);
        console.log(`  DateTime: ${appt.AppointmentDateTime}`);
        console.log(`  Type: ${appt.AppointmentTypeDescription}`);
        console.log(`  AppointmentTypeGUID: ${appt.AppointmentTypeGUID}`);
        console.log(`  Minutes: ${appt.AppointmentMinutes}`);
        console.log(`  Status: ${appt.AppointmentStatusDescription}`);
        console.log(`  Doctor: ${appt.OrthodontistName}`);
        console.log(`  OrthodontistGUID: ${appt.OrthodontistGUID}`);
        console.log(`  Location: ${appt.LocationName}`);
        console.log(`  LocationGUID: ${appt.LocationGUID}`);
      }

      // Track types and providers
      for (const appt of allAppts) {
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
      console.log('\n\n### APPOINTMENT TYPES ###');
      const sortedTypes = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);
      for (const t of sortedTypes.slice(0, 15)) {
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
      fs.writeFileSync('./allegheny-202-results.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        target: ALLEGHENY_202,
        patientsQueried: sampleSize,
        totalPatients: patients.length,
        appointmentCount: allAppts.length,
        appointmentTypes: sortedTypes,
        providers: sortedProvs,
        sampleAppointments: allAppts.slice(0, 50)
      }, null, 2));

      console.log('\n\n✅ Results saved to: ./allegheny-202-results.json');

    } else {
      console.log('\n⚠️ No appointments found for the sampled patients.');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

main().catch(console.error);
