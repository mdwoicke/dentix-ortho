const fetch = require('node-fetch');

async function getProviders() {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
    
    // Try GetDoctors
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetDoctors</Procedure>
    <Parameters></Parameters>
</GetDataRequest>`;

    console.log('Querying Cloud9 Production GetDoctors...');

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
    });

    const text = await response.text();
    console.log('\nRaw response:');
    console.log(text.substring(0, 4000));
}

getProviders().catch(e => console.error('Error:', e.message));
