/**
 * Find ALL Allegheny locations and their appointments
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
  console.log('║  Find ALL Allegheny Locations & Their Appointments            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Get all locations and find Allegheny ones
    console.log('\n### Step 1: Find All Allegheny Locations ###');
    const locXml = await callApi('GetLocations', '<showDeleted>False</showDeleted>');
    const locRecords = extractRecords(locXml);

    const alleghenyLocs: Array<{ guid: string; name: string }> = [];
    for (const record of locRecords) {
      const loc = parseRecordFields(record);
      const name = loc.LocationName || loc.locName || '';
      if (name.toLowerCase().includes('allegh')) {
        alleghenyLocs.push({
          guid: loc.LocationGUID || loc.locGUID || '',
          name: name
        });
        console.log(`  Found: ${name} (${loc.LocationGUID || loc.locGUID})`);
      }
    }

    console.log(`\nTotal Allegheny locations: ${alleghenyLocs.length}`);

    // Step 2: For each Allegheny location, get patients and their appointments
    const allResults: Record<string, any> = {};

    for (const loc of alleghenyLocs) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Querying: ${loc.name}`);
      console.log(`LocationGUID: ${loc.guid}`);
      console.log('='.repeat(60));

      // Get patients at this location
      const patientsXml = await callApi('GetPatientList', `<LocGUIDs>${loc.guid}</LocGUIDs>`);
      const patientRecords = extractRecords(patientsXml);

      const patients: Array<Record<string, string>> = [];
      for (const record of patientRecords) {
        patients.push(parseRecordFields(record));
      }

      console.log(`  Patients at location: ${patients.length}`);

      // Get appointments for each patient
      const appointments: Array<Record<string, string>> = [];
      let patientCount = 0;

      for (const patient of patients) {
        const patGUID = patient.PatientGUID;
        if (!patGUID) continue;

        patientCount++;
        process.stdout.write(`\r  Querying patient ${patientCount}/${patients.length}...`);

        try {
          const apptsXml = await callApi('GetAppointmentListByPatient', `<patGUID>${patGUID}</patGUID>`);
          const apptRecords = extractRecords(apptsXml);

          for (const record of apptRecords) {
            const appt = parseRecordFields(record);
            appt.SourceLocation = loc.name;
            appt.SourceLocationGUID = loc.guid;
            appointments.push(appt);
          }
        } catch (err) {
          // Skip errors
        }
      }

      console.log(`\n  Total appointments found: ${appointments.length}`);

      if (appointments.length > 0) {
        // Show sample appointments
        console.log('\n  Sample appointments:');
        for (const appt of appointments.slice(0, 5)) {
          console.log(`\n  - Patient: ${appt.PatientFirstName} ${appt.PatientLastName}`);
          console.log(`    DateTime: ${appt.AppointmentDateTime}`);
          console.log(`    Type: ${appt.AppointmentTypeDescription}`);
          console.log(`    Status: ${appt.AppointmentStatusDescription}`);
          console.log(`    Doctor: ${appt.OrthodontistName}`);
          console.log(`    AppointmentGUID: ${appt.AppointmentGUID}`);
        }
      }

      allResults[loc.name] = {
        locationGUID: loc.guid,
        patientCount: patients.length,
        appointmentCount: appointments.length,
        appointments: appointments
      };
    }

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('SUMMARY: Allegheny Locations Appointment Counts');
    console.log('='.repeat(60));

    for (const [locName, data] of Object.entries(allResults)) {
      const d = data as any;
      console.log(`\n${locName}:`);
      console.log(`  Patients: ${d.patientCount}`);
      console.log(`  Appointments: ${d.appointmentCount}`);
    }

    // Save results
    fs.writeFileSync('./allegheny-all-locations.json', JSON.stringify(allResults, null, 2));
    console.log('\n\n✅ Results saved to: ./allegheny-all-locations.json');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

main().catch(console.error);
