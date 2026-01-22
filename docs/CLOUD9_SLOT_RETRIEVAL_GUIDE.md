# Cloud9 API - Slot Retrieval Guide

End-to-end guide for retrieving available appointment slots from Cloud9 API using a single 90-day search window.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Slot Retrieval Flow Overview](#slot-retrieval-flow-overview)
3. [Step 1: Build the Request](#step-1-build-the-request)
4. [Step 2: Call GetOnlineReservations](#step-2-call-getonlinereservations)
5. [Step 3: Parse the Response](#step-3-parse-the-response)
6. [Step 4: Apply Filters](#step-4-apply-filters)
7. [Step 5: Enrich Slot Data](#step-5-enrich-slot-data)
8. [Complete Code Example](#complete-code-example)
9. [Sample Data Reference](#sample-data-reference)

---

## Quick Reference

```bash
# Production Endpoint
CLOUD9_ENDPOINT="https://us-ea1-partner.cloud9ortho.com/GetData.ashx"

# Authentication
CLIENT_ID="b42c51be-2529-4d31-92cb-50fd1a58c084"
USERNAME="Intelepeer"
PASSWORD="<CLOUD9_PASSWORD>"

# Filter GUIDs (slots filtered by these)
LOCATION_GUID="1fef9297-7c8b-426b-b0d1-f2275136e48b"      # CDH Allegheny
CHAIR_8_GUID="07687884-7e37-49aa-8028-d43b751c9034"       # Chair 8 (test bookings)

# Pass-through GUIDs (not filtered, used as fallbacks)
DEFAULT_APPT_TYPE_GUID="f6c20c35-9abb-47c2-981a-342996016705"  # Exam
DEFAULT_SCHEDULE_VIEW_GUID="4c9e9333-4951-4eb0-8d97-e1ad83ef422d"
```

### GUID Behavior Summary

| GUID | Behavior | Notes |
|------|----------|-------|
| **LocationGUID** | FILTERED | Only slots at CDH Allegheny are returned |
| **ScheduleColumnGUID** | FILTERED | Only slots on Chair 8 are returned |
| **ScheduleViewGUID** | PASS-THROUGH | Returned by Cloud9, passed unchanged to booking |
| **AppointmentTypeGUID** | PASS-THROUGH | Returned by Cloud9, defaults to Exam if missing |
| **Minutes** | PASS-THROUGH | Returned by Cloud9, defaults to 40 if missing |

---

## Slot Retrieval Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SLOT RETRIEVAL FLOW (90-Day Search)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: BUILD REQUEST                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Calculate date range: today → today + 90 days                   │   │
│  │ Build XML request with GetOnlineReservations procedure          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 2: CALL CLOUD9 API                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ POST to https://us-ea1-partner.cloud9ortho.com/GetData.ashx     │   │
│  │ Returns: ALL slots across ALL locations and chairs              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 3: PARSE XML RESPONSE                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Extract <Record> elements from <Records>                        │   │
│  │ Parse each field: StartTime, LocationGUID, ScheduleColumnGUID   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 4: APPLY FILTERS                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Filter 1: LocationGUID === CDH Allegheny                        │   │
│  │ Filter 2: ScheduleColumnGUID === Chair 8                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 5: ENRICH & RETURN                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Add defaults for missing fields (AppointmentTypeGUID, Minutes)  │   │
│  │ Normalize field names (camelCase + PascalCase for compatibility)│   │
│  │ Return enriched slots array                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Build the Request

### Date Range Calculation

```javascript
// Calculate 90-day search window
const today = new Date();
const startDate = new Date(today);
startDate.setDate(startDate.getDate() + 1);  // Start tomorrow

const endDate = new Date(startDate);
endDate.setDate(endDate.getDate() + 90);     // 90 days from start

// Format as MM/DD/YYYY
function formatDate(d) {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}/${day}/${d.getFullYear()}`;
}

const startDateStr = formatDate(startDate);  // e.g., "01/22/2026"
const endDateStr = formatDate(endDate);      // e.g., "04/22/2026"
```

### XML Request Template

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password><CLOUD9_PASSWORD></Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>01/22/2026 7:00:00 AM</startDate>
        <endDate>04/22/2026 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>
```

### Request Parameters

| Parameter | Required | Value | Description |
|-----------|----------|-------|-------------|
| `startDate` | Yes | `MM/DD/YYYY 7:00:00 AM` | Start of search window (include time) |
| `endDate` | Yes | `MM/DD/YYYY 5:00:00 PM` | End of search window (include time) |
| `morning` | No | `True` | Include morning slots (7 AM - 12 PM) |
| `afternoon` | No | `True` | Include afternoon slots (12 PM - 5 PM) |
| `schdvwGUIDs` | No | GUID | Optional: filter by specific schedule view |

---

## Step 2: Call GetOnlineReservations

### cURL Command (90-Day Search)

```bash
curl -X POST 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx' \
  -H 'Content-Type: application/xml' \
  -d '<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password><CLOUD9_PASSWORD></Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>01/22/2026 7:00:00 AM</startDate>
        <endDate>04/22/2026 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>'
```

### JavaScript Fetch Example

```javascript
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '<CLOUD9_PASSWORD>',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

function buildXmlRequest(startDate, endDate) {
    return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="${CLOUD9.namespace}">
    <ClientID>${CLOUD9.clientId}</ClientID>
    <UserName>${CLOUD9.userName}</UserName>
    <Password>${CLOUD9.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;
}

async function fetchSlots(startDate, endDate) {
    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: buildXmlRequest(startDate, endDate)
    });
    return await response.text();
}
```

---

## Step 3: Parse the Response

### Raw Cloud9 Response (Sample - 12 slots returned)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <!-- Slot 1: CDH Allegheny, Chair 8, 40 min - WILL PASS FILTERS -->
        <Record>
            <StartTime>01/25/2026 9:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 2: CDH Allegheny, Chair 8, 40 min - WILL PASS FILTERS -->
        <Record>
            <StartTime>01/25/2026 9:40 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 3: WRONG LOCATION - WILL BE FILTERED OUT -->
        <Record>
            <StartTime>01/25/2026 10:00 AM</StartTime>
            <LocationGUID>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 4: CDH Allegheny, WRONG CHAIR (Chair 5) - WILL BE FILTERED OUT -->
        <Record>
            <StartTime>01/25/2026 10:20 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>3d453268-6c39-4c98-bcb9-d9512b9c1a69</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 5: CDH Allegheny, Chair 8, 20 min - WILL PASS (Minutes not filtered) -->
        <Record>
            <StartTime>01/25/2026 11:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>20</Minutes>
        </Record>

        <!-- Slot 6: CDH Allegheny, Chair 8, 40 min - WILL PASS FILTERS -->
        <Record>
            <StartTime>02/10/2026 2:00 PM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 7: WRONG LOCATION AND WRONG CHAIR - WILL BE FILTERED OUT -->
        <Record>
            <StartTime>02/15/2026 9:00 AM</StartTime>
            <LocationGUID>ffffffff-1111-2222-3333-444444444444</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>55555555-6666-7777-8888-999999999999</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 8: CDH Allegheny, Chair 8, 45 min - WILL PASS FILTERS -->
        <Record>
            <StartTime>03/05/2026 10:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>45</Minutes>
        </Record>

        <!-- Slot 9: CDH Allegheny, WRONG CHAIR (Chair 3) - WILL BE FILTERED OUT -->
        <Record>
            <StartTime>03/10/2026 3:00 PM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>12345678-abcd-efgh-ijkl-mnopqrstuvwx</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 10: CDH Allegheny, Chair 8, 40 min - WILL PASS FILTERS -->
        <Record>
            <StartTime>03/20/2026 11:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 11: CDH Allegheny, Chair 8, NO AppointmentTypeGUID - WILL PASS (uses default) -->
        <Record>
            <StartTime>04/01/2026 9:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- Slot 12: CDH Allegheny, Chair 8, 40 min - WILL PASS FILTERS -->
        <Record>
            <StartTime>04/15/2026 2:30 PM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
    </Records>
</GetDataResponse>
```

### XML Parser Function

```javascript
function parseXmlResponse(xmlText) {
    // Check response status
    const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    const status = statusMatch ? statusMatch[1] : 'Unknown';

    if (status !== 'Success') {
        // Extract error details if present
        const errorCodeMatch = xmlText.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
        const errorMsgMatch = xmlText.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
        return {
            status,
            errorCode: errorCodeMatch ? errorCodeMatch[1] : null,
            errorMessage: errorMsgMatch ? errorMsgMatch[1] : null,
            records: []
        };
    }

    // Parse records
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
```

### Parsed Records (Before Filtering)

```javascript
// Result of parseXmlResponse() - 12 records
[
    { StartTime: "01/25/2026 9:00 AM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", ... },
    { StartTime: "01/25/2026 9:40 AM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", ... },
    { StartTime: "01/25/2026 10:00 AM", LocationGUID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ... },  // Wrong location
    { StartTime: "01/25/2026 10:20 AM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "3d453268-6c39-4c98-bcb9-d9512b9c1a69", ... },  // Wrong chair
    { StartTime: "01/25/2026 11:00 AM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", Minutes: "20", ... },
    { StartTime: "02/10/2026 2:00 PM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", ... },
    { StartTime: "02/15/2026 9:00 AM", LocationGUID: "ffffffff-1111-2222-3333-444444444444", ... },  // Wrong location + chair
    { StartTime: "03/05/2026 10:00 AM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", ... },
    { StartTime: "03/10/2026 3:00 PM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "12345678-abcd-efgh-ijkl-mnopqrstuvwx", ... },  // Wrong chair
    { StartTime: "03/20/2026 11:00 AM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", ... },
    { StartTime: "04/01/2026 9:00 AM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", ... },  // Missing ApptTypeGUID
    { StartTime: "04/15/2026 2:30 PM", LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b", ScheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034", ... }
]
```

---

## Step 4: Apply Filters

### Filter Constants

```javascript
// Only these two GUIDs are used for filtering
const LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';  // CDH Allegheny
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';   // Chair 8
```

### Filter Logic

```javascript
function applyFilters(records) {
    console.log(`Raw Cloud9 Response: ${records.length} slots`);

    // FILTER 1: Location (must be CDH Allegheny)
    let filtered = records.filter(slot => slot.LocationGUID === LOCATION_GUID);
    console.log(`After Location filter: ${filtered.length} slots`);

    // FILTER 2: Chair 8 (must be Chair 8 for test bookings)
    filtered = filtered.filter(slot => slot.ScheduleColumnGUID === CHAIR_8_GUID);
    console.log(`After Chair 8 filter: ${filtered.length} slots`);

    // NOTE: Minutes, ScheduleViewGUID, and AppointmentTypeGUID are NOT filtered
    // They are passed through with defaults applied in the enrichment step

    return filtered;
}
```

### Filter Results (Step by Step)

```
Raw Cloud9 Response:   12 slots
After Location filter:  9 slots  (removed 3 wrong-location slots)
After Chair 8 filter:   8 slots  (removed 1 wrong-chair slot)
─────────────────────────────────
Final filtered slots:   8 slots
```

### Filter Decision Table

| Slot # | StartTime | Location | Chair | Minutes | Result |
|--------|-----------|----------|-------|---------|--------|
| 1 | 01/25/2026 9:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | **KEEP** |
| 2 | 01/25/2026 9:40 AM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | **KEEP** |
| 3 | 01/25/2026 10:00 AM | ❌ Other | ✅ Chair 8 | 40 | REJECT (location) |
| 4 | 01/25/2026 10:20 AM | ✅ CDH Allegheny | ❌ Chair 5 | 40 | REJECT (chair) |
| 5 | 01/25/2026 11:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 20 | **KEEP** (minutes not filtered) |
| 6 | 02/10/2026 2:00 PM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | **KEEP** |
| 7 | 02/15/2026 9:00 AM | ❌ Other | ❌ Other | 40 | REJECT (both) |
| 8 | 03/05/2026 10:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 45 | **KEEP** |
| 9 | 03/10/2026 3:00 PM | ✅ CDH Allegheny | ❌ Chair 3 | 40 | REJECT (chair) |
| 10 | 03/20/2026 11:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | **KEEP** |
| 11 | 04/01/2026 9:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | **KEEP** (missing ApptType OK) |
| 12 | 04/15/2026 2:30 PM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | **KEEP** |

---

## Step 5: Enrich Slot Data

### Enrichment Logic

```javascript
const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

function enrichSlots(filteredRecords) {
    return filteredRecords.map(slot => ({
        // Normalize to camelCase with defaults applied
        startTime: slot.StartTime,
        locationGUID: slot.LocationGUID,
        scheduleViewGUID: slot.ScheduleViewGUID,
        scheduleColumnGUID: slot.ScheduleColumnGUID,
        minutes: slot.Minutes || '40',  // Default to 40 if missing
        appointmentTypeGUID: slot.AppointmentTypeGUID || DEFAULT_APPT_TYPE_GUID
    }));
}
```

### Final Enriched Output (8 slots)

```javascript
[
    {
        startTime: "01/25/2026 9:00 AM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
        minutes: "40"
    },
    {
        startTime: "01/25/2026 9:40 AM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
        minutes: "40"
    },
    {
        startTime: "01/25/2026 11:00 AM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
        minutes: "20"  // Short slot - passed through, not filtered
    },
    {
        startTime: "02/10/2026 2:00 PM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
        minutes: "40"
    },
    {
        startTime: "03/05/2026 10:00 AM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
        minutes: "45"  // Longer slot - passed through
    },
    {
        startTime: "03/20/2026 11:00 AM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
        minutes: "40"
    },
    {
        startTime: "04/01/2026 9:00 AM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",  // Default applied
        minutes: "40"
    },
    {
        startTime: "04/15/2026 2:30 PM",
        locationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
        scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        scheduleColumnGUID: "07687884-7e37-49aa-8028-d43b751c9034",
        appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
        minutes: "40"
    }
]
```

---

## Complete Code Example

```javascript
// ============================================================
// Cloud9 Slot Retrieval - Complete 90-Day Search Example
// ============================================================

const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '<CLOUD9_PASSWORD>',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

// Filter constants
const LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';
const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

// ============================================================
// Helper Functions
// ============================================================

function formatDate(d) {
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}/${day}/${d.getFullYear()}`;
}

function buildXmlRequest(startDate, endDate) {
    return `<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="${CLOUD9.namespace}">
    <ClientID>${CLOUD9.clientId}</ClientID>
    <UserName>${CLOUD9.userName}</UserName>
    <Password>${CLOUD9.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;
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

function applyFilters(records) {
    // Filter 1: Location
    let filtered = records.filter(slot => slot.LocationGUID === LOCATION_GUID);

    // Filter 2: Chair 8
    filtered = filtered.filter(slot => slot.ScheduleColumnGUID === CHAIR_8_GUID);

    return filtered;
}

function enrichSlots(filteredRecords) {
    return filteredRecords.map(slot => ({
        startTime: slot.StartTime,
        locationGUID: slot.LocationGUID,
        scheduleViewGUID: slot.ScheduleViewGUID,
        scheduleColumnGUID: slot.ScheduleColumnGUID,
        minutes: slot.Minutes || '40',
        appointmentTypeGUID: slot.AppointmentTypeGUID || DEFAULT_APPT_TYPE_GUID
    }));
}

// ============================================================
// Main Function
// ============================================================

async function getAvailableSlots() {
    // Step 1: Calculate 90-day window
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);  // Tomorrow

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 90);     // +90 days

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`Searching slots from ${startDateStr} to ${endDateStr}`);

    // Step 2: Call Cloud9 API
    const xmlRequest = buildXmlRequest(startDateStr, endDateStr);

    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlRequest
    });

    const xmlText = await response.text();

    // Step 3: Parse response
    const parsed = parseXmlResponse(xmlText);

    if (parsed.status !== 'Success') {
        throw new Error(`Cloud9 API error: ${parsed.status}`);
    }

    console.log(`Raw Cloud9 response: ${parsed.records.length} slots`);

    // Step 4: Apply filters
    const filtered = applyFilters(parsed.records);
    console.log(`After filters: ${filtered.length} slots`);

    // Step 5: Enrich and return
    const enriched = enrichSlots(filtered);

    return {
        success: true,
        slots: enriched,
        count: enriched.length,
        searchRange: {
            startDate: startDateStr,
            endDate: endDateStr
        }
    };
}

// Run
getAvailableSlots()
    .then(result => console.log('Result:', JSON.stringify(result, null, 2)))
    .catch(err => console.error('Error:', err.message));
```

---

## Sample Data Reference

### Input: 90-Day Search Request

| Parameter | Value |
|-----------|-------|
| Procedure | `GetOnlineReservations` |
| Start Date | `01/22/2026 7:00:00 AM` |
| End Date | `04/22/2026 5:00:00 PM` |
| Morning | `True` |
| Afternoon | `True` |

### Output: Filtered & Enriched Slots

| # | StartTime | Location | Chair | Minutes | ApptType |
|---|-----------|----------|-------|---------|----------|
| 1 | 01/25/2026 9:00 AM | CDH Allegheny | Chair 8 | 40 | Exam |
| 2 | 01/25/2026 9:40 AM | CDH Allegheny | Chair 8 | 40 | Exam |
| 3 | 01/25/2026 11:00 AM | CDH Allegheny | Chair 8 | 20 | Exam |
| 4 | 02/10/2026 2:00 PM | CDH Allegheny | Chair 8 | 40 | Exam |
| 5 | 03/05/2026 10:00 AM | CDH Allegheny | Chair 8 | 45 | Exam |
| 6 | 03/20/2026 11:00 AM | CDH Allegheny | Chair 8 | 40 | Exam |
| 7 | 04/01/2026 9:00 AM | CDH Allegheny | Chair 8 | 40 | Exam (default) |
| 8 | 04/15/2026 2:30 PM | CDH Allegheny | Chair 8 | 40 | Exam |

### Key GUIDs Reference

| Name | GUID | Purpose |
|------|------|---------|
| CDH Allegheny (Location) | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | Filter target |
| Chair 8 | `07687884-7e37-49aa-8028-d43b751c9034` | Filter target |
| Default Schedule View | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Pass-through |
| Exam (Appt Type) | `f6c20c35-9abb-47c2-981a-342996016705` | Pass-through/default |

---

## Error Handling Reference

| Error Code | Message | Action |
|------------|---------|--------|
| 0 | Unknown error / Rate limit | Wait 5s, retry (max 3x) |
| 1 | Invalid credentials | Check ClientID, UserName, Password |
| 2 | Missing required parameter | Check startDate, endDate |
| 3 | Invalid parameter value | Verify date format (MM/DD/YYYY) |
| 7 | Outside allowance window | Check API access hours |

### Rate Limit Handling

```javascript
async function fetchWithRetry(xmlRequest, maxRetries = 3) {
    for (let retry = 0; retry <= maxRetries; retry++) {
        if (retry > 0) {
            console.log(`Retry ${retry}/${maxRetries}, waiting 5s...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        const response = await fetch(CLOUD9.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlRequest
        });

        const xmlText = await response.text();
        const parsed = parseXmlResponse(xmlText);

        // Retry on zero results (rate limit pattern)
        if (parsed.records.length === 0 && retry < maxRetries) {
            console.log('Got 0 results (possible rate limit), retrying...');
            continue;
        }

        return parsed;
    }
}
```
