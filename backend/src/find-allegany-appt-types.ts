/**
 * Find Appointment Types at CDH - Allegheny 300M Chair 8
 *
 * Strategy:
 * 1. Get patients at Allegheny 300M using GetPatientList
 * 2. Get appointments for those patients
 * 3. Extract AppointmentTypeGUIDs
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
  schdcolGUID: 'dda0b40c-ace5-4427-8b76-493bf9aa26f1',
  schdcolDescription: 'Chair 8'
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
    console.error(`Error calling ${procedure}:`, error.message);
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
  console.log('║  Find Appointment Types & Providers at Allegheny 300M Chair 8 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\nTarget Location:', ALLEGHENY_300M.locName);
  console.log('Target Chair:', ALLEGHENY_300M.schdcolDescription);
  console.log('LocationGUID:', ALLEGHENY_300M.locGUID);
  console.log('schdvwGUID:', ALLEGHENY_300M.schdvwGUID);
  console.log('schdcolGUID (Chair 8):', ALLEGHENY_300M.schdcolGUID);
  console.log('\nCurrent UTC Time:', new Date().toISOString());

  try {
    // Step 1: Get ALL Appointment Types (global)
    console.log('\n\n### STEP 1: Get All Appointment Types ###');
    const typesXml = await callApi('GetAppointmentTypes', '<showDeleted>False</showDeleted>');

    const typeRecords = extractRecords(typesXml);
    console.log(`Found ${typeRecords.length} appointment types`);

    const appointmentTypes: Array<Record<string, string>> = [];
    for (const record of typeRecords) {
      appointmentTypes.push(parseRecordFields(record));
    }

    console.log('\n📋 APPOINTMENT TYPES (available for Chair 8):');
    console.log('=' .repeat(70));
    for (const t of appointmentTypes.slice(0, 20)) {
      console.log(`\n  AppointmentTypeGUID: ${t.AppointmentTypeGUID}`);
      console.log(`  Description: ${t.AppointmentTypeDescription}`);
      console.log(`  Minutes: ${t.AppointmentTypeMinutes}`);
      console.log(`  AllowOnlineScheduling: ${t.AppointmentTypeAllowOnlineScheduling}`);
    }

    // Step 2: Get Providers/Doctors
    console.log('\n\n### STEP 2: Get Providers (Doctors) ###');
    const providersXml = await callApi('GetProviderList', '');

    const providerRecords = extractRecords(providersXml);
    console.log(`Found ${providerRecords.length} providers`);

    const allProviders: Array<Record<string, string>> = [];
    for (const record of providerRecords) {
      allProviders.push(parseRecordFields(record));
    }

    console.log('\n👨‍⚕️ PROVIDERS (Doctors):');
    console.log('=' .repeat(70));
    for (const p of allProviders) {
      console.log(`\n  ProviderGUID: ${p.ProviderGUID || p.provGUID}`);
      console.log(`  Name: ${p.ProviderName || p.provName}`);
      console.log(`  Code: ${p.ProviderCode || p.provCode}`);
      console.log(`  Specialty: ${p.ProviderSpecialty || p.provSpecialty || 'N/A'}`);
    }

    // Step 3: Get Chair Schedules for Allegheny 300M to find associated providers
    console.log('\n\n### STEP 3: Get Chair 8 Schedule Details ###');
    const chairsXml = await callApi('GetChairSchedules', '');
    const chairRecords = extractRecords(chairsXml);

    const alleghenyChair8: Array<Record<string, string>> = [];
    for (const record of chairRecords) {
      const chair = parseRecordFields(record);
      if (chair.locGUID === ALLEGHENY_300M.locGUID && chair.schdcolDescription === 'Chair 8') {
        alleghenyChair8.push(chair);
      }
    }

    console.log('\n🪑 CHAIR 8 AT ALLEGHENY 300M:');
    console.log('=' .repeat(70));
    for (const c of alleghenyChair8) {
      console.log(JSON.stringify(c, null, 2));
    }

    // Step 4: Get patients at Allegheny 300M
    console.log('\n\n### STEP 4: Get Patients at Allegheny 300M ###');
    const patientsXml = await callApi('GetPatientList',
      `<LocGUIDs>${ALLEGHENY_300M.locGUID}</LocGUIDs>`
    );

    const patientRecords = extractRecords(patientsXml);
    console.log(`Found ${patientRecords.length} patients at Allegheny 300M`);

    const patients: Array<Record<string, string>> = [];
    for (const record of patientRecords) {
      patients.push(parseRecordFields(record));
    }

    // Show first 5 patients
    console.log('\nSample patients:');
    for (const p of patients.slice(0, 5)) {
      console.log(`  - ${p.PatientFirstName} ${p.PatientLastName} (${p.PatientGUID})`);
    }

    // Step 5: Get appointments for patients to find real appointment data
    console.log('\n\n### STEP 5: Get Appointments for Patients ###');

    const allAppointments: Array<Record<string, string>> = [];
    const appointmentTypeMap = new Map<string, { guid: string; description: string; count: number }>();
    const providerMap = new Map<string, { guid: string; name: string; count: number }>();

    // Query all patients to get sample appointments
    for (const patient of patients) {
      const patGUID = patient.PatientGUID;
      if (!patGUID) continue;

      try {
        const apptsXml = await callApi('GetAppointmentListByPatient',
          `<patGUID>${patGUID}</patGUID>`
        );

        const apptRecords = extractRecords(apptsXml);

        for (const record of apptRecords) {
          const appt = parseRecordFields(record);
          allAppointments.push(appt);

          // Track appointment types
          const typeGUID = appt.AppointmentTypeGUID;
          const typeDesc = appt.AppointmentTypeDescription;

          if (typeGUID) {
            if (appointmentTypeMap.has(typeGUID)) {
              appointmentTypeMap.get(typeGUID)!.count++;
            } else {
              appointmentTypeMap.set(typeGUID, {
                guid: typeGUID,
                description: typeDesc || 'Unknown',
                count: 1
              });
            }
          }

          // Track providers/orthodontists
          const orthoGUID = appt.OrthodontistGUID;
          const orthoName = appt.OrthodontistName;

          if (orthoGUID) {
            if (providerMap.has(orthoGUID)) {
              providerMap.get(orthoGUID)!.count++;
            } else {
              providerMap.set(orthoGUID, {
                guid: orthoGUID,
                name: orthoName || 'Unknown',
                count: 1
              });
            }
          }
        }
      } catch (err) {
        // Skip errors for individual patients
      }
    }

    console.log(`\nFound ${allAppointments.length} total appointments for Allegheny 300M patients`);

    // Step 6: Display appointment types found in patient appointments
    console.log('\n\n### APPOINTMENT TYPES USED BY ALLEGHENY 300M PATIENTS ###');
    console.log('=' .repeat(70));

    const sortedTypes = Array.from(appointmentTypeMap.values())
      .sort((a, b) => b.count - a.count);

    for (const type of sortedTypes) {
      console.log(`\nAppointmentTypeGUID: ${type.guid}`);
      console.log(`Description: ${type.description}`);
      console.log(`Count: ${type.count} appointments`);
    }

    // Step 7: Display providers/orthodontists from appointments
    console.log('\n\n### PROVIDERS (ORTHODONTISTS) FOR ALLEGHENY 300M PATIENTS ###');
    console.log('=' .repeat(70));

    const sortedProviders = Array.from(providerMap.values())
      .sort((a, b) => b.count - a.count);

    for (const prov of sortedProviders) {
      console.log(`\nOrthodontistGUID: ${prov.guid}`);
      console.log(`Name: ${prov.name}`);
      console.log(`Count: ${prov.count} appointments`);
    }

    // Step 8: Show sample appointments with full details
    console.log('\n\n### SAMPLE APPOINTMENTS WITH ALL GUIDS ###');
    console.log('=' .repeat(70));

    for (const appt of allAppointments.slice(0, 10)) {
      console.log('\n' + '-'.repeat(60));
      console.log(`Patient: ${appt.PatientFirstName} ${appt.PatientLastName}`);
      console.log(`PatientGUID: ${appt.PatientGUID}`);
      console.log(`AppointmentGUID: ${appt.AppointmentGUID}`);
      console.log(`AppointmentDateTime: ${appt.AppointmentDateTime}`);
      console.log(`AppointmentTypeGUID: ${appt.AppointmentTypeGUID}`);
      console.log(`AppointmentTypeDescription: ${appt.AppointmentTypeDescription}`);
      console.log(`AppointmentMinutes: ${appt.AppointmentMinutes}`);
      console.log(`AppointmentStatus: ${appt.AppointmentStatusDescription}`);
      console.log(`OrthodontistGUID: ${appt.OrthodontistGUID}`);
      console.log(`OrthodontistName: ${appt.OrthodontistName}`);
      console.log(`LocationGUID: ${appt.LocationGUID}`);
      console.log(`LocationName: ${appt.LocationName}`);
    }

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      target: ALLEGHENY_300M,
      allAppointmentTypes: appointmentTypes,
      allProviders,
      chair8Details: alleghenyChair8,
      patientCount: patients.length,
      appointmentCount: allAppointments.length,
      appointmentTypesUsed: sortedTypes,
      providersUsed: sortedProviders,
      sampleAppointments: allAppointments.slice(0, 20)
    };

    fs.writeFileSync('./allegany-appt-types.json', JSON.stringify(results, null, 2));
    console.log('\n\n✅ Results saved to: ./allegany-appt-types.json');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

main().catch(console.error);
