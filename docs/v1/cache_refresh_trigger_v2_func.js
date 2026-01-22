// Manual trigger endpoint - bypasses business hours check
// v2: Added retry logic with 5s delays, fixed Redis writes via HTTP endpoint
// Useful for testing and initial cache population

const TIERS = [1, 2, 3];
const TIER_DAYS = [30, 60, 90];
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    defaultLocationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b'
};
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';

// v2: Retry configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    retryDelayMs: 5000,         // 5 seconds between retries
    retryOnZeroResults: true,
    delayBetweenTiersMs: 5000   // 5 seconds between tier fetches
};

// v2: Redis SET endpoint (internal call)
const REDIS_SET_URL = 'http://127.0.0.1:1880/FabricWorkflow/api/chord/ortho-prd/redisSet';

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'}[c]));
}

function formatDate(d) {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}/${day}/${d.getFullYear()}`;
}

function parseXmlResponse(xmlText) {
    const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    const status = statusMatch ? statusMatch[1] : 'Unknown';
    const records = [];
    const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    while ((match = recordRegex.exec(xmlText)) !== null) {
        const record = {};
        const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
            record[fieldMatch[1]] = fieldMatch[2];
        }
        records.push(record);
    }
    return { status, records };
}

function groupSlotsByDate(slots) {
    const grouped = {};
    slots.forEach(slot => {
        const dateMatch = (slot.startTime || slot.StartTime || '').match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (dateMatch) {
            const date = dateMatch[1];
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(slot);
        }
    });
    return Object.entries(grouped).map(([date, slots]) => ({
        date: date,
        slots: slots,
        slotCount: slots.length
    })).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// v2: Fetch with retry logic
async function fetchCloud9WithRetry(tier, tierDays) {
    const today = new Date();
    const startDate = formatDate(today);
    const endDate = formatDate(new Date(today.getTime() + tierDays * 24 * 60 * 60 * 1000));
    const locationGUID = CLOUD9.defaultLocationGUID;

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="${CLOUD9.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>${CLOUD9.clientId}</ClientID>
    <UserName>${CLOUD9.userName}</UserName>
    <Password>${escapeXml(CLOUD9.password)}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;

    let lastError = null;
    let records = [];
    let totalRetries = 0;

    for (let retry = 0; retry <= RETRY_CONFIG.maxRetries; retry++) {
        try {
            if (retry > 0) {
                node.warn(`[v2 RETRY] Tier ${tier} - Retry ${retry}/${RETRY_CONFIG.maxRetries}, waiting 5s...`);
                await delay(RETRY_CONFIG.retryDelayMs);
            }

            const fetchStart = Date.now();
            const response = await fetch(CLOUD9.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xmlRequest,
                timeout: 120000
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const xmlText = await response.text();
            const parsed = parseXmlResponse(xmlText);
            records = parsed.records;

            // Check for zero-result rate limiting
            if (RETRY_CONFIG.retryOnZeroResults && records.length === 0 && retry < RETRY_CONFIG.maxRetries) {
                node.warn(`[v2 RETRY] Tier ${tier} - Got 0 results (possible rate limit), will retry...`);
                totalRetries++;
                continue;
            }

            // Success!
            return {
                success: true,
                records: records,
                totalRecords: records.length,
                retries: totalRetries,
                fetchDurationMs: Date.now() - fetchStart,
                startDate: startDate,
                endDate: endDate
            };

        } catch (error) {
            lastError = error;
            totalRetries++;
            node.warn(`[v2 RETRY] Tier ${tier} - Error: ${error.message}`);
        }
    }

    return {
        success: false,
        error: lastError?.message || 'All retries exhausted',
        records: records,
        retries: totalRetries
    };
}

// v2: Store in Redis via HTTP endpoint instead of global context
async function storeInRedis(key, value) {
    try {
        const response = await fetch(REDIS_SET_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
            timeout: 30000
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const result = await response.json();
        return result.success === true;
    } catch (error) {
        node.error(`[v2] Redis store failed for ${key}: ${error.message}`);
        return false;
    }
}

async function fetchTier(tier, tierDays) {
    const startTime = Date.now();
    const locationGUID = CLOUD9.defaultLocationGUID;

    // Fetch with retry
    const fetchResult = await fetchCloud9WithRetry(tier, tierDays);

    if (!fetchResult.success) {
        return {
            tier: tier,
            tierDays: tierDays,
            success: false,
            error: fetchResult.error,
            retries: fetchResult.retries,
            fetchDurationMs: Date.now() - startTime
        };
    }

    // Filter slots
    let filteredSlots = fetchResult.records.filter(slot =>
        slot.LocationGUID === locationGUID &&
        slot.ScheduleColumnGUID === CHAIR_8_GUID &&
        parseInt(slot.Minutes || '0') >= 40
    );

    node.warn(`[v2] Tier ${tier}: ${fetchResult.totalRecords} total -> ${filteredSlots.length} Chair 8 slots (${fetchResult.retries} retries)`);

    const enrichedSlots = filteredSlots.map(slot => ({
        ...slot,
        scheduleViewGUID: slot.ScheduleViewGUID,
        scheduleColumnGUID: slot.ScheduleColumnGUID,
        startTime: slot.StartTime,
        minutes: slot.Minutes || '40',
        appointmentTypeGUID: slot.AppointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705'
    }));

    const redisKey = `SlotCache-${locationGUID}-Tier${tier}`;
    const payload = {
        locationGUID: locationGUID,
        scheduleViewGUID: enrichedSlots.length > 0 ? enrichedSlots[0].scheduleViewGUID : null,
        slots: enrichedSlots,
        groupedSlots: groupSlotsByDate(enrichedSlots),
        fetchedAt: new Date().toISOString(),
        slotCount: enrichedSlots.length,
        tier: tier,
        tierDays: tierDays,
        dateRange: { start: fetchResult.startDate, end: fetchResult.endDate },
        fetchDurationMs: Date.now() - startTime,
        retries: fetchResult.retries,
        source: 'manual-trigger-v2'
    };

    // v2: Store via HTTP endpoint
    const stored = await storeInRedis(redisKey, payload);

    return {
        tier: tier,
        tierDays: tierDays,
        redisKey: redisKey,
        success: true,
        slotCount: enrichedSlots.length,
        fetchDurationMs: Date.now() - startTime,
        retries: fetchResult.retries,
        redisStored: stored
    };
}

async function triggerRefresh() {
    const startTime = Date.now();
    const results = [];

    node.warn('[v2 MANUAL_TRIGGER] Starting cache refresh with retry logic...');

    // Fetch all tiers sequentially with 5s delay between each
    for (let i = 0; i < TIERS.length; i++) {
        if (i > 0) {
            node.warn(`[v2] Waiting ${RETRY_CONFIG.delayBetweenTiersMs / 1000}s before Tier ${TIERS[i]}...`);
            await delay(RETRY_CONFIG.delayBetweenTiersMs);
        }

        const result = await fetchTier(TIERS[i], TIER_DAYS[i]);
        results.push(result);

        if (result.success) {
            node.warn(`[v2] Tier ${result.tier}: ${result.slotCount} slots, stored=${result.redisStored}`);
        } else {
            node.warn(`[v2] Tier ${result.tier}: FAILED - ${result.error}`);
        }
    }

    const totalDurationMs = Date.now() - startTime;
    const totalSlots = results.filter(r => r.success).reduce((sum, r) => sum + r.slotCount, 0);
    const totalRetries = results.reduce((sum, r) => sum + (r.retries || 0), 0);

    node.warn(`[v2 MANUAL_TRIGGER] Complete: ${totalSlots} slots in ${totalDurationMs}ms (${totalRetries} total retries)`);

    msg.payload = {
        success: results.every(r => r.success),
        totalDurationMs: totalDurationMs,
        totalSlotsCached: totalSlots,
        totalRetries: totalRetries,
        tiers: results.map(r => ({
            tier: r.tier,
            tierDays: r.tierDays,
            success: r.success,
            slotCount: r.slotCount || 0,
            fetchDurationMs: r.fetchDurationMs,
            retries: r.retries || 0,
            redisKey: r.redisKey,
            redisStored: r.redisStored,
            error: r.error
        }))
    };

    return msg;
}

return triggerRefresh();
