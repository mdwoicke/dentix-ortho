/**
 * Find PAST Appointments at CDH - Allegheny 300M
 * Query historical appointment data
 */

import axios from 'axios';
import * as fs from 'fs';

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

// Target: CDH - Allegheny 300M - Chair 8
const ALLEGHENY_300M = {
  locGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6',
  locName: 'CDH - Allegheny 300M',
  schdvwGUID: 'b1946f40-3b0b-4e01-87a9-c5060b88443e',
  schdcolGUID: 'dda0b40c-ace5-4427-8b76-493bf9aa26f1'
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
  try {
    const response = await axios.get(PROD_CONFIG.endpoint, {
      headers: { 'Content-Type': 'application/xml' },
      data: xml,
      timeout: 30000
    });
    return response.data;
  } catch (error: any) {
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
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Find PAST Appointments at CDH - Allegheny 300M               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\nTarget:', ALLEGHENY_300M.locName);
  console.log('LocationGUID:', ALLEGHENY_300M.locGUID);
  console.log('Current UTC:', new Date().toISOString());

  try {
    // Step 1: Get patients at Allegheny 300M
    console.log('\n### Step 1: Get Patients at Allegheny 300M ###');
    const patientsXml = await callApi('GetPatientList', `<LocGUIDs>${ALLEGHENY_300M.locGUID}</LocGUIDs>`);
    const patientRecords = extractRecords(patientsXml);

    const patients: Array<Record<string, string>> = [];
    for (const record of patientRecords) {
      patients.push(parseRecordFields(record));
    }

    console.log(`Found ${patients.length} patients at Allegheny 300M`);

    // Step 2: Get ALL appointments for each patient
    console.log('\n### Step 2: Get ALL Appointments for Each Patient ###');

    const alleghenyAppts: Array<Record<string, string>> = [];

    for (const patient of patients) {
      const patGUID = patient.PatientGUID;
      if (!patGUID) continue;

      console.log(`  Querying patient: ${patient.PatientFirstName} ${patient.PatientLastName}...`);

      try {
        const apptsXml = await callApi('GetAppointmentListByPatient', `<patGUID>${patGUID}</patGUID>`);
        const apptRecords = extractRecords(apptsXml);

        for (const record of apptRecords) {
          const appt = parseRecordFields(record);
          alleghenyAppts.push(appt);
        }

        if (apptRecords.length > 0) {
          console.log(`    Found ${apptRecords.length} appointments`);
        }
      } catch (err) {
        // Skip errors
      }
    }

    console.log(`\n📍 Total appointments found: ${alleghenyAppts.length}`);

    console.log(`\n📍 Allegheny 300M appointments: ${alleghenyAppts.length}`);

    if (alleghenyAppts.length > 0) {
      // Track appointment types and providers
      const typeMap = new Map<string, { guid: string; desc: string; count: number }>();
      const provMap = new Map<string, { guid: string; name: string; count: number }>();

      console.log('\n### PAST APPOINTMENTS AT ALLEGHENY 300M ###');
      console.log('='.repeat(70));

      for (const appt of alleghenyAppts) {
        console.log('\n' + '-'.repeat(60));
        console.log(`Patient: ${appt.PatientFirstName} ${appt.PatientLastName}`);
        console.log(`PatientGUID: ${appt.PatientGUID}`);
        console.log(`AppointmentGUID: ${appt.AppointmentGUID}`);
        console.log(`DateTime: ${appt.AppointmentDateTime}`);
        console.log(`AppointmentTypeGUID: ${appt.AppointmentTypeGUID}`);
        console.log(`AppointmentTypeDescription: ${appt.AppointmentTypeDescription}`);
        console.log(`Minutes: ${appt.AppointmentMinutes}`);
        console.log(`Status: ${appt.AppointmentStatusDescription}`);
        console.log(`OrthodontistGUID: ${appt.OrthodontistGUID}`);
        console.log(`OrthodontistName: ${appt.OrthodontistName}`);
        console.log(`LocationGUID: ${appt.LocationGUID}`);
        console.log(`LocationName: ${appt.LocationName}`);

        // Track types
        if (appt.AppointmentTypeGUID) {
          const key = appt.AppointmentTypeGUID;
          if (typeMap.has(key)) {
            typeMap.get(key)!.count++;
          } else {
            typeMap.set(key, { guid: key, desc: appt.AppointmentTypeDescription || '', count: 1 });
          }
        }

        // Track providers
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
      console.log('\n\n### APPOINTMENT TYPES USED AT ALLEGHENY 300M ###');
      const sortedTypes = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);
      for (const t of sortedTypes) {
        console.log(`\n  AppointmentTypeGUID: ${t.guid}`);
        console.log(`  Description: ${t.desc}`);
        console.log(`  Count: ${t.count}`);
      }

      console.log('\n\n### PROVIDERS AT ALLEGHENY 300M ###');
      const sortedProvs = Array.from(provMap.values()).sort((a, b) => b.count - a.count);
      for (const p of sortedProvs) {
        console.log(`\n  OrthodontistGUID: ${p.guid}`);
        console.log(`  Name: ${p.name}`);
        console.log(`  Count: ${p.count}`);
      }

      // Save results
      fs.writeFileSync('./past-allegheny-appointments.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        target: ALLEGHENY_300M,
        patientCount: patients.length,
        appointmentCount: alleghenyAppts.length,
        appointmentTypes: sortedTypes,
        providers: sortedProvs,
        appointments: alleghenyAppts
      }, null, 2));

      console.log('\n\n✅ Results saved to: ./past-allegheny-appointments.json');

    } else {
      console.log('\n⚠️ No appointments found for Allegheny 300M patients.');
      console.log('\n### Searching other CDH locations for sample data with matching AppointmentTypeGUIDs ###');

      // Target appointment types
      const targetTypes = [
        'db8bc1c2-dfd0-4dd6-989e-23060d82b9b0', // Adjustment - 20 Min
        'f6c20c35-9abb-47c2-981a-342996016705', // Exam - PPO/Self
        'f74b72db-b620-f3ea-b370-6580f9c7a66c'  // Debond - Full Comp
      ];

      // Get appointments from date range
      const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      console.log(`\nQuerying appointments from ${formatDate(startDate)} to ${formatDate(endDate)}...`);

      const dateParams = `<dtAppointment>${formatDate(startDate)}</dtAppointment>
        <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>`;

      const apptsXml = await callApi('GetAppointmentListByDate', dateParams);
      const apptRecords = extractRecords(apptsXml);

      console.log(`Found ${apptRecords.length} appointments`);

      // Find appointments with matching appointment type GUIDs
      const matchingAppts: Array<Record<string, string>> = [];

      for (const record of apptRecords) {
        const appt = parseRecordFields(record);
        if (targetTypes.includes(appt.AppointmentTypeGUID || '')) {
          matchingAppts.push(appt);
        }
      }

      console.log(`\n### SAMPLE APPOINTMENTS WITH TARGET APPOINTMENT TYPES ###`);
      console.log(`Found ${matchingAppts.length} appointments with matching types\n`);

      // Group by type
      for (const typeGuid of targetTypes) {
        const typeAppts = matchingAppts.filter(a => a.AppointmentTypeGUID === typeGuid);
        if (typeAppts.length > 0) {
          const sample = typeAppts[0];
          console.log('='.repeat(70));
          console.log(`AppointmentTypeGUID: ${typeGuid}`);
          console.log(`Description: ${sample.AppointmentTypeDescription}`);
          console.log(`Sample Count: ${typeAppts.length}`);
          console.log('\nSample Appointment:');
          console.log(`  Patient: ${sample.PatientFirstName} ${sample.PatientLastName}`);
          console.log(`  PatientGUID: ${sample.PatientGUID}`);
          console.log(`  AppointmentGUID: ${sample.AppointmentGUID}`);
          console.log(`  DateTime: ${sample.AppointmentDateTime}`);
          console.log(`  Minutes: ${sample.AppointmentMinutes}`);
          console.log(`  Status: ${sample.AppointmentStatusDescription}`);
          console.log(`  OrthodontistGUID: ${sample.OrthodontistGUID}`);
          console.log(`  OrthodontistName: ${sample.OrthodontistName}`);
          console.log(`  LocationGUID: ${sample.LocationGUID}`);
          console.log(`  LocationName: ${sample.LocationName}`);
          console.log('');
        }
      }

      // Save sample results
      fs.writeFileSync('./sample-appointments-by-type.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        note: 'Sample appointments from production matching target AppointmentTypeGUIDs',
        targetLocation: ALLEGHENY_300M,
        targetAppointmentTypes: targetTypes,
        sampleAppointments: matchingAppts.slice(0, 30)
      }, null, 2));

      console.log('\n✅ Sample results saved to: ./sample-appointments-by-type.json');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

main().catch(console.error);
