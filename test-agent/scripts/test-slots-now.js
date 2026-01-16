const fetch = require('node-fetch');

async function testNodeRed() {
    console.log('=== Testing Node Red /ortho-prd/getApptSlots ===');
    console.log('');

    try {
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

        console.log('HTTP Status:', response.status);

        const text = await response.text();

        if (response.status !== 200) {
            console.log('Error response:', text.substring(0, 300));
            return;
        }

        const data = JSON.parse(text);
        console.log('Slot count:', data.count || 0);

        if (data.count > 0 && data.slots) {
            const targetSV = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';
            const targetLoc = '1fef9297-7c8b-426b-b0d1-f2275136e48b';

            const allMatchSV = data.slots.every(s => (s.ScheduleViewGUID || s.scheduleViewGUID) === targetSV);
            const allMatchLoc = data.slots.every(s => s.LocationGUID === targetLoc);

            console.log('');
            console.log('All slots match target ScheduleViewGUID:', allMatchSV ? 'YES' : 'NO');
            console.log('All slots match target LocationGUID:', allMatchLoc ? 'YES' : 'NO');

            console.log('');
            console.log('First slot:');
            const s = data.slots[0];
            console.log('  ScheduleViewGUID:', s.ScheduleViewGUID || s.scheduleViewGUID);
            console.log('  LocationGUID:', s.LocationGUID);
            console.log('  ScheduleColumnGUID:', s.ScheduleColumnGUID || s.scheduleColumnGUID);
            console.log('  StartTime:', s.StartTime || s.startTime);
        } else {
            console.log('Response:', JSON.stringify(data).substring(0, 500));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testNodeRed();
