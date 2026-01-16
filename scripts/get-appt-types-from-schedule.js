/**
 * Get Appointment Types from Scheduled Appointments
 *
 * Uses GetAppointmentListByDate to find actual appointments
 * and extract appointment type usage statistics
 *
 * Usage: node scripts/get-appt-types-from-schedule.js
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

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Cloud9 Appointment Types from Scheduled Appointments         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\nTimestamp: ${new Date().toISOString()}\n`);

  try {
    // Get all appointment types first
    console.log('Loading appointment types...');
    const typesXml = await callApi('GetAppointmentTypes', '<showDeleted>False</showDeleted>');
    const typeRecords = extractRecords(typesXml);
    const apptTypes = typeRecords.map(r => parseRecordFields(r));
    console.log(`Found ${apptTypes.length} appointment types\n`);

    // Create lookup map
    const apptTypeMap = new Map();
    for (const t of apptTypes) {
      apptTypeMap.set(t.AppointmentTypeGUID, t);
    }

    // Get locations
    console.log('Loading locations...');
    const locsXml = await callApi('GetLocations', '<showDeleted>False</showDeleted>');
    const locRecords = extractRecords(locsXml);
    const locations = locRecords.map(r => parseRecordFields(r));
    console.log(`Found ${locations.length} locations\n`);

    // Create location lookup
    const locMap = new Map();
    for (const loc of locations) {
      locMap.set(loc.LocationGUID, loc);
    }

    // Query appointments for last 30 days and next 30 days
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);

    const formatDate = (d) => `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;

    console.log(`Querying appointments from ${formatDate(startDate)} to ${formatDate(endDate)}...`);

    const apptsXml = await callApi('GetAppointmentListByDate',
      `<dtAppointment>${formatDate(startDate)}</dtAppointment>
       <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>`
    );

    const apptRecords = extractRecords(apptsXml);
    const appointments = apptRecords.map(r => parseRecordFields(r));
    console.log(`Found ${appointments.length} appointments\n`);

    // Group by location
    const locationStats = new Map();
    const globalTypeUsage = new Map();

    for (const appt of appointments) {
      const locGUID = appt.LocationGUID;
      const typeGUID = appt.AppointmentTypeGUID;
      const typeDesc = appt.AppointmentTypeDescription || apptTypeMap.get(typeGUID)?.AppointmentTypeDescription || 'Unknown';

      // Global type usage
      if (typeGUID) {
        if (globalTypeUsage.has(typeGUID)) {
          globalTypeUsage.get(typeGUID).count++;
        } else {
          globalTypeUsage.set(typeGUID, {
            guid: typeGUID,
            description: typeDesc,
            count: 1
          });
        }
      }

      // Per-location stats
      if (locGUID) {
        if (!locationStats.has(locGUID)) {
          const locInfo = locMap.get(locGUID);
          locationStats.set(locGUID, {
            guid: locGUID,
            name: locInfo?.LocationName || appt.LocationName || 'Unknown',
            code: locInfo?.LocationCode || 'N/A',
            city: locInfo?.LocationCity || '',
            state: locInfo?.LocationState || '',
            appointmentCount: 0,
            typeUsage: new Map()
          });
        }

        const locStat = locationStats.get(locGUID);
        locStat.appointmentCount++;

        if (typeGUID) {
          if (locStat.typeUsage.has(typeGUID)) {
            locStat.typeUsage.get(typeGUID).count++;
          } else {
            locStat.typeUsage.set(typeGUID, {
              guid: typeGUID,
              description: typeDesc,
              count: 1
            });
          }
        }
      }
    }

    // Show global appointment type usage
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('📊 GLOBAL APPOINTMENT TYPE USAGE (Last 30 days + Next 30 days)');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const sortedGlobalTypes = Array.from(globalTypeUsage.values())
      .sort((a, b) => b.count - a.count);

    console.log(`Unique Appointment Types: ${sortedGlobalTypes.length}`);
    console.log('┌───────┬────────────────────────────────────────┬──────────────────────────────────────┐');
    console.log('│ Count │ Description                            │ AppointmentTypeGUID                  │');
    console.log('├───────┼────────────────────────────────────────┼──────────────────────────────────────┤');

    for (const type of sortedGlobalTypes) {
      const count = String(type.count).padStart(5);
      const desc = type.description.substring(0, 38).padEnd(38);
      console.log(`│ ${count} │ ${desc} │ ${type.guid} │`);
    }

    console.log('└───────┴────────────────────────────────────────┴──────────────────────────────────────┘');

    // Check which locations are orthodontic based on "Adjustment" appointments
    const orthoLocations = [];
    const nonOrthoLocations = [];

    for (const [locGUID, stats] of locationStats) {
      const hasAdjustment = Array.from(stats.typeUsage.values())
        .some(t => t.description.toLowerCase().includes('adjustment'));

      if (hasAdjustment) {
        orthoLocations.push(stats);
      } else {
        nonOrthoLocations.push(stats);
      }
    }

    // Show orthodontic locations
    console.log('\n\n═══════════════════════════════════════════════════════════════════════');
    console.log('🦷 ORTHODONTIC LOCATIONS (have "Adjustment" appointment types)');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    orthoLocations.sort((a, b) => b.appointmentCount - a.appointmentCount);

    for (const loc of orthoLocations) {
      console.log(`\n📍 ${loc.name} (${loc.code})`);
      console.log(`   GUID: ${loc.guid}`);
      console.log(`   ${loc.city}, ${loc.state}`);
      console.log(`   Total Appointments: ${loc.appointmentCount}`);

      const sortedTypes = Array.from(loc.typeUsage.values())
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
    }

    // Show non-orthodontic locations if any
    if (nonOrthoLocations.length > 0) {
      console.log('\n\n═══════════════════════════════════════════════════════════════════════');
      console.log('❓ OTHER LOCATIONS (no "Adjustment" appointments found)');
      console.log('═══════════════════════════════════════════════════════════════════════\n');

      for (const loc of nonOrthoLocations) {
        console.log(`• ${loc.name} (${loc.code}) - ${loc.appointmentCount} appointments`);
      }
    }

    // Summary
    console.log('\n\n═══════════════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`Total Appointments Analyzed: ${appointments.length}`);
    console.log(`Total Locations with Appointments: ${locationStats.size}`);
    console.log(`Orthodontic Locations: ${orthoLocations.length}`);
    console.log(`Other Locations: ${nonOrthoLocations.length}`);
    console.log(`Unique Appointment Types Used: ${globalTypeUsage.size}`);

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
