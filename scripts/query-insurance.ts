/**
 * Quick script to query Cloud9 insurance data from production
 * Run with: npx ts-node scripts/query-insurance.ts
 */

import axios from 'axios';

const PRODUCTION_CONFIG = {
  endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  credentials: {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
  },
};

function buildXmlRequest(procedure: string, parameters: Record<string, string> = {}): string {
  const paramXml = Object.entries(parameters)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join('\n        ');

  return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${PRODUCTION_CONFIG.credentials.clientId}</ClientID>
    <UserName>${PRODUCTION_CONFIG.credentials.userName}</UserName>
    <Password>${PRODUCTION_CONFIG.credentials.password}</Password>
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
    const response = await axios.get(PRODUCTION_CONFIG.endpoint, {
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
  console.log('Production Environment');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Query GetPatientInsurancePolicies (all patients with insurance)
  console.log('\n1. Querying GetPatientInsurancePolicies...');
  const insurancePolicies = await queryCloud9('GetPatientInsurancePolicies', {
    ExcludeInactivePatients: '0',
  });

  if (insurancePolicies) {
    console.log('\nResponse (first 5000 chars):');
    console.log(insurancePolicies.substring(0, 5000));

    // Count records
    const recordCount = (insurancePolicies.match(/<Record>/g) || []).length;
    console.log(`\nTotal insurance policy records: ${recordCount}`);
  }

  // 2. Query GetInsurancePolicies (with optional modifiedDate filter)
  console.log('\n2. Querying GetInsurancePolicies...');
  const policies = await queryCloud9('GetInsurancePolicies', {});

  if (policies) {
    console.log('\nResponse (first 5000 chars):');
    console.log(policies.substring(0, 5000));

    const recordCount = (policies.match(/<Record>/g) || []).length;
    console.log(`\nTotal records: ${recordCount}`);
  }
}

main().catch(console.error);
