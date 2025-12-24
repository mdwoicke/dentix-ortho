const https = require('https');

const SANDBOX_URL = 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx';
const CLIENT_ID = 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56';
const USERNAME = 'IntelepeerTest';
const PASSWORD = '#!InteleP33rTest!#';

// Helper function to make API request
function makeRequest(xmlBody) {
  return new Promise((resolve, reject) => {
    const url = new URL(SANDBOX_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xmlBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.write(xmlBody);
    req.end();
  });
}

// Step 1: Lookup patient by name to get patGUID
async function lookupPatient(patientName) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>${CLIENT_ID}</ClientID>
    <UserName>${USERNAME}</UserName>
    <Password>${PASSWORD}</Password>
    <Procedure>GetPortalPatientLookup</Procedure>
    <Parameters>
        <filter>${patientName}</filter>
        <lookupByPatient>1</lookupByPatient>
        <pageIndex>1</pageIndex>
        <pageSize>25</pageSize>
    </Parameters>
</GetDataRequest>`;

  console.log('Step 1: Looking up patient:', patientName);
  const response = await makeRequest(xml);
  console.log('\n=== Patient Lookup Response ===');
  console.log(response);
  console.log('\n');

  // Extract PatientGUID from response (basic regex - you might want to use xml parser)
  const patGUIDMatch = response.match(/<PatientGUID>([^<]+)<\/PatientGUID>/);
  if (patGUIDMatch) {
    return patGUIDMatch[1];
  }
  throw new Error('Patient GUID not found in response');
}

// Step 2: Get appointments for patient using patGUID
async function getPatientAppointments(patGUID) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>${CLIENT_ID}</ClientID>
    <UserName>${USERNAME}</UserName>
    <Password>${PASSWORD}</Password>
    <Procedure>GetAppointmentListByPatient</Procedure>
    <Parameters>
        <patGUID>${patGUID}</patGUID>
    </Parameters>
</GetDataRequest>`;

  console.log('Step 2: Getting appointments for patGUID:', patGUID);
  const response = await makeRequest(xml);
  console.log('\n=== Appointments Response ===');
  console.log(response);
  console.log('\n');

  return response;
}

// Main execution
async function main() {
  try {
    const patientName = 'Aleman, Chris';

    // Step 1: Get patient GUID
    const patGUID = await lookupPatient(patientName);
    console.log('✓ Found patient GUID:', patGUID);
    console.log('---\n');

    // Step 2: Get appointments
    await getPatientAppointments(patGUID);
    console.log('✓ Successfully retrieved appointments');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
