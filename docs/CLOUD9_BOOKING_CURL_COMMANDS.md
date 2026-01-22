# Cloud9 API - Booking Flow Curl Commands

Direct Cloud9 API calls for end-to-end slot booking with sample request/response data.

---

## Table of Contents

1. [Quick Reference - Default GUIDs](#quick-reference---default-guids)
2. [Step 1: Get Available Slots](#step-1-get-available-slots-getonlinereservations)
   - [Tier 1 (30 days)](#tier-1-request-30-days)
   - [Tier 2 (60 days)](#tier-2-request-60-days)
   - [Tier 3 (90 days)](#tier-3-request-90-days---final-attempt)
3. [Filtering Logic (Location, Chair 8, Pass-through GUIDs)](#filtering-logic-location-chair-8-pass-through-guids)
4. [Step 2: Create Patient](#step-2-create-patient-setpatient)
5. [Step 3: Book Appointment](#step-3-book-appointment-setappointment)
6. [Complete End-to-End Script](#complete-end-to-end-script)
7. [Data Flow Summary](#data-flow-summary)
8. [Error Codes Reference](#error-codes-reference)

---

## Quick Reference - Default GUIDs

```bash
# Production Endpoint
CLOUD9_ENDPOINT="https://us-ea1-partner.cloud9ortho.com/GetData.ashx"

# Authentication
CLIENT_ID="b42c51be-2529-4d31-92cb-50fd1a58c084"
USERNAME="Intelepeer"
PASSWORD="<CLOUD9_PASSWORD>"

# Default GUIDs
LOCATION_GUID="1fef9297-7c8b-426b-b0d1-f2275136e48b"      # CDH Allegheny
PROVIDER_GUID="a79ec244-9503-44b2-87e4-5920b6e60392"      # Default Orthodontist (Dr. Nga Nguyen)
APPT_TYPE_GUID="f6c20c35-9abb-47c2-981a-342996016705"     # Exam
SCHEDULE_VIEW_GUID="4c9e9333-4951-4eb0-8d97-e1ad83ef422d" # Schedule View
CHAIR_8_GUID="07687884-7e37-49aa-8028-d43b751c9034"       # Chair 8 (test bookings)
```

### GUID Usage Summary

| GUID | Used In | Purpose | Filtered? |
|------|---------|---------|-----------|
| **LOCATION_GUID** | Step 1 (GetSlots), Step 2 (SetPatient) | Filter slots to CDH Allegheny location | ✅ YES |
| **CHAIR_8_GUID** | Step 1 (GetSlots) | Filter slots to Chair 8 only (test bookings) | ✅ YES |
| **PROVIDER_GUID** | Step 2 (SetPatient) | Assign orthodontist to new patient | ❌ NO (used in patient creation) |
| **APPT_TYPE_GUID** | Step 3 (SetAppointment) | Default fallback if slot doesn't specify | ❌ NO (pass-through with fallback) |
| **SCHEDULE_VIEW_GUID** | Step 3 (SetAppointment) | Passed through from slot response | ❌ NO (pass-through from slot) |

**Key Points:**
- **Filtered GUIDs**: Only Location and Chair 8 are actively filtered from Cloud9 response
- **Pass-through GUIDs**: ScheduleViewGUID, AppointmentTypeGUID are returned by Cloud9 per slot and passed through unchanged
- **Patient Creation GUIDs**: Provider and Location GUIDs are used when creating patients, not filtering slots

---

## Step 1: Get Available Slots (GetOnlineReservations)

### Tier 1 Request (30 days)

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
        <startDate>01/21/2026 7:00:00 AM</startDate>
        <endDate>02/20/2026 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>'
```

### Tier 1 Response (Success - Slots Found)

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
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
    </Records>
</GetDataResponse>
```

**Result:** 3 slots found on Chair 8 → **Stop here, proceed to Step 2**

---

## Filtering Logic (Location, Chair 8, Pass-through GUIDs)

Cloud9 returns ALL available slots across ALL locations and chairs. The system applies **2 filters** and **passes through** other GUIDs unchanged:

### Active Filters (Slots Removed If No Match)

| Filter | GUID/Value | Purpose |
|--------|------------|---------|
| **Location** | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | CDH Allegheny only |
| **Chair 8** | `07687884-7e37-49aa-8028-d43b751c9034` | Test booking chair only |

### Pass-Through GUIDs (Not Filtered, Used As-Is)

| GUID | Source | Behavior |
|------|--------|----------|
| **ScheduleViewGUID** | From Cloud9 response | Passed through unchanged to SetAppointment |
| **AppointmentTypeGUID** | From Cloud9 response | Passed through; defaults to `f6c20c35-9abb-47c2-981a-342996016705` if missing |
| **Minutes** | From Cloud9 response | Passed through; defaults to `40` if missing |

### Provider GUID (Patient Creation Only)

| GUID | Usage | Notes |
|------|-------|-------|
| **PROVIDER_GUID** | SetPatient (Step 2) | `a79ec244-9503-44b2-87e4-5920b6e60392` (Dr. Nga Nguyen) - Not used in slot filtering |

### Raw Cloud9 Response (Before Filtering)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <!-- ✅ KEEP: Location match, Chair 8, 40 min -->
        <Record>
            <StartTime>01/25/2026 9:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- ❌ REJECT: Wrong location (different clinic) -->
        <Record>
            <StartTime>01/25/2026 9:00 AM</StartTime>
            <LocationGUID>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- ❌ REJECT: Wrong chair (Chair 5 instead of Chair 8) -->
        <Record>
            <StartTime>01/25/2026 9:40 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>3d453268-6c39-4c98-bcb9-d9512b9c1a69</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- ❌ REJECT: Too short (20 min instead of 40 min) -->
        <Record>
            <StartTime>01/25/2026 10:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>20</Minutes>
        </Record>

        <!-- ✅ KEEP: Location match, Chair 8, 40 min -->
        <Record>
            <StartTime>01/25/2026 10:20 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- ❌ REJECT: Wrong location AND wrong chair -->
        <Record>
            <StartTime>01/25/2026 11:00 AM</StartTime>
            <LocationGUID>ffffffff-1111-2222-3333-444444444444</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>55555555-6666-7777-8888-999999999999</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>

        <!-- ✅ KEEP: Location match, Chair 8, 45 min (>= 40) -->
        <Record>
            <StartTime>01/25/2026 11:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>45</Minutes>
        </Record>
    </Records>
</GetDataResponse>
```

### Filter Application (Node-RED Logic)

```javascript
// Filter constants (from getApptSlots_v8_func.js)
const LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';  // CDH Allegheny (from env.defaultLocationGUID)
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';   // Chair 8 (hardcoded for test bookings)

// Default GUIDs (used as fallbacks, NOT for filtering)
const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

// Raw slots from Cloud9
let slots = response.records;  // 7 slots returned

// FILTER 1: Location
slots = slots.filter(slot => slot.LocationGUID === LOCATION_GUID);
// Result: 5 slots (removed 2 wrong-location slots)

// FILTER 2: Chair 8
slots = slots.filter(slot => slot.ScheduleColumnGUID === CHAIR_8_GUID);
// Result: 4 slots (removed 1 wrong-chair slot)

// NO FILTER on Minutes, AppointmentTypeGUID, or ScheduleViewGUID
// These are passed through with defaults if missing:
slots = slots.map(slot => ({
    ...slot,
    minutes: slot.Minutes || '40',  // Default if missing
    appointmentTypeGUID: slot.AppointmentTypeGUID || DEFAULT_APPT_TYPE_GUID,  // Default if missing
    scheduleViewGUID: slot.ScheduleViewGUID  // Pass through as-is
}));
```

### Filtered Response (After All Filters)

```
Raw Cloud9 Response:  7 slots
After Location filter: 5 slots  (removed 2 wrong-location slots)
After Chair 8 filter:  4 slots  (removed 1 wrong-chair slot)
─────────────────────────────────
Final available slots: 4 slots
(Minutes, ScheduleViewGUID, AppointmentTypeGUID are NOT filtered - passed through with defaults)
```

```xml
<!-- FINAL FILTERED RESULT: 4 slots (after Location + Chair 8 filters) -->
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
        <StartTime>01/25/2026 10:00 AM</StartTime>
        <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
        <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
        <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
        <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
        <Minutes>20</Minutes>  <!-- Short slot passes - Minutes is NOT filtered -->
    </Record>
    <Record>
        <StartTime>01/25/2026 10:20 AM</StartTime>
        <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
        <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
        <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
        <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
        <Minutes>40</Minutes>
    </Record>
    <Record>
        <StartTime>01/25/2026 11:00 AM</StartTime>
        <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
        <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
        <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
        <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
        <Minutes>45</Minutes>
    </Record>
</Records>
```

### Filter Summary Table

| Slot Time | Location | Chair | Minutes | ScheduleViewGUID | ApptTypeGUID | Result |
|-----------|----------|-------|---------|------------------|--------------|--------|
| 9:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | (pass-through) | (pass-through) | **KEEP** |
| 9:00 AM | ❌ Other clinic | ✅ Chair 8 | 40 | (pass-through) | (pass-through) | REJECT (location) |
| 9:40 AM | ✅ CDH Allegheny | ❌ Chair 5 | 40 | (pass-through) | (pass-through) | REJECT (chair) |
| 10:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 20 | (pass-through) | (pass-through) | **KEEP** (minutes NOT filtered) |
| 10:20 AM | ✅ CDH Allegheny | ✅ Chair 8 | 40 | (pass-through) | (pass-through) | **KEEP** |
| 11:00 AM | ❌ Other clinic | ❌ Other | 40 | (pass-through) | (pass-through) | REJECT (location+chair) |
| 11:00 AM | ✅ CDH Allegheny | ✅ Chair 8 | 45 | (pass-through) | (pass-through) | **KEEP** |

**Important:** Only Location and Chair 8 are actively filtered. All other GUIDs (ScheduleViewGUID, AppointmentTypeGUID) and Minutes are passed through unchanged from the Cloud9 response.

---

### Tier 1 Response (No Slots - Expand to Tier 2)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
    </Records>
</GetDataResponse>
```

**Result:** 0 slots → **Expand to Tier 2 (60 days)**

---

### Tier 2 Request (60 days)

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
        <startDate>01/21/2026 7:00:00 AM</startDate>
        <endDate>03/22/2026 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>'
```

### Tier 2 Response (Success - Slots Found)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <StartTime>03/05/2026 2:00 PM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
        <Record>
            <StartTime>03/05/2026 2:40 PM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
    </Records>
</GetDataResponse>
```

**Result:** 2 slots found in early March → **Stop here, proceed to Step 2**

---

### Tier 3 Request (90 days - Final Attempt)

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
        <startDate>01/21/2026 7:00:00 AM</startDate>
        <endDate>04/21/2026 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>'
```

### Tier 3 Response (Success - Slots Found)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <StartTime>04/10/2026 10:00 AM</StartTime>
            <LocationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</LocationGUID>
            <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
            <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
            <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
            <Minutes>40</Minutes>
        </Record>
    </Records>
</GetDataResponse>
```

**Result:** 1 slot found in April → **Proceed to Step 2**

---

### Tier 3 Response (No Slots - Transfer to Agent)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
    </Records>
</GetDataResponse>
```

**Result:** 0 slots after all 3 tiers → **Transfer to human agent**

---

## Step 2: Create Patient (SetPatient)

### Request

```bash
curl -X POST 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx' \
  -H 'Content-Type: application/xml' \
  -d '<?xml version="1.0" encoding="utf-8"?>
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
</GetDataRequest>'
```

### Response (Success)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <Result>Patient GUID Added: e8f3a1b2-4c5d-6789-0abc-def123456789</Result>
        </Record>
    </Records>
</GetDataResponse>
```

**Extract:** `patientGUID = e8f3a1b2-4c5d-6789-0abc-def123456789`

---

### Response (Error - Duplicate Patient)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Error</ResponseStatus>
    <ErrorCode>3</ErrorCode>
    <ErrorMessage>Patient with this phone number already exists</ErrorMessage>
</GetDataResponse>
```

---

## Step 3: Book Appointment (SetAppointment)

### Request (Using Slot from Step 1 + Patient from Step 2)

```bash
curl -X POST 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx' \
  -H 'Content-Type: application/xml' \
  -d '<?xml version="1.0" encoding="utf-8"?>
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
</GetDataRequest>'
```

### Response (Success)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <Result>Appointment GUID Added: abc12345-6789-def0-1234-567890abcdef</Result>
        </Record>
    </Records>
</GetDataResponse>
```

**Extract:** `appointmentGUID = abc12345-6789-def0-1234-567890abcdef`

---

### Response (Error - Slot Not Available)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Error</ResponseStatus>
    <ErrorCode>3</ErrorCode>
    <ErrorMessage>The requested time slot is not available</ErrorMessage>
</GetDataResponse>
```

---

### Response (Error - Rate Limited)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Error</ResponseStatus>
    <ErrorCode>0</ErrorCode>
    <ErrorMessage>Too many requests. Please try again later.</ErrorMessage>
</GetDataResponse>
```

**Action:** Wait 5 seconds, retry up to 3 times

---

### Response (Error - Patient Not Found)

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Error</ResponseStatus>
    <ErrorCode>3</ErrorCode>
    <ErrorMessage>Patient GUID does not exist</ErrorMessage>
</GetDataResponse>
```

**Action:** Re-run Step 2 (SetPatient) to create patient first

---

## Complete End-to-End Script

```bash
#!/bin/bash

# Configuration
ENDPOINT="https://us-ea1-partner.cloud9ortho.com/GetData.ashx"
CLIENT_ID="b42c51be-2529-4d31-92cb-50fd1a58c084"
USERNAME="Intelepeer"
PASSWORD="<CLOUD9_PASSWORD>"

# Dates
START_DATE="01/21/2026"
END_DATE_TIER1="02/20/2026"  # +30 days
END_DATE_TIER2="03/22/2026"  # +60 days
END_DATE_TIER3="04/21/2026"  # +90 days

# Patient Info
FIRST_NAME="Jane"
LAST_NAME="Smith"
PHONE="4125551234"

# Default GUIDs
LOCATION="1fef9297-7c8b-426b-b0d1-f2275136e48b"
PROVIDER="a79ec244-9503-44b2-87e4-5920b6e60392"
APPT_TYPE="f6c20c35-9abb-47c2-981a-342996016705"

echo "=== STEP 1: Get Available Slots (Tier 1: 30 days) ==="

SLOTS_RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H 'Content-Type: application/xml' \
  -d "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<GetDataRequest xmlns=\"http://schemas.practica.ws/cloud9/partners/\">
    <ClientID>$CLIENT_ID</ClientID>
    <UserName>$USERNAME</UserName>
    <Password>$PASSWORD</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>$START_DATE 7:00:00 AM</startDate>
        <endDate>$END_DATE_TIER1 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>")

echo "$SLOTS_RESPONSE"

# Extract first slot (simplified - use xmllint for production)
SLOT_TIME=$(echo "$SLOTS_RESPONSE" | grep -oP '(?<=<StartTime>)[^<]+' | head -1)
SCHEDULE_VIEW=$(echo "$SLOTS_RESPONSE" | grep -oP '(?<=<ScheduleViewGUID>)[^<]+' | head -1)
SCHEDULE_COLUMN=$(echo "$SLOTS_RESPONSE" | grep -oP '(?<=<ScheduleColumnGUID>)[^<]+' | head -1)

if [ -z "$SLOT_TIME" ]; then
    echo "No slots found in Tier 1, would expand to Tier 2..."
    exit 1
fi

echo ""
echo "Found slot: $SLOT_TIME"
echo ""

echo "=== STEP 2: Create Patient ==="

PATIENT_RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H 'Content-Type: application/xml' \
  -d "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<GetDataRequest xmlns=\"http://schemas.practica.ws/cloud9/partners/\">
    <ClientID>$CLIENT_ID</ClientID>
    <UserName>$USERNAME</UserName>
    <Password>$PASSWORD</Password>
    <Procedure>SetPatient</Procedure>
    <Parameters>
        <patientFirstName>$FIRST_NAME</patientFirstName>
        <patientLastName>$LAST_NAME</patientLastName>
        <phoneNumber>$PHONE</phoneNumber>
        <providerGUID>$PROVIDER</providerGUID>
        <locationGUID>$LOCATION</locationGUID>
        <VendorUserName>$USERNAME</VendorUserName>
    </Parameters>
</GetDataRequest>")

echo "$PATIENT_RESPONSE"

# Extract patient GUID
PATIENT_GUID=$(echo "$PATIENT_RESPONSE" | grep -oP '(?<=Patient GUID Added: )[A-Fa-f0-9-]+')

if [ -z "$PATIENT_GUID" ]; then
    echo "Failed to create patient"
    exit 1
fi

echo ""
echo "Created patient: $PATIENT_GUID"
echo ""

echo "=== STEP 3: Book Appointment ==="

APPT_RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H 'Content-Type: application/xml' \
  -d "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<GetDataRequest xmlns=\"http://schemas.practica.ws/cloud9/partners/\">
    <ClientID>$CLIENT_ID</ClientID>
    <UserName>$USERNAME</UserName>
    <Password>$PASSWORD</Password>
    <Procedure>SetAppointment</Procedure>
    <Parameters>
        <PatientGUID>$PATIENT_GUID</PatientGUID>
        <StartTime>$SLOT_TIME</StartTime>
        <ScheduleViewGUID>$SCHEDULE_VIEW</ScheduleViewGUID>
        <ScheduleColumnGUID>$SCHEDULE_COLUMN</ScheduleColumnGUID>
        <AppointmentTypeGUID>$APPT_TYPE</AppointmentTypeGUID>
        <Minutes>40</Minutes>
        <VendorUserName>$USERNAME</VendorUserName>
    </Parameters>
</GetDataRequest>")

echo "$APPT_RESPONSE"

# Extract appointment GUID
APPT_GUID=$(echo "$APPT_RESPONSE" | grep -oP '(?<=Appointment GUID Added: )[A-Fa-f0-9-]+')

if [ -z "$APPT_GUID" ]; then
    echo "Failed to book appointment"
    exit 1
fi

echo ""
echo "=== BOOKING COMPLETE ==="
echo "Patient GUID:     $PATIENT_GUID"
echo "Appointment GUID: $APPT_GUID"
echo "Appointment Time: $SLOT_TIME"
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TIER EXPANSION SEQUENCE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  TIER 1 (30 days)                                                       │
│  ┌─────────────────┐                                                    │
│  │ GetOnline       │──→ Slots Found? ──YES──→ Proceed to Step 2        │
│  │ Reservations    │                                                    │
│  │ (today +30d)    │──→ No Slots? ──────────→ Expand to Tier 2         │
│  └─────────────────┘                                                    │
│                                                                         │
│  TIER 2 (60 days)                                                       │
│  ┌─────────────────┐                                                    │
│  │ GetOnline       │──→ Slots Found? ──YES──→ Proceed to Step 2        │
│  │ Reservations    │                                                    │
│  │ (today +60d)    │──→ No Slots? ──────────→ Expand to Tier 3         │
│  └─────────────────┘                                                    │
│                                                                         │
│  TIER 3 (90 days)                                                       │
│  ┌─────────────────┐                                                    │
│  │ GetOnline       │──→ Slots Found? ──YES──→ Proceed to Step 2        │
│  │ Reservations    │                                                    │
│  │ (today +90d)    │──→ No Slots? ──────────→ TRANSFER TO AGENT        │
│  └─────────────────┘                                                    │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                        BOOKING SEQUENCE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: GetOnlineReservations                                          │
│  ┌─────────────────┐                                                    │
│  │ INPUT:          │                                                    │
│  │ - startDate     │──→ OUTPUT:                                         │
│  │ - endDate       │    - StartTime                                     │
│  │ - morning/pm    │    - ScheduleViewGUID                              │
│  └─────────────────┘    - ScheduleColumnGUID                            │
│          │              - AppointmentTypeGUID                           │
│          │              - Minutes                                       │
│          ▼                                                              │
│  Step 2: SetPatient                                                     │
│  ┌─────────────────┐                                                    │
│  │ INPUT:          │                                                    │
│  │ - firstName     │──→ OUTPUT:                                         │
│  │ - lastName      │    - patientGUID                                   │
│  │ - phone         │                                                    │
│  │ - providerGUID  │                                                    │
│  │ - locationGUID  │                                                    │
│  └─────────────────┘                                                    │
│          │                                                              │
│          ▼                                                              │
│  Step 3: SetAppointment                                                 │
│  ┌─────────────────┐                                                    │
│  │ INPUT:          │                                                    │
│  │ - PatientGUID   │    (from Step 2)                                   │
│  │ - StartTime     │    (from Step 1)                                   │
│  │ - ScheduleView  │    (from Step 1)                                   │
│  │ - ScheduleCol   │    (from Step 1)                                   │
│  │ - ApptTypeGUID  │    (from Step 1)                                   │
│  │ - Minutes       │    (from Step 1)                                   │
│  └─────────────────┘                                                    │
│          │                                                              │
│          ▼                                                              │
│  ┌─────────────────┐                                                    │
│  │ OUTPUT:         │                                                    │
│  │ appointmentGUID │ ──→ BOOKING COMPLETE                               │
│  └─────────────────┘                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Error Codes Reference

| Code | Message | Action |
|------|---------|--------|
| 0 | Too many requests / Rate limit | Wait 5s, retry (max 3x) |
| 1 | Invalid client/username/password | Check credentials |
| 2 | Required parameter not specified | Check request XML |
| 3 | Invalid value for parameter | Verify GUIDs exist |
| 6 | Not authorized to access client | Contact Cloud9 support |
| 7 | Outside allowance window | Check API time restrictions |
| 10 | Procedure not authorized | Verify API permissions |
