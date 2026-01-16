const fetch = require('node-fetch');

async function testCloud9Direct() {
    const endpoint = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';

    // Test GetLocations first to see what providers exist
    const xmlGetLocations = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password>$#1Nt-p33R-AwS#$</Password>
    <Procedure>GetLocations</Procedure>
    <Parameters></Parameters>
</GetDataRequest>`;

    console.log('Testing GetLocations directly against Cloud9 Production...\n');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlGetLocations
        });

        const text = await response.text();
        console.log('Response Status:', response.status);

        // Extract OrthodontistGUIDs from response
        const guidPattern = /OrthodontistGUID>([a-f0-9-]{36})/gi;
        let match;
        const guids = new Set();
        while ((match = guidPattern.exec(text)) !== null) {
            guids.add(match[1]);
        }

        console.log('\nUnique OrthodontistGUIDs found:');
        guids.forEach(g => console.log(' -', g));

        // Also find the CDH - Allegheny location specifically
        if (text.includes('CDH - Allegheny') || text.includes('CDAL')) {
            console.log('\n=== CDH - Allegheny Location Found ===');
            const alleghenyMatch = text.match(/<Record>[\s\S]*?CDH - Allegheny[\s\S]*?<\/Record>/i);
            if (alleghenyMatch) {
                console.log(alleghenyMatch[0].substring(0, 1000));
            }
        }

        // Show first 3000 chars of response for debugging
        console.log('\n=== First 3000 chars of raw response ===');
        console.log(text.substring(0, 3000));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testCloud9Direct();
