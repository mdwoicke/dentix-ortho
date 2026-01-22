# Tier Query Sequence for Slot Bookings

This document provides a complete step-by-step breakdown of how the slot booking system works, including the tier expansion sequence, all API calls, sample curl commands, and end-to-end data flow with default GUIDs.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Default GUIDs Reference](#default-guids-reference)
3. [Tier Expansion Sequence](#tier-expansion-sequence)
4. [Step-by-Step Flow](#step-by-step-flow)
   - [Step 1: Flowise Tool Request](#step-1-flowise-tool-request)
   - [Step 2: Node-RED Slot Search](#step-2-node-red-slot-search)
   - [Step 3: Cloud9 API Call](#step-3-cloud9-api-call)
   - [Step 4: Response Processing](#step-4-response-processing)
   - [Step 5: Patient Creation](#step-5-patient-creation)
   - [Step 6: Appointment Booking](#step-6-appointment-booking)
5. [Complete End-to-End Example](#complete-end-to-end-example)
6. [Retry Logic & Rate Limiting](#retry-logic--rate-limiting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SLOT BOOKING DATA FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Voice Input                                                           │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────┐                                                            │
│  │   Flowise   │  schedule_appointment_ortho (action=slots/grouped_slots)   │
│  │    Tool     │  → Tier expansion: 30 → 60 → 90 days                       │
│  └─────┬───────┘                                                            │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │  Node-RED   │  POST /ortho-prd/getApptSlots                              │
│  │  Gateway    │  → Sliding window search (30 days per window)              │
│  │             │  → Retry logic (3 retries, 5s delay)                       │
│  └─────┬───────┘  → Location filter + Chair 8 filter                        │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │  Cloud9 API │  GetOnlineReservations (SOAP/XML)                          │
│  │  (PROD)     │  → Returns raw slot availability                           │
│  └─────────────┘                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Default GUIDs Reference

| Parameter | GUID | Description |
|-----------|------|-------------|
| `defaultLocationGUID` | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | CDH Allegheny Location 202 |
| `defaultProviderGUID` | `a79ec244-9503-44b2-87e4-5920b6e60392` | Default Orthodontist |
| `defaultApptTypeGUID` | `f6c20c35-9abb-47c2-981a-342996016705` | Exam appointment type |
| `defaultScheduleViewGUID` | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Schedule view (Exams) |
| `defaultScheduleColumnGUID` | `3d453268-6c39-4c98-bcb9-d9512b9c1a69` | Default chair/provider |
| `CHAIR_8_GUID` | `07687884-7e37-49aa-8028-d43b751c9034` | Chair 8 (test bookings) |

**Cloud9 API Credentials (Production):**
| Parameter | Value |
|-----------|-------|
| Endpoint | `https://us-ea1-partner.cloud9ortho.com/GetData.ashx` |
| ClientID | `b42c51be-2529-4d31-92cb-50fd1a58c084` |
| UserName | `Intelepeer` |
| Password | `<CLOUD9_PASSWORD>` |
| Namespace | `http://schemas.practica.ws/cloud9/partners/` |

**Node-RED Credentials:**
| Parameter | Value |
|-----------|-------|
| Base URL | `https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord` |
| Username | `workflowapi` |
| Password | `<NODERED_PASSWORD>` |

---

## Tier Expansion Sequence

The system uses progressive date expansion across **3 tiers** to find available slots:

| Tier | Days | Date Range | Description |
|------|------|------------|-------------|
| **Tier 1** | 30 | Today → +30 days | First search attempt (1 month) |
| **Tier 2** | 60 | Today → +60 days | If Tier 1 returns 0 slots (2 months) |
| **Tier 3** | 90 | Today → +90 days | Final attempt (3 months) |

**Important:**
- **Minimum date range**: 30 days (prevents single-day searches)
- **Maximum future date**: 90 days (rejects hallucinated far-future dates)
- Each tier **stops immediately** when slots are found
- If all tiers exhausted → **transfer to agent**

---

## Step-by-Step Flow

### Step 1: Flowise Tool Request

The LLM calls the `schedule_appointment_ortho` tool with `action=slots` or `action=grouped_slots`.

**Flowise Tool Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `slots`, `grouped_slots`, `book_child`, or `cancel` |
| `startDate` | string | No | Start date (MM/DD/YYYY) - auto-corrected to today if past |
| `endDate` | string | No | End date (MM/DD/YYYY) - auto-corrected based on tier |
| `scheduleViewGUIDs` | string | No | Filter by specific schedule view |
| `numberOfPatients` | number | No | For grouped_slots (default: 2) |
| `timeWindowMinutes` | number | No | For grouped_slots (default: 30) |

**Internal Flow in Tool (scheduling_tool_func.js v67):**

```javascript
// Tier expansion sequence
const DATE_EXPANSION_TIERS = [30, 60, 90]; // Days per tier

for (let tierIndex = 0; tierIndex < DATE_EXPANSION_TIERS.length; tierIndex++) {
    const expansionDays = DATE_EXPANSION_TIERS[tierIndex];
    const corrected = correctDateRange(params.startDate, params.endDate, expansionDays);

    // Call Node-RED endpoint
    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            uui: uui,
            startDate: corrected.startDate,
            endDate: corrected.endDate
        })
    });

    // If slots found, return immediately (don't search next tier)
    if (data.slots && data.slots.length > 0) {
        return { success: true, data: data };
    }

    // No slots - continue to next tier
    console.log('[v50] No slots found at tier ' + tierIndex + ', expanding...');
}
```

---

### Step 2: Node-RED Slot Search

Node-RED receives the request at `/ortho-prd/getApptSlots` and performs a sliding window search against Cloud9 API.

**Curl Command - Node-RED getApptSlots:**

```bash
curl -X POST 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/getApptSlots' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <BASE64_NODERED_CREDENTIALS>' \
  -d '{
    "uui": "765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV",
    "startDate": "01/21/2026",
    "endDate": "02/20/2026"
  }'
```

**Sample Response (Success):**

```json
{
  "slots": [
    {
      "StartTime": "01/25/2026 9:00 AM",
      "LocationGUID": "1fef9297-7c8b-426b-b0d1-f2275136e48b",
      "ScheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
      "ScheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
      "AppointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
      "Minutes": "40",
      "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
      "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
      "startTime": "01/25/2026 9:00 AM",
      "minutes": "40",
      "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705"
    },
    {
      "StartTime": "01/25/2026 9:40 AM",
      "LocationGUID": "1fef9297-7c8b-426b-b0d1-f2275136e48b",
      "ScheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
      "ScheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
      "AppointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
      "Minutes": "40",
      "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
      "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
      "startTime": "01/25/2026 9:40 AM",
      "minutes": "40",
      "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705"
    }
  ],
  "count": 2,
  "voiceSlots": [
    {
      "time": "9:00 AM",
      "date": "01/25/2026",
      "day": "Saturday"
    }
  ],
  "searchRange": {
    "startDate": "01/21/2026",
    "endDate": "02/20/2026"
  },
  "attempts": 1,
  "retries": 0,
  "expanded": false,
  "llm_guidance": {
    "timestamp": "2026-01-21T15:30:00.000Z",
    "current_state": "SCHEDULING",
    "next_state": "SCHEDULING",
    "action_required": "offer_time_to_caller",
    "voice_response": "I have 9:00 AM available on Saturday. Would that work?"
  }
}
```

**Node-RED Internal Processing (getApptSlots_v8_func.js):**

1. **Sliding Window Search**: Searches in 30-day windows, max 2 windows
2. **Retry Logic**: 3 retries with 5s delay per API call
3. **Location Filter**: Only slots at `defaultLocationGUID`
4. **Chair 8 Filter**: Only slots on Chair 8 (`07687884-7e37-49aa-8028-d43b751c9034`)

```javascript
// Filter by location first
let filteredRecords = result.records.filter(
    slot => slot.LocationGUID === CLOUD9.defaultLocationGUID
);

// Filter by Chair 8
filteredRecords = filteredRecords.filter(
    slot => slot.ScheduleColumnGUID === CHAIR_8_GUID
);
```

---

### Step 3: Cloud9 API Call

Node-RED makes an XML SOAP request to Cloud9's `GetOnlineReservations` procedure.

**Curl Command - Cloud9 GetOnlineReservations:**

```bash
curl -X POST 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx' \
  -H 'Content-Type: application/xml' \
  -d '<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password><CLOUD9_PASSWORD></Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>01/21/2026 7:00:00 AM</startDate>
        <endDate>02/20/2026 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>'
```

**Sample XML Response:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <StartTime>01/25/2026 9:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
        <Record>
            <StartTime>01/25/2026 9:40 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
        <Record>
            <StartTime>01/25/2026 10:20 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>3d453268-6c39-4c98-bcb9-d9512b9c1a69</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
    </Records>
</GetDataResponse>
```

**Note:** The third record has `ScheduleColumnGUID=3d453268...` (not Chair 8), so it gets filtered out by Node-RED.

---

### Step 4: Response Processing

The Flowise tool receives the response, formats it for the LLM, and includes booking guidance.

**Final Tool Response to LLM:**

```json
{
  "slots": [
    {
      "displayTime": "01/25/2026 9:00 AM",
      "startTime": "01/25/2026 9:00 AM",
      "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
      "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
      "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
      "minutes": "40"
    }
  ],
  "count": 1,
  "_truncated": true,
  "_toolVersion": "v67",
  "_searchExpanded": false,
  "_expansionTier": 0,
  "_dateRange": {
    "start": "01/21/2026",
    "end": "02/20/2026",
    "days": 30
  },
  "llm_guidance": {
    "timestamp": "2026-01-21T15:30:00.000Z",
    "model": "PARENT_AS_PATIENT_V63",
    "confirmation_triggers": ["yes", "yeah", "yep", "sure", "okay", "perfect"],
    "goodbye_triggers": ["that's all", "no thank you", "no thanks"],
    "BOOKING_SEQUENCE_MANDATORY": [
      "STEP 1: Offer the slot time(s) to the caller and wait for confirmation",
      "STEP 2: When caller confirms, call chord_ortho_patient action=create with PARENT firstName/lastName/phone",
      "STEP 3: Get the patientGUID and bookingAuthToken from the chord_ortho_patient response",
      "STEP 4: Call schedule_appointment_ortho action=book_child with ALL children in children array"
    ],
    "next_action": "offer_time_to_caller_and_wait_for_confirmation"
  }
}
```

---

### Step 5: Patient Creation

After caller confirms the slot, the LLM creates the parent patient record.

**Curl Command - Node-RED createPatient:**

```bash
curl -X POST 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/createPatient' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <BASE64_NODERED_CREDENTIALS>' \
  -d '{
    "uui": "765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV",
    "patientFirstName": "Jane",
    "patientLastName": "Smith",
    "phoneNumber": "4125551234",
    "emailAddress": "jane.smith@email.com",
    "providerGUID": "a79ec244-9503-44b2-87e4-5920b6e60392",
    "locationGUID": "1fef9297-7c8b-426b-b0d1-f2275136e48b"
  }'
```

**Sample Response:**

```json
{
  "success": true,
  "patientGUID": "e8f3a1b2-4c5d-6789-0abc-def123456789",
  "bookingAuthToken": "<BOOKING_AUTH_TOKEN_EXAMPLE>",
  "message": "Patient created successfully",
  "llm_guidance": {
    "model": "PARENT_AS_PATIENT",
    "current_state": "PATIENT_CREATED",
    "next_action": "call_book_child_for_each_child",
    "critical_instruction": "Patient (parent) created successfully. Now call schedule_appointment_ortho action=book_child with ALL children using patientGUID AND bookingAuthToken from this response.",
    "patientGUID_for_booking": "e8f3a1b2-4c5d-6789-0abc-def123456789",
    "bookingAuthToken_for_booking": "<BOOKING_AUTH_TOKEN>",
    "MUST_INCLUDE_IN_BOOK_CHILD": {
      "patientGUID": "e8f3a1b2-4c5d-6789-0abc-def123456789",
      "bookingAuthToken": "<BOOKING_AUTH_TOKEN>"
    }
  }
}
```

**Cloud9 SetPatient XML (what Node-RED sends internally):**

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password><CLOUD9_PASSWORD></Password>
    <Procedure>SetPatient</Procedure>
    <Parameters>
        <patientFirstName>Jane</patientFirstName>
        <patientLastName>Smith</patientLastName>
        <phoneNumber>4125551234</phoneNumber>
        <providerGUID>a79ec244-9503-44b2-87e4-5920b6e60392</providerGUID>
        <locationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</locationGUID>
        <VendorUserName>Intelepeer</VendorUserName>
    </Parameters>
</GetDataRequest>
```

---

### Step 6: Appointment Booking

Using the patientGUID and bookingAuthToken from Step 5, book the appointment.

**Curl Command - Node-RED createAppt (Single Child):**

```bash
curl -X POST 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/createAppt' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <BASE64_NODERED_CREDENTIALS>' \
  -d '{
    "uui": "765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV",
    "patientGUID": "e8f3a1b2-4c5d-6789-0abc-def123456789",
    "bookingAuthToken": "<BOOKING_AUTH_TOKEN>",
    "startTime": "01/25/2026 9:00 AM",
    "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
    "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
    "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
    "minutes": "40",
    "childName": "Emma Smith",
    "note": "Child: Emma Smith | DOB: 05/15/2018 | Insurance: Delta Dental"
  }'
```

**Curl Command - Node-RED createAppt (Multiple Children - Batch):**

```bash
curl -X POST 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/createAppt' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <BASE64_NODERED_CREDENTIALS>' \
  -d '{
    "uui": "765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV",
    "patientGUID": "e8f3a1b2-4c5d-6789-0abc-def123456789",
    "bookingAuthToken": "<BOOKING_AUTH_TOKEN>",
    "children": [
      {
        "childName": "Emma Smith",
        "childDOB": "05/15/2018",
        "startTime": "01/25/2026 9:00 AM",
        "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
        "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
        "minutes": 40
      },
      {
        "childName": "Jack Smith",
        "childDOB": "08/22/2015",
        "startTime": "01/25/2026 9:40 AM",
        "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
        "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
        "minutes": 40
      }
    ]
  }'
```

**Sample Response (Success):**

```json
{
  "success": true,
  "appointmentGUID": "abc12345-6789-def0-1234-567890abcdef",
  "message": "Appointment GUID Added: abc12345-6789-def0-1234-567890abcdef",
  "_debug": {
    "cloud9_result": "Appointment GUID Added: abc12345-6789-def0-1234-567890abcdef",
    "cloud9_status": "Success",
    "attempts": 1,
    "retried": false,
    "spacing_wait_ms": 0
  },
  "llm_guidance": {
    "timestamp": "2026-01-21T15:35:00.000Z",
    "current_state": "CONFIRMATION",
    "next_state": "CONFIRMATION",
    "action_required": "confirm_booking_to_caller",
    "voice_response": "Your appointment is confirmed! Emma Smith, Saturday 01/25/2026 at 9:00 AM.",
    "chain_of_action": [
      "1. Confirm booking with enthusiasm",
      "2. State child name, day, date, time, location",
      "3. Ask 'Would you like the address?'",
      "4. Mention legal guardian requirement",
      "5. Ask 'Anything else?'"
    ]
  }
}
```

**Cloud9 SetAppointment XML (what Node-RED sends internally):**

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
    <UserName>Intelepeer</UserName>
    <Password><CLOUD9_PASSWORD></Password>
    <Procedure>SetAppointment</Procedure>
    <Parameters>
        <PatientGUID>e8f3a1b2-4c5d-6789-0abc-def123456789</PatientGUID>
        <StartTime>01/25/2026 9:00 AM</StartTime>
        <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
        <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
        <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
        <Minutes>40</Minutes>
        <VendorUserName>Intelepeer</VendorUserName>
    </Parameters>
</GetDataRequest>
```

---

## Complete End-to-End Example

Here's the complete sequence for booking an appointment for two siblings:

### 1. Search for Grouped Slots (2 children, 30-minute window)

```bash
# Step 1: Find back-to-back slots for 2 children
curl -X POST 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/getGroupedApptSlots' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <BASE64_NODERED_CREDENTIALS>' \
  -d '{
    "uui": "test-session-001",
    "startDate": "01/21/2026",
    "endDate": "02/20/2026",
    "numberOfPatients": 2,
    "timeWindowMinutes": 30
  }'
```

**Response:**
```json
{
  "groups": [
    {
      "groupTime": "01/25/2026 9:00 AM",
      "slots": [
        {
          "startTime": "01/25/2026 9:00 AM",
          "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
          "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
          "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
          "minutes": "40"
        },
        {
          "startTime": "01/25/2026 9:40 AM",
          "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
          "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034",
          "appointmentTypeGUID": "f6c20c35-9abb-47c2-981a-342996016705",
          "minutes": "40"
        }
      ]
    }
  ],
  "totalGroups": 1
}
```

### 2. Create Parent Patient

```bash
# Step 2: Create parent record (ONCE for all siblings)
curl -X POST 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/createPatient' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <BASE64_NODERED_CREDENTIALS>' \
  -d '{
    "uui": "test-session-001",
    "patientFirstName": "Jane",
    "patientLastName": "Smith",
    "phoneNumber": "4125551234"
  }'
```

**Response:**
```json
{
  "success": true,
  "patientGUID": "e8f3a1b2-4c5d-6789-0abc-def123456789",
  "bookingAuthToken": "<BOOKING_AUTH_TOKEN>"
}
```

### 3. Book Both Children (Single Call)

```bash
# Step 3: Book both children in ONE call using children array
curl -X POST 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/createAppt' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic <BASE64_NODERED_CREDENTIALS>' \
  -d '{
    "uui": "test-session-001",
    "patientGUID": "e8f3a1b2-4c5d-6789-0abc-def123456789",
    "bookingAuthToken": "<BOOKING_AUTH_TOKEN>",
    "children": [
      {
        "childName": "Emma Smith",
        "childDOB": "05/15/2018",
        "startTime": "01/25/2026 9:00 AM",
        "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034"
      },
      {
        "childName": "Jack Smith",
        "childDOB": "08/22/2015",
        "startTime": "01/25/2026 9:40 AM",
        "scheduleViewGUID": "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
        "scheduleColumnGUID": "07687884-7e37-49aa-8028-d43b751c9034"
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "childName": "Emma Smith",
      "success": true,
      "appointmentGUID": "appt-guid-emma-001"
    },
    {
      "childName": "Jack Smith",
      "success": true,
      "appointmentGUID": "appt-guid-jack-002"
    }
  ],
  "message": "Booked 2 appointments"
}
```

---

## Retry Logic & Rate Limiting

### Node-RED Retry Configuration (getApptSlots)

```javascript
const RETRY_CONFIG = {
    maxRetries: 3,           // Max retry attempts per API call
    retryDelayMs: 5000,      // 5 seconds between retries
    retryOnZeroResults: true // Retry when API returns 0 results (rate limiting pattern)
};

const STEPWISE_CONFIG = {
    maxAttempts: 2,              // Max sliding windows
    windowDays: 30,              // Days per window
    delayBetweenWindowsMs: 5000  // 5s delay between windows
};
```

### Node-RED Retry Configuration (createAppt)

```javascript
const BOOKING_SPACING_MS = 10000;  // 10s minimum between SetAppointment calls

const RETRY_CONFIG = {
    maxRetries: 2,
    retryDelays: [5000]  // Single 5s retry before queueing
};
```

### Async Queue Fallback

If rate-limited after sync retries, the appointment is queued for background processing:

```javascript
// Queued operation structure
{
    operationType: 'SetAppointment',
    requestPayload: { ... },
    createdAt: "2026-01-21T15:30:00.000Z",
    attemptCount: 0,
    maxAttempts: 10,
    nextRetryAt: "2026-01-21T15:30:00.000Z",
    status: 'pending'
}
```

- **Async queue** processes every 30 seconds
- **Exponential backoff** between retries
- **Max 10 attempts** before giving up

---

## Summary

| Step | Layer | Endpoint | Data |
|------|-------|----------|------|
| 1 | Flowise Tool | N/A | `action=slots`, dates |
| 2 | Node-RED | `/ortho-prd/getApptSlots` | UUI, dates, filters |
| 3 | Cloud9 API | `GetOnlineReservations` | XML SOAP request |
| 4 | Response | N/A | Filtered slots (location + Chair 8) |
| 5 | Node-RED | `/ortho-prd/createPatient` | Parent info |
| 6 | Node-RED | `/ortho-prd/createAppt` | patientGUID, bookingAuthToken, slot details |

**Key Points:**
- Tier expansion: 30 → 60 → 90 days (stops when slots found)
- Location filter: `1fef9297-7c8b-426b-b0d1-f2275136e48b`
- Chair 8 filter: `07687884-7e37-49aa-8028-d43b751c9034`
- Parent-as-patient model: ONE patientGUID for all siblings
- bookingAuthToken required to prevent parallel tool call collisions
