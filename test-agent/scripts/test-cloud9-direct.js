/**
 * Test Cloud9 API directly (bypass Node Red)
 * Testing PROD credentials with different parameter variations
 */
const fetch = require('node-fetch');

// Cloud9 PROD credentials
const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CLIENT_ID = 'b42c51be-2529-4d31-92cb-50fd1a58c084';
const USERNAME = 'Intelepeer';
const PASSWORD = '$#1Nt-p33R-AwS#$';

// Target GUIDs
const TARGET_SV = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';

function buildXmlRequest(procedure, params = '') {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
  <ClientID>${CLIENT_ID}</ClientID>
  <UserName>${USERNAME}</UserName>
  <Password>${PASSWORD}</Password>
  <Procedure>${procedure}</Procedure>
  <Parameters>
    ${params}
  </Parameters>
</GetDataRequest>`;
}

async function callCloud9(procedure, params = '', label = '') {
  console.log(`\n=== ${label || procedure} ===`);

  const xml = buildXmlRequest(procedure, params);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xml
    });

    const text = await response.text();
    console.log(`Status: ${response.status}`);

    // Parse response status
    const statusMatch = text.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    console.log(`Response Status: ${statusMatch ? statusMatch[1] : 'unknown'}`);

    // Count records
    const recordCount = (text.match(/<Record>/g) || []).length;
    console.log(`Records found: ${recordCount}`);

    // Check for errors
    const errorMatch = text.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
    if (errorMatch) {
      console.log(`Error Code: ${errorMatch[1]}`);
      const errorMsgMatch = text.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
      if (errorMsgMatch) console.log(`Error Message: ${errorMsgMatch[1]}`);
    }

    // Show sample if there are records
    if (recordCount > 0 && recordCount <= 5) {
      console.log('\nResponse (truncated):');
      console.log(text.substring(0, 2000));
    }

    return { status: response.status, recordCount, text };
  } catch (e) {
    console.log('Request failed:', e.message);
    return null;
  }
}

async function main() {
  console.log('=== CLOUD9 PROD API - PARAMETER VARIATIONS TEST ===');
  console.log('Endpoint:', ENDPOINT);
  console.log('Target ScheduleViewGUID:', TARGET_SV);
  console.log('');

  // Base date params
  const baseDates = `
    <startDate>01/14/2026 7:00:00 AM</startDate>
    <endDate>03/15/2026 5:00:00 PM</endDate>
    <morning>True</morning>
    <afternoon>True</afternoon>`;

  // Test 1: No filter (baseline)
  await callCloud9('GetOnlineReservations', baseDates, 'Test 1: NO FILTER (baseline)');

  // Test 2: schdvwGUIDs (plural - current usage)
  await callCloud9('GetOnlineReservations', baseDates + `
    <schdvwGUIDs>${TARGET_SV}</schdvwGUIDs>`, 'Test 2: schdvwGUIDs (plural)');

  // Test 3: schdvwGUID (singular)
  await callCloud9('GetOnlineReservations', baseDates + `
    <schdvwGUID>${TARGET_SV}</schdvwGUID>`, 'Test 3: schdvwGUID (singular)');

  // Test 4: ScheduleViewGUID
  await callCloud9('GetOnlineReservations', baseDates + `
    <ScheduleViewGUID>${TARGET_SV}</ScheduleViewGUID>`, 'Test 4: ScheduleViewGUID');

  // Test 5: scheduleViewGUID (camelCase)
  await callCloud9('GetOnlineReservations', baseDates + `
    <scheduleViewGUID>${TARGET_SV}</scheduleViewGUID>`, 'Test 5: scheduleViewGUID (camelCase)');

  // Test 6: schdvwGUIDs with pipe separator
  await callCloud9('GetOnlineReservations', baseDates + `
    <schdvwGUIDs>${TARGET_SV}|</schdvwGUIDs>`, 'Test 6: schdvwGUIDs with pipe');

  console.log('\n=== SUMMARY ===');
  console.log('If all filtered tests return 0 but baseline has records,');
  console.log('the Cloud9 API may not support filtering by schedule view GUID.');
}

main().catch(console.error);
