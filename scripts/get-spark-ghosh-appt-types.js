/**
 * Get Appointment Types and Counts for Spark and Ghosh Locations
 *
 * Queries the last 90 days of appointments
 *
 * Usage: node scripts/get-spark-ghosh-appt-types.js
 */

const PROD_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'Intelepeer',
  password: '$#1Nt-p33R-AwS#$'
};

// Spark, Ghosh, Werner, and TRI locations from production
const TARGET_LOCATIONS = [
  // Spark - 9 locations (PA)
  { code: 'SPAY', name: 'Spark - York', guid: '5f133a58-20ac-4b75-87ec-0ffc00e58912', brand: 'Spark' },
  { code: 'SPAH', name: 'Spark - Hazleton', guid: '4b070305-3ea3-424c-8128-116b64cf468c', brand: 'Spark' },
  { code: 'SPAP', name: 'Spark - Pottsville', guid: '204d556b-4c90-41bb-877d-139e567ff3db', brand: 'Spark' },
  { code: 'SPHA', name: 'Spark - Harrisburg', guid: '0a7eadb5-8b53-49ae-9b93-2bbae792d821', brand: 'Spark' },
  { code: 'SPAL', name: 'Spark - Lancaster', guid: '62221d12-bd6e-4cd0-a476-3837820efe05', brand: 'Spark' },
  { code: 'SPAR', name: 'Spark - Reading', guid: '98b182f7-1e25-47b3-8da4-ab15a523e312', brand: 'Spark' },
  { code: 'SPAC', name: 'Spark - Camp Hill', guid: 'fb75221c-4d05-4651-b75f-e2b85379ba9f', brand: 'Spark' },
  { code: 'SPAD', name: 'Spark - Danville', guid: 'ed37df93-751c-49b2-a56f-ed73ee6834d9', brand: 'Spark' },
  { code: 'SPAB', name: 'Spark - Bethlehem', guid: '9eff2d8e-9c2a-434c-99d4-fa1f895e8070', brand: 'Spark' },

  // Ghosh - 2 locations (PA)
  { code: 'G2', name: 'Ghosh - Pottsville', guid: 'e11c7c3b-6208-4e89-ac61-16a8f0723591', brand: 'Ghosh' },
  { code: 'G3', name: 'Ghosh - Allentown', guid: '3eb99533-bed9-46f2-b03f-aeb57e395446', brand: 'Ghosh' },

  // Werner - 2 locations (IN)
  { code: 'W1', name: 'Werner - Indianapolis', guid: '59ea4a3a-babf-4015-b48c-b495a1b6d3a3', brand: 'Werner' },
  { code: 'W2', name: 'Werner - Greenfield', guid: '8be49cdc-4def-4119-b97d-b28565255ace', brand: 'Werner' },

  // TRI - 2 locations (VA/TN)
  { code: 'TBR', name: 'TRI - Bristol', guid: 'b5bf80e4-cc35-45b7-84f7-e6db4857266a', brand: 'TRI' },
  { code: 'TKP', name: 'TRI - Kingsport', guid: '1df68fd3-63b2-4256-8b60-e9b7a79b8072', brand: 'TRI' },
];

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

function formatDate(d) {
  // Use UTC to avoid timezone issues
  return `${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCDate().toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getScheduleViews() {
  const xml = await callApi('GetChairSchedules', '');
  const records = extractRecords(xml);
  return records.map(r => parseRecordFields(r));
}

async function getAppointmentsByDateAndView(startDate, endDate, schdvwGUID) {
  const xml = await callApi('GetAppointmentsByDate',
    `<dtAppointment>${formatDate(startDate)}</dtAppointment>
     <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>
     <schdvwGUID>${schdvwGUID}</schdvwGUID>`
  );
  const records = extractRecords(xml);
  return records.map(r => parseRecordFields(r));
}

async function getAppointmentsByDate(startDate, endDate) {
  const xml = await callApi('GetAppointmentListByDate',
    `<dtAppointment>${formatDate(startDate)}</dtAppointment>
     <dtAppointmentEnd>${formatDate(endDate)}</dtAppointmentEnd>`
  );
  const records = extractRecords(xml);
  return records.map(r => parseRecordFields(r));
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   Orthodontic Appointment Types by Location (Last 120 Days)              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  const now = new Date();
  console.log(`\nTimestamp: ${now.toISOString()}`);

  // Calculate date range - last 120 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 120);

  console.log(`\nDate Range: ${formatDate(startDate)} to ${formatDate(endDate)} (120 days)`);
  console.log(`\nTarget Locations: ${TARGET_LOCATIONS.length}`);
  console.log('  - Spark Orthodontics: 9 locations (PA)');
  console.log('  - Ghosh Orthodontics: 2 locations (PA)');
  console.log('  - Werner Orthodontics: 2 locations (IN)');
  console.log('  - TRI Orthodontics: 2 locations (VA/TN)');

  try {
    // Get schedule views to map locations
    console.log('\n\nLoading schedule views...');
    const scheduleViews = await getScheduleViews();
    console.log(`Found ${scheduleViews.length} schedule views`);

    // Create location GUID to schedule view mapping
    const locToViews = new Map();
    for (const view of scheduleViews) {
      const locGUID = view.locGUID;
      if (!locToViews.has(locGUID)) {
        locToViews.set(locGUID, []);
      }
      locToViews.get(locGUID).push(view);
    }

    // Create location GUID set for filtering
    const targetLocGUIDs = new Set(TARGET_LOCATIONS.map(l => l.guid));

    // Get schedule views for target locations
    const targetViews = scheduleViews.filter(v => targetLocGUIDs.has(v.locGUID));
    console.log(`Found ${targetViews.length} schedule views for Spark/Ghosh locations`);

    // Get appointments using GetAppointmentsByDate for each schedule view
    // API has ~90 day limit per query, so we need to chunk the date range
    console.log('\nLoading appointments by schedule view (chunked by 85-day periods)...');
    const allAppointments = [];

    // Split date range into 85-day chunks (leaving margin under 90-day limit)
    const chunks = [];
    let chunkStart = new Date(startDate);
    while (chunkStart < endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + 85);
      if (chunkEnd > endDate) {
        chunkEnd.setTime(endDate.getTime());
      }
      chunks.push({ start: new Date(chunkStart), end: new Date(chunkEnd) });
      chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() + 1);
    }

    console.log(`  Using ${chunks.length} date chunks to cover ${Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))} days`);

    // Get unique schedule view GUIDs (avoid duplicates)
    const uniqueViews = [...new Map(targetViews.map(v => [v.schdvwGUID, v])).values()];
    console.log(`  Querying ${uniqueViews.length} unique schedule views...`);

    for (const view of uniqueViews) {
      let viewTotal = 0;
      for (const chunk of chunks) {
        try {
          const viewAppts = await getAppointmentsByDateAndView(chunk.start, chunk.end, view.schdvwGUID);
          allAppointments.push(...viewAppts);
          viewTotal += viewAppts.length;
          // Add delay to avoid rate limiting (1 second between requests)
          await sleep(1000);
        } catch (err) {
          // Skip errors for individual views
        }
      }
      if (viewTotal > 0) {
        console.log(`  ${view.schdvwDescription || view.locName}: ${viewTotal} appointments`);
      }
    }

    console.log(`Found ${allAppointments.length} total appointments`);

    // Filter appointments for target locations (should already be filtered but double-check)
    const filteredAppointments = allAppointments.filter(a => targetLocGUIDs.has(a.LocationGUID));
    console.log(`Filtered to ${filteredAppointments.length} appointments for Spark/Ghosh locations`);

    // Process each location
    const results = [];

    for (const location of TARGET_LOCATIONS) {
      const locAppointments = filteredAppointments.filter(a => a.LocationGUID === location.guid);

      // Count appointment types
      const typeUsage = new Map();
      for (const appt of locAppointments) {
        const typeGUID = appt.AppointmentTypeGUID;
        const typeDesc = appt.AppointmentTypeDescription || 'Unknown';

        if (typeGUID) {
          if (typeUsage.has(typeGUID)) {
            typeUsage.get(typeGUID).count++;
          } else {
            typeUsage.set(typeGUID, {
              guid: typeGUID,
              description: typeDesc,
              count: 1
            });
          }
        }
      }

      const sortedTypes = Array.from(typeUsage.values())
        .sort((a, b) => b.count - a.count);

      results.push({
        location,
        totalAppointments: locAppointments.length,
        uniqueTypes: sortedTypes.length,
        types: sortedTypes
      });
    }

    // Helper function to display results for a brand
    function displayBrandResults(brandName, brandResults, regionInfo) {
      console.log('\n\n');
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      console.log(`🦷 ${brandName.toUpperCase()} ORTHODONTICS (${brandResults.length} locations in ${regionInfo})`);
      console.log('═══════════════════════════════════════════════════════════════════════════════');

      for (const result of brandResults) {
        console.log(`\n\n📍 ${result.location.name} (${result.location.code})`);
        console.log(`   GUID: ${result.location.guid}`);
        console.log(`   Total Appointments (120 days): ${result.totalAppointments}`);

        if (result.types.length === 0) {
          console.log('   No appointments found for this location.');
          continue;
        }

        console.log(`   Unique Appointment Types: ${result.uniqueTypes}`);
        console.log('   ┌───────┬────────────────────────────────────────┬──────────────────────────────────────┐');
        console.log('   │ Count │ Description                            │ AppointmentTypeGUID                  │');
        console.log('   ├───────┼────────────────────────────────────────┼──────────────────────────────────────┤');

        for (const type of result.types) {
          const count = String(type.count).padStart(5);
          const desc = type.description.substring(0, 38).padEnd(38);
          console.log(`   │ ${count} │ ${desc} │ ${type.guid} │`);
        }

        console.log('   └───────┴────────────────────────────────────────┴──────────────────────────────────────┘');
      }

      return brandResults.reduce((sum, r) => sum + r.totalAppointments, 0);
    }

    // Display results by brand
    const sparkResults = results.filter(r => r.location.brand === 'Spark');
    const ghoshResults = results.filter(r => r.location.brand === 'Ghosh');
    const wernerResults = results.filter(r => r.location.brand === 'Werner');
    const triResults = results.filter(r => r.location.brand === 'TRI');

    const sparkTotal = displayBrandResults('Spark', sparkResults, 'PA');
    const ghoshTotal = displayBrandResults('Ghosh', ghoshResults, 'PA');
    const wernerTotal = displayBrandResults('Werner', wernerResults, 'IN');
    const triTotal = displayBrandResults('TRI', triResults, 'VA/TN');

    // Summary
    console.log('\n\n');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════════════');

    console.log(`\nSpark Orthodontics:`);
    console.log(`  Locations: ${sparkResults.length}`);
    console.log(`  Total Appointments: ${sparkTotal}`);

    console.log(`\nGhosh Orthodontics:`);
    console.log(`  Locations: ${ghoshResults.length}`);
    console.log(`  Total Appointments: ${ghoshTotal}`);

    console.log(`\nWerner Orthodontics:`);
    console.log(`  Locations: ${wernerResults.length}`);
    console.log(`  Total Appointments: ${wernerTotal}`);

    console.log(`\nTRI Orthodontics:`);
    console.log(`  Locations: ${triResults.length}`);
    console.log(`  Total Appointments: ${triTotal}`);

    console.log(`\nCombined Total: ${sparkTotal + ghoshTotal + wernerTotal + triTotal} appointments`);

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
