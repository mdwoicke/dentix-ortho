/**
 * Quick script to query Cloud9 insurance data from production
 * Run with: npx ts-node src/query-insurance.ts
 */

import axios from 'axios';

// Using SANDBOX - available 24/7
const CONFIG = {
  endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
  credentials: {
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
  },
};

function buildXmlRequest(procedure: string, parameters: Record<string, string> = {}): string {
  const paramXml = Object.entries(parameters)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join('\n        ');

  return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CONFIG.credentials.clientId}</ClientID>
    <UserName>${CONFIG.credentials.userName}</UserName>
    <Password>${CONFIG.credentials.password}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>
        ${paramXml}
    </Parameters>
</GetDataRequest>`;
}

async function queryCloud9(procedure: string, parameters: Record<string, string> = {}) {
  const xmlBody = buildXmlRequest(procedure, parameters);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Querying: ${procedure}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const response = await axios.get(CONFIG.endpoint, {
      headers: {
        'Content-Type': 'application/xml',
      },
      data: xmlBody,
      timeout: 30000,
    });

    return response.data;
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    if (error.response) {
      console.error(`Response: ${error.response.data}`);
    }
    return null;
  }
}

async function main() {
  console.log('Cloud9 Insurance Data Query');
  console.log('SANDBOX Environment (available 24/7)');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Search for patients
  console.log('\n1. Searching for patients with "Smith"...');
  const patients = await queryCloud9('GetPortalPatientLookup', {
    filter: 'Smith',
    lookupByPatient: '1',
    pageIndex: '1',
    pageSize: '10',
  });

  if (patients) {
    console.log('\nPatient Search Response:');
    console.log(patients);

    // Extract first patient GUID
    const guidMatch = patients.match(/<PatGUID>([^<]+)<\/PatGUID>/);
    if (guidMatch) {
      const patientGuid = guidMatch[1];
      console.log(`\n2. Getting detailed info for patient GUID: ${patientGuid}`);

      const patientInfo = await queryCloud9('GetPatientInformation', {
        patguid: patientGuid,
      });

      if (patientInfo) {
        console.log('\nPatient Information Response:');
        console.log(patientInfo);

        if (patientInfo.includes('Insurance') || patientInfo.includes('insurance')) {
          console.log('\n*** Found Insurance-related fields in patient info! ***');
        }
      }

      // 3. Get appointments for this patient
      console.log('\n3. Getting appointments for this patient...');
      const appts = await queryCloud9('GetAppointmentListByPatient', {
        patGUID: patientGuid,
      });

      if (appts) {
        console.log('\nAppointments Response:');
        console.log(appts);

        if (appts.includes('Insurance') || appts.includes('insurance')) {
          console.log('\n*** Found Insurance-related fields in appointments! ***');
        }
      }

      // 4. Get responsible parties for this patient
      console.log('\n4. Getting responsible parties...');
      const respParties = await queryCloud9('GetResponsiblePartiesForPatient', {
        PatientGUID: patientGuid,
      });

      if (respParties) {
        console.log('\nResponsible Parties Response:');
        console.log(respParties);
      }
    }
  }

  // 5. Try the insurance APIs
  console.log('\n5. Trying GetInsurancePolicies...');
  const policies = await queryCloud9('GetInsurancePolicies', {});
  if (policies) {
    console.log(policies);
  }

  console.log('\n6. Trying GetPatientInsurancePolicies...');
  const patPolicies = await queryCloud9('GetPatientInsurancePolicies', {
    ExcludeInactivePatients: '0',
  });
  if (patPolicies) {
    console.log(patPolicies.substring(0, 10000));
  }
}

main().catch(console.error);
