/**
 * Get Appointment Types and Counts by Location
 *
 * Queries Cloud9 Production API to get appointment types
 * and shows usage statistics per location
 *
 * Usage: node scripts/get-appt-types-by-location.js [locationCode]
 * Examples:
 *   node scripts/get-appt-types-by-location.js         # All locations
 *   node scripts/get-appt-types-by-location.js CDAL    # CDH - Allegheny 300M only
 */

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

function buildRequest(procedure, parameters = '') {
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

async function callApi(procedure, parameters = '') {
  const xml = buildRequest(procedure, parameters);

  const response = await fetch(PROD_CONFIG.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: xml
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

function extractRecords(xml) {
  const records = [];
  const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
  let match;
  while ((match = recordRegex.exec(xml)) !== null) {
    records.push(match[1]);
  }
  return records;
}

function parseRecordFields(recordXml) {
  const fields = {};
  const fieldRegex = /<(\w+)>(.*?)<\/\1>/g;
  let match;
  while ((match = fieldRegex.exec(recordXml)) !== null) {
    fields[match[1]] = match[2];
  }
  return fields;
}

async function getLocations() {
  const xml = await callApi('GetLocations', '<showDeleted>False</showDeleted>');
  const records = extractRecords(xml);
  return records.map(r => parseRecordFields(r));
}

async function getAppointmentTypes() {
  const xml = await callApi('GetAppointmentTypes', '<showDeleted>False</showDeleted>');
  const records = extractRecords(xml);
  return records.map(r => parseRecordFields(r));
}

async function getPatientsByLocation(locGUID) {
  const xml = await callApi('GetPatientList', `<LocGUIDs>${locGUID}</LocGUIDs>`);
  const records = extractRecords(xml);
  return records.map(r => parseRecordFields(r));
}

async function getPatientAppointments(patGUID) {
  const xml = await callApi('GetAppointmentListByPatient', `<patGUID>${patGUID}</patGUID>`);
  const records = extractRecords(xml);
  return records.map(r => parseRecordFields(r));
}

async function main() {
  const targetLocationCode = process.argv[2]?.toUpperCase();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      Cloud9 Orthodontic Appointment Types Analysis             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`Target: ${targetLocationCode || 'ALL LOCATIONS'}\n`);

  try {
    // Step 1: Get all locations
    console.log('Loading locations...');
    const locations = await getLocations();
    console.log(`Found ${locations.length} locations\n`);

    // Step 2: Get all appointment types
    console.log('Loading appointment types...');
    const apptTypes = await getAppointmentTypes();
    console.log(`Found ${apptTypes.length} appointment types\n`);

    // Create appointment type lookup
    const apptTypeMap = new Map();
    for (const t of apptTypes) {
      apptTypeMap.set(t.AppointmentTypeGUID, {
        guid: t.AppointmentTypeGUID,
        code: t.AppointmentTypeCode,
        description: t.AppointmentTypeDescription,
        minutes: t.AppointmentTypeMinutes,
        allowOnline: t.AppointmentTypeAllowOnlineScheduling
      });
    }

    // Filter locations if target specified
    const targetLocations = targetLocationCode
      ? locations.filter(l => l.LocationCode === targetLocationCode)
      : locations;

    if (targetLocationCode && targetLocations.length === 0) {
      console.log(`Location code "${targetLocationCode}" not found.`);
      console.log('Available codes:', locations.map(l => l.LocationCode).join(', '));
      return;
    }

    // Process each location
    for (const location of targetLocations) {
      console.log('═'.repeat(70));
      console.log(`\n📍 ${location.LocationName} (${location.LocationCode})`);
      console.log(`   GUID: ${location.LocationGUID}`);
      console.log(`   ${location.LocationCity}, ${location.LocationState}`);
      console.log('');

      // Get patients at this location
      console.log('   Loading patients...');
      const patients = await getPatientsByLocation(location.LocationGUID);
      console.log(`   Found ${patients.length} patients\n`);

      if (patients.length === 0) {
        console.log('   No patients at this location.\n');
        continue;
      }

      // Get appointments for sample patients (up to 50 for efficiency)
      const samplePatients = patients.slice(0, 50);
      const typeUsage = new Map();
      let totalAppts = 0;

      console.log(`   Analyzing appointments for ${samplePatients.length} patients...`);

      for (const patient of samplePatients) {
        try {
          const appointments = await getPatientAppointments(patient.PatientGUID);
          totalAppts += appointments.length;

          for (const appt of appointments) {
            const typeGUID = appt.AppointmentTypeGUID;
            if (typeGUID) {
              if (typeUsage.has(typeGUID)) {
                typeUsage.get(typeGUID).count++;
              } else {
                const typeInfo = apptTypeMap.get(typeGUID) || { description: 'Unknown' };
                typeUsage.set(typeGUID, {
                  guid: typeGUID,
                  description: typeInfo.description,
                  count: 1
                });
              }
            }
          }
        } catch (err) {
          // Skip errors for individual patients
        }
      }

      console.log(`   Found ${totalAppts} appointments\n`);

      // Display appointment type usage
      const sortedTypes = Array.from(typeUsage.values())
        .sort((a, b) => b.count - a.count);

      console.log(`   Unique Appointment Types: ${sortedTypes.length}`);
      console.log('   ┌───────┬────────────────────────────────────────┬──────────────────────────────────────┐');
      console.log('   │ Count │ Description                            │ AppointmentTypeGUID                  │');
      console.log('   ├───────┼────────────────────────────────────────┼──────────────────────────────────────┤');

      for (const type of sortedTypes) {
        const count = String(type.count).padStart(5);
        const desc = type.description.substring(0, 38).padEnd(38);
        console.log(`   │ ${count} │ ${desc} │ ${type.guid} │`);
      }

      console.log('   └───────┴────────────────────────────────────────┴──────────────────────────────────────┘');
      console.log('');
    }

    // Summary of all appointment types
    if (!targetLocationCode) {
      console.log('\n\n═'.repeat(70));
      console.log('📋 ALL AVAILABLE APPOINTMENT TYPES (Global)');
      console.log('═'.repeat(70));
      console.log('┌───────┬────────────────────────────────────────┬──────────────────────────────────────┬────────┐');
      console.log('│ Mins  │ Description                            │ AppointmentTypeGUID                  │ Online │');
      console.log('├───────┼────────────────────────────────────────┼──────────────────────────────────────┼────────┤');

      for (const t of apptTypes) {
        const mins = String(t.AppointmentTypeMinutes || '').padStart(5);
        const desc = (t.AppointmentTypeDescription || '').substring(0, 38).padEnd(38);
        const online = t.AppointmentTypeAllowOnlineScheduling === 'True' ? 'Yes' : 'No';
        console.log(`│ ${mins} │ ${desc} │ ${t.AppointmentTypeGUID} │ ${online.padEnd(6)} │`);
      }

      console.log('└───────┴────────────────────────────────────────┴──────────────────────────────────────┴────────┘');
    }

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
