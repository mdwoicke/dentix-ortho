# GUID Data Flow: Slot Search to Appointment Booking

This document details the step-by-step data flow showing how GUIDs are added at each stage from initial slot search to appointment creation.

---

## **STEP 1: Initial Request (Flowise Tool → Node-RED)**

**Endpoint:** `/ortho-prd/getApptSlots`

**Input from Flowise:**
```javascript
{
  startDate: "01/17/2026",
  endDate: "01/31/2026",
  scheduleViewGUIDs: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d"  // Optional
}
```

**Default GUIDs at this stage:** None required - just date range

---

## **STEP 2: Node-RED Calls Cloud9 GetOnlineReservations**

**File:** `nodered_Cloud9_flows.json` → `getApptSlots` function

```javascript
const apiParams = {
  startDate: `${currentStart} 7:00:00 AM`,
  endDate: `${currentEnd} 5:00:00 PM`,
  morning: 'True',
  afternoon: 'True',
  schdvwGUIDs: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d"  // Only if provided
  // appttypGUIDs: REMOVED (v6) - was filtering out slots
  // schclnGUIDs: NOT USED
};
```

**GUIDs sent to Cloud9:**

| Parameter | Full GUID | Name |
|-----------|-----------|------|
| `schdvwGUIDs` | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Schedule View |

---

## **STEP 3: Cloud9 Returns Raw Slots**

**What Cloud9 returns:**
```javascript
{
  StartTime: "01/20/2026 9:00:00 AM",
  ScheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
  ScheduleColumnGUID: "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a",
  LocationGUID: "1fef9297-7c8b-426b-b0d1-f2275136e48b",
  Minutes: "45"
  // NOTE: AppointmentTypeGUID is NOT returned by Cloud9!
}
```

| Field | Full GUID | Returned? |
|-------|-----------|-----------|
| `ScheduleViewGUID` | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Yes |
| `ScheduleColumnGUID` | `f0fa4eda-0136-45d5-a5d8-91ad7d0b608a` | Yes |
| `LocationGUID` | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | Yes |
| `AppointmentTypeGUID` | - | **NOT RETURNED** |

---

## **STEP 4: Node-RED Filters by Location**

**Default GUID used:**

| Variable | Full GUID | Name |
|----------|-----------|------|
| `defaultLocationGUID` | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | Default Location |

```javascript
// Filter by location
if (CLOUD9.defaultLocationGUID) {
  filteredRecords = parsed.records.filter(
    slot => slot.LocationGUID === "1fef9297-7c8b-426b-b0d1-f2275136e48b"
  );
}
```

---

## **STEP 5: Node-RED Enriches Slots with Default GUIDs**

**This is where missing GUIDs get added:**

```javascript
const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

const enrichedSlots = result.records.map(slot => ({
  ...slot,

  // From Cloud9 response:
  scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",   // From Cloud9
  scheduleColumnGUID: "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a", // From Cloud9
  startTime: "01/20/2026 9:00:00 AM",                          // From Cloud9
  minutes: "45",                                                // Default if missing

  // ADDED BY NODE-RED (not from Cloud9):
  appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705"  // Added here!
}));
```

| Field | Full GUID | Source |
|-------|-----------|--------|
| `scheduleViewGUID` | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Cloud9 Response |
| `scheduleColumnGUID` | `f0fa4eda-0136-45d5-a5d8-91ad7d0b608a` | Cloud9 Response |
| `appointmentTypeGUID` | `f6c20c35-9abb-47c2-981a-342996016705` | **NODE-RED DEFAULT** |
| `minutes` | `45` | Cloud9 or Default |

---

## **STEP 6: Slots Returned to Flowise**

```javascript
{
  slots: [
    {
      startTime: "01/20/2026 9:00:00 AM",
      scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
      scheduleColumnGUID: "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a",
      appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
      minutes: "45"
    }
  ],
  count: 1,
  llm_guidance: { ... }
}
```

---

## **STEP 7: Booking Request (Flowise Tool → Node-RED)**

**Endpoint:** `/ortho-prd/createAppt`

**File:** `scheduling_tool_func.js` → `book_child` action

```javascript
// What Flowise sends:
{
  action: "book_child",
  patientGUID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",        // From patient creation
  startTime: "01/20/2026 9:00:00 AM",                          // From selected slot
  scheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",   // From selected slot
  scheduleColumnGUID: "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a", // From selected slot
  appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",// From selected slot
  minutes: 45
}
```

---

## **STEP 8: Node-RED createAppt Adds Final Defaults**

**File:** `nodered_Cloud9_flows.json` → `createAppt` function

**Fallback defaults used if values missing:**

| Variable | Full GUID | Name |
|----------|-----------|------|
| `DEFAULT_SCHEDULE_COLUMN_GUID` | `dda0b40c-ace5-4427-8b76-493bf9aa26f1` | Default Chair (Fallback) |
| `DEFAULT_APPT_TYPE_GUID` | `f6c20c35-9abb-47c2-981a-342996016705` | New Patient Exam |

```javascript
const bookingParams = {
  PatientGUID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  StartTime: "01/20/2026 9:00:00 AM",
  ScheduleViewGUID: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d",
  ScheduleColumnGUID: "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a",  // Or fallback: dda0b40c-ace5-4427-8b76-493bf9aa26f1
  AppointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705",
  Minutes: 45,
  VendorUserName: 'Chord'
};
```

---

## **STEP 9: Cloud9 SetAppointment**

**Final XML sent to Cloud9:**
```xml
<Parameters>
  <PatientGUID>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</PatientGUID>
  <StartTime>01/20/2026 9:00:00 AM</StartTime>
  <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
  <ScheduleColumnGUID>f0fa4eda-0136-45d5-a5d8-91ad7d0b608a</ScheduleColumnGUID>
  <AppointmentTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</AppointmentTypeGUID>
  <Minutes>45</Minutes>
  <VendorUserName>Chord</VendorUserName>
</Parameters>
```

---

## **COMPLETE GUID REFERENCE TABLE**

| GUID | Full Value | Name | Where Used |
|------|------------|------|------------|
| `defaultScheduleViewGUID` | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Schedule View | Step 2, 5, 7, 8, 9 |
| `defaultLocationGUID` | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | Location | Step 4 (filter only) |
| `defaultApptTypeGUID` | `f6c20c35-9abb-47c2-981a-342996016705` | New Patient Exam | Step 5, 8, 9 |
| `defaultScheduleColumnGUID` | `dda0b40c-ace5-4427-8b76-493bf9aa26f1` | Default Chair (Fallback) | Step 8 (if missing) |
| Example from Cloud9 | `f0fa4eda-0136-45d5-a5d8-91ad7d0b608a` | Chair 8 | Step 3, 5, 7, 8, 9 |

---

## **VISUAL FLOW WITH FULL GUIDS**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  FLOWISE REQUEST                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ startDate: "01/17/2026"                                                │  │
│  │ endDate: "01/31/2026"                                                  │  │
│  │ scheduleViewGUIDs: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d" (optional)   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  NODE-RED: getApptSlots                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ADDS:                                                                  │  │
│  │   schdvwGUIDs: "4c9e9333-4951-4eb0-8d97-e1ad83ef422d"                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CLOUD9: GetOnlineReservations RESPONSE                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ RETURNS:                                                               │  │
│  │   StartTime:          "01/20/2026 9:00:00 AM"                          │  │
│  │   ScheduleViewGUID:   "4c9e9333-4951-4eb0-8d97-e1ad83ef422d"          │  │
│  │   ScheduleColumnGUID: "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a"          │  │
│  │   LocationGUID:       "1fef9297-7c8b-426b-b0d1-f2275136e48b"          │  │
│  │   Minutes:            "45"                                             │  │
│  │   AppointmentTypeGUID: NOT RETURNED                                    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  NODE-RED: Filter by Location                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ FILTER WHERE:                                                          │  │
│  │   LocationGUID === "1fef9297-7c8b-426b-b0d1-f2275136e48b"              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  NODE-RED: Enrich Slots                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ADDS DEFAULT:                                                          │  │
│  │   appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705" <- ADDED │  │
│  │                                                                        │  │
│  │ FINAL SLOT:                                                            │  │
│  │   startTime:           "01/20/2026 9:00:00 AM"                         │  │
│  │   scheduleViewGUID:    "4c9e9333-4951-4eb0-8d97-e1ad83ef422d"         │  │
│  │   scheduleColumnGUID:  "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a"         │  │
│  │   appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705"         │  │
│  │   minutes:             "45"                                            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FLOWISE: User Selects Slot -> Patient Created -> book_child Called           │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ SENDS TO NODE-RED:                                                     │  │
│  │   patientGUID:         "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"          │  │
│  │   startTime:           "01/20/2026 9:00:00 AM"                         │  │
│  │   scheduleViewGUID:    "4c9e9333-4951-4eb0-8d97-e1ad83ef422d"         │  │
│  │   scheduleColumnGUID:  "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a"         │  │
│  │   appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705"         │  │
│  │   minutes:             45                                              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  NODE-RED: createAppt (with fallback defaults if missing)                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ FALLBACK DEFAULTS (only used if value missing):                        │  │
│  │   scheduleColumnGUID:  "dda0b40c-ace5-4427-8b76-493bf9aa26f1"         │  │
│  │   appointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705"         │  │
│  │   minutes:             45                                              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CLOUD9: SetAppointment                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ FINAL BOOKING:                                                         │  │
│  │   PatientGUID:         "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"          │  │
│  │   StartTime:           "01/20/2026 9:00:00 AM"                         │  │
│  │   ScheduleViewGUID:    "4c9e9333-4951-4eb0-8d97-e1ad83ef422d"         │  │
│  │   ScheduleColumnGUID:  "f0fa4eda-0136-45d5-a5d8-91ad7d0b608a"         │  │
│  │   AppointmentTypeGUID: "f6c20c35-9abb-47c2-981a-342996016705"         │  │
│  │   Minutes:             45                                              │  │
│  │   VendorUserName:      "Chord"                                         │  │
│  │                                                                        │  │
│  │   APPOINTMENT CREATED                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## **GUID SOURCES SUMMARY**

| GUID Type | Full Value | Source | Step Added |
|-----------|------------|--------|------------|
| **Schedule View** | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Node-RED env / Flowise input | Step 2 |
| **Location** (filter) | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | Node-RED env | Step 4 |
| **Schedule Column** | `f0fa4eda-0136-45d5-a5d8-91ad7d0b608a` | Cloud9 Response | Step 3 |
| **Schedule Column** (fallback) | `dda0b40c-ace5-4427-8b76-493bf9aa26f1` | Node-RED hardcoded | Step 8 |
| **Appointment Type** | `f6c20c35-9abb-47c2-981a-342996016705` | Node-RED default | Step 5 |
| **Minutes** | `45` | Cloud9 Response or default | Step 3/5 |

---

## **KEY INSIGHTS**

1. **AppointmentTypeGUID is NOT returned by Cloud9** - It must be added by Node-RED as a default value

2. **Location filtering happens client-side** - Cloud9 returns all slots, Node-RED filters by location

3. **Two levels of defaults exist:**
   - Step 5: Enrichment defaults (always applied)
   - Step 8: Fallback defaults (only if value missing)

4. **The `appttypGUIDs` filter was removed** (v6) because it caused Cloud9 to return 0 slots with "not allow online scheduling" error

---

*Document generated: 2026-01-16*
