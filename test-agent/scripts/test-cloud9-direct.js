/**
 * Test Cloud9 API directly (bypass Node Red)
 */
const fetch = require('node-fetch');

// Cloud9 Sandbox credentials
const SANDBOX_ENDPOINT = 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx';
const CLIENT_ID = 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56';
const USERNAME = 'IntelepeerTest';
const PASSWORD = '#!InteleP33rTest!#';

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
    const response = await fetch(SANDBOX_ENDPOINT, {
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
  console.log('Testing Cloud9 Sandbox API Directly');
  console.log('Endpoint:', SANDBOX_ENDPOINT);
  console.log('Client ID:', CLIENT_ID);

  // Test 1: Get locations (basic connectivity test)
  await callCloud9('GetLocations', '', 'Test 1: GetLocations');

  // Test 2: Get providers
  await callCloud9('GetProviders', '', 'Test 2: GetProviders');

  // Test 3: Get appointment types
  await callCloud9('GetApptTypes', '', 'Test 3: GetApptTypes');

  // Test 4: Get schedule views (needed for availability)
  await callCloud9('GetScheduleViews', '', 'Test 4: GetScheduleViews');

  // Test 5: Get online reservations (available slots) for Jan 13-27
  const slotsParams = `
    <startDate>01/13/2026 7:00:00 AM</startDate>
    <endDate>01/27/2026 5:00:00 PM</endDate>
    <morning>True</morning>
    <afternoon>True</afternoon>
  `;
  await callCloud9('GetOnlineReservations', slotsParams, 'Test 5: GetOnlineReservations (Jan 13-27)');

  // Test 6: Try with specific schedule view GUID
  const slotsParamsWithGuid = `
    <startDate>01/13/2026 7:00:00 AM</startDate>
    <endDate>01/27/2026 5:00:00 PM</endDate>
    <morning>True</morning>
    <afternoon>True</afternoon>
    <schdvwGUIDs>2544683a-8e79-4b32-a4d4-bf851996bac3</schdvwGUIDs>
  `;
  await callCloud9('GetOnlineReservations', slotsParamsWithGuid, 'Test 6: GetOnlineReservations with Schedule View GUID');

  // Test 7: Try February dates
  const febParams = `
    <startDate>02/01/2026 7:00:00 AM</startDate>
    <endDate>02/28/2026 5:00:00 PM</endDate>
    <morning>True</morning>
    <afternoon>True</afternoon>
  `;
  await callCloud9('GetOnlineReservations', febParams, 'Test 7: GetOnlineReservations (Feb 2026)');
}

main().catch(console.error);
