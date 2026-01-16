const fetch = require('node-fetch');

async function testNodeRed() {
    console.log('=== Multi-attempt Node Red Test ===');
    console.log('');

    for (let i = 1; i <= 5; i++) {
        try {
            console.log(`Attempt ${i}...`);
            const response = await fetch('https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/getApptSlots', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64')
                },
                body: JSON.stringify({
                    startDate: '01/14/2026',
                    endDate: '03/15/2026'
                })
            });

            console.log(`  Status: ${response.status}`);

            if (response.status === 200) {
                const data = await response.json();
                console.log(`  Slot count: ${data.count || 0}`);

                if (data.count > 0 && data.slots) {
                    const s = data.slots[0];
                    console.log(`  First slot ScheduleViewGUID: ${s.ScheduleViewGUID || s.scheduleViewGUID}`);
                    console.log(`  First slot LocationGUID: ${s.LocationGUID}`);
                }
                console.log('\n=== SUCCESS ===');
                return;
            }

            // Wait 2 seconds between attempts
            await new Promise(r => setTimeout(r, 2000));

        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }

    console.log('\n=== All attempts failed ===');
}

testNodeRed();
