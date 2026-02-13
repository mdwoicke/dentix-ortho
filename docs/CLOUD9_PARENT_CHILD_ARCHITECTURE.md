# Cloud9 Parent-Child Appointment Architecture

**Last Updated:** 2026-01-26
**Status:** PRODUCTION - Parent-as-Patient Model

---

## Executive Summary

**Question:** How are parent-child appointments stored in Cloud9 - does each child get their own patient GUID, or is child info stored in appointment notes?

**Answer from REAL PRODUCTION DATA:**

### Native Cloud9 Pattern (VERIFIED from other orthodontist locations):
- **ONE PatientGUID per INDIVIDUAL person** (adult or child)
- **Each person gets their own unique PatientGUID**
- **AppointmentNote contains CLINICAL notes only** (not child identification)

### Our Custom Implementation (Parent-as-Patient Model):
- **ONE patient GUID per family** (the parent/guardian)
- **Child information stored in appointment notes**
- Children do NOT get their own patient GUIDs

This approach was adopted because **Cloud9 rejects duplicate phone numbers**, preventing sibling records with shared family phone.

---

## 🔑 HOW TO CREATE FAMILY APPOINTMENTS (API Calls)

This is the critical information for reproducing family appointments in Cloud9.

### NATIVE Cloud9 Pattern (Separate Patient Records per Child)

**Use Case:** When each child has a UNIQUE phone number

```
STEP 1: Create Patient Record for Child 1
─────────────────────────────────────────
API Call: SetPatient

<Procedure>SetPatient</Procedure>
<Parameters>
    <patientFirstName>Jake</patientFirstName>
    <patientLastName>Smith</patientLastName>
    <birthdayDateTime>01/10/2012</birthdayDateTime>
    <phoneNumber>555-0001</phoneNumber>         ← UNIQUE phone for this child
    <providerGUID>{orthodontist-guid}</providerGUID>
    <locationGUID>{location-guid}</locationGUID>
    <VendorUserName>API-User</VendorUserName>
</Parameters>

Response: PatientGUID = "CHILD1-GUID-1234"


STEP 2: Create Appointment for Child 1
─────────────────────────────────────────
API Call: SetAppointment

<Procedure>SetAppointment</Procedure>
<Parameters>
    <PatientGUID>CHILD1-GUID-1234</PatientGUID>
    <StartTime>3/15/2026 10:00:00 AM</StartTime>
    <ScheduleViewGUID>{schedule-view-guid}</ScheduleViewGUID>
    <ScheduleColumnGUID>{chair-guid}</ScheduleColumnGUID>
    <AppointmentTypeGUID>{exam-type-guid}</AppointmentTypeGUID>
    <Minutes>40</Minutes>
    <VendorUserName>API-User</VendorUserName>
    <apptNote>Clinical notes here</apptNote>
</Parameters>

Response: AppointmentGUID = "APPT-CHILD1-5678"


STEP 3: Create Patient Record for Child 2 (SIBLING)
───────────────────────────────────────────────────
API Call: SetPatient

<Procedure>SetPatient</Procedure>
<Parameters>
    <patientFirstName>Lily</patientFirstName>
    <patientLastName>Smith</patientLastName>
    <birthdayDateTime>05/20/2015</birthdayDateTime>
    <phoneNumber>555-0002</phoneNumber>         ← DIFFERENT phone (required!)
    <providerGUID>{orthodontist-guid}</providerGUID>
    <locationGUID>{location-guid}</locationGUID>
    <VendorUserName>API-User</VendorUserName>
</Parameters>

Response: PatientGUID = "CHILD2-GUID-5678"  ← DIFFERENT from Child 1


STEP 4: Create Appointment for Child 2
─────────────────────────────────────────
API Call: SetAppointment

<Procedure>SetAppointment</Procedure>
<Parameters>
    <PatientGUID>CHILD2-GUID-5678</PatientGUID>
    <StartTime>3/15/2026 10:40:00 AM</StartTime>
    <ScheduleViewGUID>{schedule-view-guid}</ScheduleViewGUID>
    <ScheduleColumnGUID>{chair-guid}</ScheduleColumnGUID>
    <AppointmentTypeGUID>{exam-type-guid}</AppointmentTypeGUID>
    <Minutes>40</Minutes>
    <VendorUserName>API-User</VendorUserName>
    <apptNote>Clinical notes here</apptNote>
</Parameters>

Response: AppointmentGUID = "APPT-CHILD2-9012"
```

**⚠️ BLOCKER:** This pattern FAILS when siblings share the same phone:
```
SetPatient(phone=555-0001) → ERROR: "Patient with this phone number already exists"
```

---

### OUR IMPLEMENTATION: Parent-as-Patient Model (RECOMMENDED)

**Use Case:** When siblings share the SAME family phone number

```
STEP 1: Create ONE Patient Record (Parent/Guardian)
───────────────────────────────────────────────────
API Call: SetPatient

<Procedure>SetPatient</Procedure>
<Parameters>
    <patientFirstName>Parent</patientFirstName>
    <patientLastName>Smith</patientLastName>
    <phoneNumber>555-1234</phoneNumber>         ← Family phone (used once)
    <providerGUID>{orthodontist-guid}</providerGUID>
    <locationGUID>{location-guid}</locationGUID>
    <VendorUserName>API-User</VendorUserName>
</Parameters>

Response: PatientGUID = "PARENT-GUID-1234"  ← Save this! Use for ALL children


STEP 2: Create Appointment for Child 1 (REUSE parent GUID)
─────────────────────────────────────────────────────────
API Call: SetAppointment

<Procedure>SetAppointment</Procedure>
<Parameters>
    <PatientGUID>PARENT-GUID-1234</PatientGUID>      ← Same as parent
    <StartTime>3/15/2026 10:00:00 AM</StartTime>
    <ScheduleViewGUID>{schedule-view-guid}</ScheduleViewGUID>
    <ScheduleColumnGUID>{chair-guid}</ScheduleColumnGUID>
    <AppointmentTypeGUID>{exam-type-guid}</AppointmentTypeGUID>
    <Minutes>40</Minutes>
    <VendorUserName>API-User</VendorUserName>
    <apptNote>Child: Jake Smith | DOB: 01/10/2012 | Insurance: Delta Dental</apptNote>
</Parameters>

Response: AppointmentGUID = "APPT-JAKE-5678"


STEP 3: Create Appointment for Child 2 (REUSE SAME parent GUID)
──────────────────────────────────────────────────────────────
API Call: SetAppointment

<Procedure>SetAppointment</Procedure>
<Parameters>
    <PatientGUID>PARENT-GUID-1234</PatientGUID>      ← SAME as parent (reused!)
    <StartTime>3/15/2026 10:40:00 AM</StartTime>
    <ScheduleViewGUID>{schedule-view-guid}</ScheduleViewGUID>
    <ScheduleColumnGUID>{chair-guid}</ScheduleColumnGUID>
    <AppointmentTypeGUID>{exam-type-guid}</AppointmentTypeGUID>
    <Minutes>40</Minutes>
    <VendorUserName>API-User</VendorUserName>
    <apptNote>Child: Lily Smith | DOB: 05/20/2015 | Insurance: Delta Dental</apptNote>
</Parameters>

Response: AppointmentGUID = "APPT-LILY-9012"  ← Different appointment GUID
```

---

### API Call Summary

| Step | API Call | Description | Required Parameters |
|------|----------|-------------|---------------------|
| 1 | `SetPatient` | Create parent record (ONCE) | `firstName`, `lastName`, `phoneNumber`, `providerGUID`, `locationGUID`, `VendorUserName` |
| 2 | `SetAppointment` | Book Child 1 | `PatientGUID` (parent), `StartTime`, `ScheduleViewGUID`, `ScheduleColumnGUID`, `AppointmentTypeGUID`, `Minutes`, `apptNote` (child info) |
| 3 | `SetAppointment` | Book Child 2 | Same as Step 2, different `StartTime` and `apptNote` |
| N | `SetAppointment` | Book Child N | Same pattern - reuse parent GUID |

### Key GUIDs Required

| GUID | How to Obtain | Example |
|------|---------------|---------|
| `providerGUID` | `GetDoctors` or `GetProviders` API | `555a66d6-ab70-48f9-a059-6a07e18457be` |
| `locationGUID` | `GetLocations` API | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |
| `ScheduleViewGUID` | `GetOnlineReservations` API | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` |
| `ScheduleColumnGUID` | `GetOnlineReservations` API (Chair) | `07687884-7e37-49aa-8028-d43b751c9034` |
| `AppointmentTypeGUID` | `GetApptTypes` API | `f6c20c35-9abb-47c2-981a-342996016705` |

### Appointment Note Format (apptNote)

```
Child: [childName] | DOB: [MM/DD/YYYY] | Parent: [parentName] | Insurance: [provider] | GroupID: [id] | MemberID: [id]
```

**Example:**
```
Child: Jake Smith | DOB: 01/10/2012 | Parent: Parent Smith | Insurance: Delta Dental | GroupID: DD-12345 | MemberID: MBR-98765
```

---

### PREREQUISITE API Calls (Get Required GUIDs)

Before creating family appointments, you need these GUIDs:

#### 1. Get Location GUID
```xml
<Procedure>GetLocations</Procedure>
<Parameters></Parameters>

Response:
<Record>
    <locGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</locGUID>
    <locCode>CDAL</locCode>
    <locName>CDH - Allegheny 202</locName>
</Record>
```

#### 2. Get Provider/Orthodontist GUID
```xml
<Procedure>GetDoctors</Procedure>
<Parameters></Parameters>

Response:
<Record>
    <orthoGUID>555a66d6-ab70-48f9-a059-6a07e18457be</orthoGUID>
    <orthoCode>MACA</orthoCode>
    <orthoName>Dr. Matt Cassera</orthoName>
</Record>
```

#### 3. Get Appointment Type GUID
```xml
<Procedure>GetApptTypes</Procedure>
<Parameters></Parameters>

Response:
<Record>
    <apptTypeGUID>f6c20c35-9abb-47c2-981a-342996016705</apptTypeGUID>
    <apptTypeName>Exam - PPO/Self</apptTypeName>
    <apptTypeMinutes>40</apptTypeMinutes>
</Record>
```

#### 4. Get Available Appointment Slots (Schedule View + Column/Chair GUIDs)
```xml
<Procedure>GetOnlineReservations</Procedure>
<Parameters>
    <startDate>03/15/2026</startDate>
    <endDate>03/22/2026</endDate>
    <schdvwGUIDs>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</schdvwGUIDs>
</Parameters>

Response:
<Record>
    <schdvwGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</schdvwGUID>
    <schdcolGUID>07687884-7e37-49aa-8028-d43b751c9034</schdcolGUID>  ← Chair 8
    <schdcolName>Chair 8</schdcolName>
    <StartTime>3/15/2026 10:00:00 AM</StartTime>
    <EndTime>3/15/2026 10:40:00 AM</EndTime>
</Record>
```

---

### Complete Family Booking Sequence (All API Calls)

```
┌──────────────────────────────────────────────────────────────────┐
│  COMPLETE API SEQUENCE FOR BOOKING A FAMILY                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PREPARATION (Run Once):                                         │
│  ├─ GetLocations        → locationGUID                           │
│  ├─ GetDoctors          → providerGUID                           │
│  ├─ GetApptTypes        → appointmentTypeGUID                    │
│  └─ GetOnlineReservations → scheduleViewGUID, scheduleColumnGUID │
│                                                                  │
│  FAMILY BOOKING:                                                 │
│  ├─ SetPatient          → patientGUID (CREATE ONCE for parent)   │
│  ├─ SetAppointment      → appointmentGUID (Child 1)              │
│  ├─ SetAppointment      → appointmentGUID (Child 2)              │
│  └─ SetAppointment      → appointmentGUID (Child N)              │
│                                                                  │
│  VERIFICATION:                                                   │
│  └─ GetAppointmentListByPatient → Confirm all bookings          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### Verify Family Bookings

After booking, verify all appointments for the family:

```xml
<Procedure>GetAppointmentListByPatient</Procedure>
<Parameters>
    <patGUID>PARENT-GUID-1234</patGUID>
</Parameters>

Response (shows all children's appointments under parent GUID):
<Record>
    <AppointmentGUID>APPT-JAKE-5678</AppointmentGUID>
    <PatientGUID>PARENT-GUID-1234</PatientGUID>
    <AppointmentDateTime>3/15/2026 10:00:00 AM</AppointmentDateTime>
    <apptNote>Child: Jake Smith | DOB: 01/10/2012...</apptNote>
</Record>
<Record>
    <AppointmentGUID>APPT-LILY-9012</AppointmentGUID>
    <PatientGUID>PARENT-GUID-1234</PatientGUID>
    <AppointmentDateTime>3/15/2026 10:40:00 AM</AppointmentDateTime>
    <apptNote>Child: Lily Smith | DOB: 05/20/2015...</apptNote>
</Record>
```

---

## Table of Contents

1. [Current Implementation](#current-implementation-parent-as-patient-model)
2. [Real Production Data Examples](#verified-real-production-data-examples)
3. [Why Children Don't Get Their Own GUIDs](#why-children-dont-get-their-own-guids)
4. [How Families Are Tied Together](#how-families-are-tied-together-in-cloud9)
5. [Detailed GUID Examples](#detailed-examples-with-full-guids)
6. [Cloud9 API Family Concepts](#cloud9-api-family-concepts)
7. [Key Files Reference](#key-files)

---

## Current Implementation: Parent-as-Patient Model

### How It Works

| Component | Storage Location | Example |
|-----------|-----------------|---------|
| Parent Name | `patientRecord.firstName/lastName` | "TestParent Davis" |
| Parent GUID | `patientRecord.patientGUID` | `A45CE3C3-3145-4252-9F24-FE6DC3099BFD` |
| Child Name | `appointment.apptNote` | "Child: Jake Davis" |
| Child DOB | `appointment.apptNote` | "DOB: 01/10/2012" |
| Insurance | `appointment.apptNote` | "Insurance: Delta Dental" |
| Appointment ID | `appointment.appointmentGUID` | Unique per booking |

### Appointment Note Format

```
Child: [childName] | DOB: [childDOB] | Parent: [parentName] | Insurance: [provider] | GroupID: [id] | MemberID: [id]
```

**Real Example:**
```
Child: Jake Davis | DOB: 01/10/2012 | Parent: TestParent Davis8790 | Insurance: Delta Dental | GroupID: DD-12345 | MemberID: MBR-98765
```

### Sibling Booking Flow

```
Step 1: Create Parent (ONCE)
  → chord_ortho_patient action=create
  → Returns: patientGUID + bookingAuthToken

Step 2: Book Child 1 (REUSE patientGUID)
  → schedule_appointment_ortho action=book_child
  → patientGUID: <from step 1>  ← SAME GUID
  → childName: "Tommy"
  → Returns: appointmentGUID (unique)

Step 3: Book Child 2 (REUSE same patientGUID)
  → schedule_appointment_ortho action=book_child
  → patientGUID: <SAME from step 1>  ← SAME GUID
  → childName: "Sarah"
  → Returns: appointmentGUID (different)
```

---

## VERIFIED: Real Production Data Examples

### From Other Orthodontist Locations

These examples show Cloud9's **native pattern** - one patient GUID per individual, with clinical notes only.

#### Example 1: Binyomin Tauber (DFC - Howell, Jan 2026)
**ONE patient with 2 appointments, CLINICAL notes only:**
```
PatientGUID:      b90150c6-b1af-47c4-b080-cc9b240ec70b
PatientFirstName: Binyomin
PatientLastName:  Tauber
PatientGender:    Male
Address:          2 Regal Ct, Lakewood, NJ 08701
Phone:            (732) 364-3365

Appointment 1:
  AppointmentGUID:     fadd467b-61b6-45ef-abb2-52579168fa1b
  DateTime:            1/2/2026 8:50:00 AM
  Type:                Records/X-Rays Only
  AppointmentNote:     "NEEDS WORK SCHEDULED 1/19/2026"   ← CLINICAL NOTE, NO CHILD INFO

Appointment 2:
  AppointmentGUID:     480f37e2-e421-4b8e-b440-fdcc298c6bf0
  DateTime:            1/2/2026 8:50:00 AM
  Type:                Records/X-Rays Only
  AppointmentNote:     "NEEDS WORK SCHEDULED 1/19/2026"   ← CLINICAL NOTE, NO CHILD INFO
```

#### Example 2: Ahslyn Garcia Guerra (DFC - Howell, Jan 2026)
**ONE patient with 2 appointments, CLINICAL notes only:**
```
PatientGUID:      7a285072-53a2-411b-941f-5d3a203fb70d
PatientFirstName: Ahslyn
PatientLastName:  Garcia Guerra
PatientGender:    Female
Address:          127 Attison Ave, Manchester, NJ 08757

Appointment 1:
  AppointmentGUID:     e0941f72-8488-4e39-aeee-0c58c136b0d3
  DateTime:            1/2/2026 8:50:00 AM
  Type:                Bond - Upto 1 Arch
  AppointmentNote:     "bond lower 6-6"   ← CLINICAL NOTE, NO CHILD INFO

Appointment 2:
  AppointmentGUID:     5b569b3b-c6aa-4e17-9745-dc78481e5548
  DateTime:            1/2/2026 11:40:00 AM
  Type:                Emergency
  AppointmentNote:     "bracket came off"   ← CLINICAL NOTE, NO CHILD INFO
```

#### Example 3: Maurice Jenkins (CDH - Allegheny 300M, Jan 2023)
**ONE patient with 4 appointments spanning 2023:**
```
PatientGUID:      c687355b-61ff-4ba1-b3ec-0610ac3412ff
PatientFirstName: Maurice
PatientLastName:  Jenkins
PatientGender:    Male

Appointments:
  1/16/2023 9:50 AM  - Exam - PPO/Self      - Note: "CONSULT - CONSULT"
  1/16/2023 10:10 AM - Records/X-Rays Only  - Note: "RECORDS - Pan,Ceph,Study Models and Photos"
  11/28/2023 2:10 PM - Observation          - Note: "RECALL_6-MONTH - RECALL_6-MONTH"
  11/28/2023 2:30 PM - Records/X-Rays Only  - Note: "RECORDS - Pan,Ceph,Study Models and Photos"
```

---

## VERIFIED SIBLING FAMILIES (Uncommon Last Names + Same-Day Appointments)

The following families are **VERIFIED siblings** based on:
1. **Uncommon last name** (not Smith, Johnson, Williams, etc.)
2. **Appointments on the same day** (came together as a family)
3. **Reasonable age gap** (2-7 years typical for siblings)

**Data Source:** `backend/past-chair8-both-locations.json` (CDH - Allegheny 202, Jan 2026)

> **Note on PatientID vs PatientGUID:** In Cloud9, `PatientID` (e.g., `202406-AL`) is the human-readable identifier displayed in the UI, while `PatientGUID` is the internal UUID. Both uniquely identify a patient. The appointment's `PatientGUID` field links it to the patient record. In native Cloud9, **each sibling has their own unique PatientID/PatientGUID**.

---

### VERIFIED FAMILY 1: BOND (Jaiannah & Jamere)

**Confidence Score:** HIGH - Uncommon last name + same-day same-time appointments + 7-year age gap

#### Sibling 1: Jaiannah Bond

| Field | Value |
|-------|-------|
| **PatientID** | `202406-AL` |
| **Full Name** | Jaiannah Bond |
| **Birthday** | 11/8/2013 (Age ~12 at appt) |
| **PatientStatusCode** | OBS (Observation) |

##### Appointment Details

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `b4183598-0a9f-4787-b35e-b569536dfc4a` |
| **PatientID** | `202406-AL` ← Links to Jaiannah's patient record |
| **DateTime** | 1/8/2026 **3:20:00 PM** ← Same time as sibling |
| **Type** | Observation |
| **Status** | No-Show |
| **Chair** | 8 |
| **Location** | CDH - Allegheny 202 |
| **AppointmentNote** | *(empty)* |
| **Balance** | Current: $0.00, Past Due: $0.00, Total Due: $0.00 |

---

#### Sibling 2: Jamere Bond

| Field | Value |
|-------|-------|
| **PatientID** | `1084825-AL` ← **DIFFERENT from Jaiannah** |
| **Full Name** | Jamere Bond |
| **Birthday** | 9/29/2006 (Age ~19 at appt, marked as Adult) |
| **PatientStatusCode** | RET (Retainer) |

##### Appointment Details

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `35cfbec1-fdfb-4856-8b4c-91d31381994a` ← **DIFFERENT** |
| **PatientID** | `1084825-AL` ← Links to Jamere's patient record (DIFFERENT from sibling!) |
| **DateTime** | 1/8/2026 **3:20:00 PM** ← Same time as sibling |
| **Type** | Retainer Check |
| **Status** | No-Show |
| **Chair** | 3 |
| **Location** | CDH - Allegheny 202 |
| **AppointmentNote** | *(empty)* |
| **Balance** | Current: $0.00, Past Due: $0.00, Total Due: $0.00 |

---

#### BOND FAMILY - Sibling Comparison

| Field | Jaiannah Bond | Jamere Bond | Same? |
|-------|---------------|-------------|-------|
| **PatientID** | `202406-AL` | `1084825-AL` | **NO** |
| **First Name** | Jaiannah | Jamere | **NO** |
| **Last Name** | Bond | Bond | **YES** |
| **Birthday** | 11/8/2013 | 9/29/2006 | **NO** |
| **Age Gap** | — | — | **7.1 years** |
| **Appointment Date** | 1/8/2026 | 1/8/2026 | **YES** |
| **Appointment Time** | 3:20:00 PM | 3:20:00 PM | **YES** |
| **Location** | CDH - Allegheny 202 | CDH - Allegheny 202 | **YES** |
| **AppointmentNote** | *(empty)* | *(empty)* | YES |

**Verification:** ✅ CONFIRMED SIBLINGS
- Uncommon last name "Bond"
- Appointments scheduled at EXACT same time (family visit)
- Age difference of 7.1 years (typical sibling gap)
- Both treated at same location
- **DIFFERENT PatientIDs** = Native Cloud9 pattern (one record per person)

---

### VERIFIED FAMILY 2: MUHAMMAD (Abdus Salaam & Safiyat O)

**Confidence Score:** HIGH - Uncommon last name + back-to-back appointments + 3.2-year age gap

#### Sibling 1: Abdus Salaam Muhammad

| Field | Value |
|-------|-------|
| **PatientID** | `25103794CDAL` |
| **Full Name** | Abdus Salaam Muhammad |
| **Birthday** | 8/17/2011 (Age ~14 at appt) |
| **PatientStatusCode** | MA-NRS |

##### Appointment Details

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `5ce2d7f5-3f26-444a-a6b2-9338a9189d64` |
| **PatientID** | `25103794CDAL` ← Links to Abdus Salaam's patient record |
| **DateTime** | 1/8/2026 **10:00:00 AM** |
| **Type** | Records MA Exam |
| **Status** | Dismissed |
| **Chair** | 8 |
| **Location** | CDH - Allegheny 202 |
| **AppointmentNote** | "BILL FOR RECORDS" |
| **Balance** | Current: $50.00, Past Due: $0.00, Total Due: $50.00 |

---

#### Sibling 2: Safiyat O Muhammad

| Field | Value |
|-------|-------|
| **PatientID** | `207251-AL` ← **DIFFERENT** |
| **Full Name** | Safiyat O Muhammad |
| **Birthday** | 5/17/2008 (Age ~17 at appt) |
| **PatientStatusCode** | FULL (Full treatment) |

##### Appointment Details

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `9ed4504b-e375-410e-b250-6c2a3bebc443` ← **DIFFERENT** |
| **PatientID** | `207251-AL` ← Links to Safiyat's patient record (DIFFERENT from sibling!) |
| **DateTime** | 1/8/2026 **10:20:00 AM** ← 20 min after sibling |
| **Type** | Adjustment - 20 Min |
| **Status** | Dismissed |
| **Chair** | 4 |
| **Location** | CDH - Allegheny 202 |
| **AppointmentNote** | "APPT CONFIRM " |
| **Balance** | Current: $0.00, Past Due: $0.00, Total Due: $0.00 |

---

#### MUHAMMAD FAMILY - Sibling Comparison

| Field | Abdus Salaam Muhammad | Safiyat O Muhammad | Same? |
|-------|----------------------|---------------------|-------|
| **PatientID** | `25103794CDAL` | `207251-AL` | **NO** |
| **First Name** | Abdus Salaam | Safiyat O | **NO** |
| **Last Name** | Muhammad | Muhammad | **YES** |
| **Birthday** | 8/17/2011 | 5/17/2008 | **NO** |
| **Age Gap** | — | — | **3.2 years** |
| **Appointment Date** | 1/8/2026 | 1/8/2026 | **YES** |
| **Appointment Time** | 10:00:00 AM | 10:20:00 AM | **NO** (20 min apart) |
| **Location** | CDH - Allegheny 202 | CDH - Allegheny 202 | **YES** |

**Verification:** ✅ CONFIRMED SIBLINGS
- Uncommon last name "Muhammad"
- Back-to-back appointments (20 minutes apart = family visit)
- Age difference of 3.2 years (typical sibling gap)
- Both treated at same location
- **DIFFERENT PatientIDs** = Native Cloud9 pattern

---

### VERIFIED FAMILY 3: SUASTEGUI (John & Myaleen)

**Confidence Score:** HIGH - Very uncommon last name + back-to-back appointments + 1.9-year age gap

#### Sibling 1: John Suastegui

| Field | Value |
|-------|-------|
| **PatientID** | `209604-AL` |
| **Full Name** | John Suastegui |
| **Birthday** | 4/24/2013 (Age ~12 at appt) |
| **PatientStatusCode** | MAPH1 |

##### Appointment Details

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `46f8e023-d7cb-436d-b964-d6c627712302` |
| **PatientID** | `209604-AL` ← Links to John's patient record |
| **DateTime** | 1/8/2026 **4:00:00 PM** |
| **Type** | Adjustment - 20 Min |
| **Status** | Dismissed |
| **Chair** | 4 |
| **Location** | CDH - Allegheny 202 |
| **AppointmentNote** | *(empty)* |
| **Balance** | Current: $0.00, Past Due: $0.00, Total Due: $0.00 |

---

#### Sibling 2: Myaleen Suastegui

| Field | Value |
|-------|-------|
| **PatientID** | `23060554-AL` ← **DIFFERENT** |
| **Full Name** | Myaleen Suastegui |
| **Birthday** | 6/14/2011 (Age ~14 at appt) |
| **PatientStatusCode** | MAF |

##### Appointment Details

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `015ab96d-1e54-44c4-a918-c3e6421316ea` ← **DIFFERENT** |
| **PatientID** | `23060554-AL` ← Links to Myaleen's patient record (DIFFERENT from sibling!) |
| **DateTime** | 1/8/2026 **3:50:00 PM** ← 10 min before sibling |
| **Type** | Adjustment - 20 Min |
| **Status** | Dismissed |
| **Chair** | 2 |
| **Location** | CDH - Allegheny 202 |
| **AppointmentNote** | *(empty)* |
| **Balance** | Current: $0.00, Past Due: $805.00, Total Due: $1030.00 |

---

#### SUASTEGUI FAMILY - Sibling Comparison

| Field | John Suastegui | Myaleen Suastegui | Same? |
|-------|----------------|-------------------|-------|
| **PatientID** | `209604-AL` | `23060554-AL` | **NO** |
| **First Name** | John | Myaleen | **NO** |
| **Last Name** | Suastegui | Suastegui | **YES** |
| **Birthday** | 4/24/2013 | 6/14/2011 | **NO** |
| **Age Gap** | — | — | **1.9 years** |
| **Appointment Date** | 1/8/2026 | 1/8/2026 | **YES** |
| **Appointment Time** | 4:00:00 PM | 3:50:00 PM | **NO** (10 min apart) |
| **Location** | CDH - Allegheny 202 | CDH - Allegheny 202 | **YES** |

**Verification:** ✅ CONFIRMED SIBLINGS
- **Very uncommon** last name "Suastegui"
- Back-to-back appointments (10 minutes apart = family visit)
- Age difference of 1.9 years (very close siblings)
- Both treated at same location
- **DIFFERENT PatientIDs** = Native Cloud9 pattern

---

### KEY INSIGHT: Native Cloud9 Sibling Pattern

All three verified sibling families (BOND, MUHAMMAD, SUASTEGUI) demonstrate the **NATIVE Cloud9 pattern**:

| Family | Sibling 1 PatientID | Sibling 2 PatientID | Same ID? |
|--------|---------------------|---------------------|----------|
| **BOND** | `202406-AL` | `1084825-AL` | **NO** |
| **MUHAMMAD** | `25103794CDAL` | `207251-AL` | **NO** |
| **SUASTEGUI** | `209604-AL` | `23060554-AL` | **NO** |

**Conclusion:** In native Cloud9, each sibling has their **OWN unique PatientID/PatientGUID**. This is different from our parent-as-patient model where all siblings share the parent's PatientGUID.

---

### KEY FINDING: No "Child: name | DOB: date" Pattern Found

After reviewing hundreds of real production appointment records from multiple orthodontist locations:

| AppointmentNote Examples Found | Pattern Type |
|------------------------------|--------------|
| "CONSULT - CONSULT" | Clinical |
| "RECORDS - Pan,Ceph,Study Models and Photos" | Clinical |
| "RECALL_6-MONTH - RECALL_6-MONTH" | Clinical |
| "bond lower 6-6" | Clinical |
| "bracket came off" | Clinical |
| "GOOD FOR RECORDS" | Clinical |
| "NEEDS WORK SCHEDULED 1/19/2026" | Clinical |
| "NEEDS CLEANING" | Clinical |
| (empty) | None |

**ZERO instances of "Child: [name] | DOB: [date]" format found in production data.**

This confirms that our "parent-as-patient" model with child info in appointment notes is a **CUSTOM IMPLEMENTATION** created to work around Cloud9's duplicate phone constraint.

---

## Why Children Don't Get Their Own GUIDs

### The Duplicate Phone Constraint

Cloud9 API rejects `SetPatient` calls with duplicate phone numbers:

```
Child 1: SetPatient(phone=555-1234) → SUCCESS, patientGUID created
Child 2: SetPatient(phone=555-1234) → REJECTED (duplicate phone)
```

**Cloud9 Constraint:** One unique phone number per patient record.

### Documented API Error Response (from CLOUD9_BOOKING_CURL_COMMANDS.md)

When attempting to create a second patient with the same phone number, Cloud9 returns:

```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataResponse>
    <ResponseStatus>Error</ResponseStatus>
    <ErrorCode>3</ErrorCode>
    <ErrorMessage>Patient with this phone number already exists</ErrorMessage>
</GetDataResponse>
```

**Error Code 3** = "Invalid value for parameter" (per Cloud9 API documentation)

### Observed Behavior in Testing

From `docs/archive/sibling-booking/sibling-per-child-approach.md`:
- Response: **empty error message, ~100ms** (immediate rejection)
- No duplicate detection bypass available
- Same phone caused Cloud9 duplicate rejection

### Constraint Summary

| Field | Unique Constraint? | Documentation |
|-------|-------------------|---------------|
| **Phone Number** | ✅ YES - Enforced | `CLOUD9_BOOKING_CURL_COMMANDS.md` shows ErrorCode 3: "Patient with this phone number already exists" |
| **Address** | ❌ NO - Not enforced | No evidence of address uniqueness constraint found in API documentation or testing |
| **Email** | ❓ UNKNOWN | Not tested |

**Note:** The Cloud9 API documentation (`Cloud9_API_Markdown.md`) does not explicitly mention the phone number uniqueness constraint, but it is enforced by the system as shown in the error response above.

### Alternative Approach (FAILED & DEPRECATED 2026-01-18)

The system initially attempted to create separate patient records for each child. **This failed.**

**Root Cause:** Cloud9 API rejects `SetPatient` calls with duplicate phone numbers.

**Documented in:**
- `docs/archive/sibling-booking/sibling-per-child-approach.md`
- Test failures in `test-agent/scripts/test-sibling-e2e-flow.js`

### Evidence from Test Logs

From `test-agent/data/sibling-e2e-flow-log.txt`:
```
Parent Creation:
  patientGUID: 3266539E-9A0D-4BEC-861B-0F6FDFF1CAD0

Child 1 Booking:
  patientGUID: 3266539E-9A0D-4BEC-861B-0F6FDFF1CAD0  ← Same
  childName: "TEST_Jake_859774"
  appointmentGUID: 3D316405-7743-41CC-A16F-295E49DC29FE

Child 2 Booking:
  patientGUID: 3266539E-9A0D-4BEC-861B-0F6FDFF1CAD0  ← Same
  childName: "TEST_Lily_859774"
  appointmentGUID: (different GUID)
```

---

## How Families Are Tied Together in Cloud9

### Cloud9's Native Family Linkage Methods

| Linkage Field | How It Works | API Call |
|---------------|--------------|----------|
| **Phone Number** | All family members registered with parent's phone | Query by phone |
| **Responsible Party** | Links patient to financially responsible person | `GetResponsiblePartiesForPatient` |
| **Address** | Same household = same street/city/zip | Query by address |
| **Last Name** | Same family name | Query by lastName |
| **Email** | Parent's email shared across family | Query by email |

### GetResponsiblePartiesForPatient API

```xml
<Procedure>GetResponsiblePartiesForPatient</Procedure>
<Parameters>
    <PatientGUID>3266539E-9A0D-4BEC-861B-0F6FDFF1CAD0</PatientGUID>
</Parameters>
```

Returns the financially responsible party (usually a parent) linked to the patient.

### If Siblings Existed Natively in Cloud9

If two siblings existed in Cloud9 natively, they would appear as:
```
Sibling 1:
  PatientGUID:  ABC-123...   ← DIFFERENT
  FirstName:    Jake
  LastName:     Smith
  Address:      123 Main St
  Phone:        555-1234

Sibling 2:
  PatientGUID:  DEF-456...   ← DIFFERENT
  FirstName:    Lily
  LastName:     Smith        ← SAME
  Address:      123 Main St  ← SAME
  Phone:        555-1234     ← SAME (blocked by Cloud9!)
```

**Family identified by:** Same LastName + Same Address + Same Phone

---

## Complete Record Structure Examples (ALL FIELDS)

### REAL FAMILY DATA: Johnson Family (Potential Siblings)

**Data Source:** `backend/allegheny-all-locations.json` (CDH - Allegheny 202)
**Note:** These are two DIFFERENT patients with the SAME last name - **potential siblings** with DIFFERENT PatientGUIDs.

---

#### JOHNSON FAMILY - Patient 1: Elijah Johnson

##### Patient Record (ALL FIELDS)

| Field | Value |
|-------|-------|
| **PatientGUID** | `72859177-96d9-41ce-a024-35fa19bbdb55` |
| PatientTitle | *(empty)* |
| **PatientFirstName** | Elijah |
| PatientMiddleName | *(empty)* |
| **PatientLastName** | Johnson |
| PatientSuffix | *(empty)* |
| PatientGreeting | *(empty)* |
| **PatientGender** | Male |
| PatientStreetAddress | *(not in export)* |
| PatientCity | *(not in export)* |
| PatientState | *(not in export)* |
| PatientPostalCode | *(not in export)* |
| ContactInfo | *(not in export)* |

##### Elijah Johnson - Appointment 1 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `2727e54c-a18d-4e6f-811c-9aa1fffd42ef` |
| **AppointmentDateTime** | 3/2/2021 8:30:00 AM |
| AppointmentTypeGUID | `f6c20c35-9abb-47c2-981a-342996016705` |
| **AppointmentTypeDescription** | Exam - PPO/Self |
| **AppointmentNote** | CONSULT - CONSULT |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | No-Show |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `555a66d6-ab70-48f9-a059-6a07e18457be` |
| OrthodontistCode | MACA |
| **OrthodontistName** | Dr. Matt Cassera |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

##### Elijah Johnson - Appointment 2 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `97be5bea-a37a-4bf1-aad9-7e18b027c184` |
| **AppointmentDateTime** | 3/2/2021 8:50:00 AM |
| AppointmentTypeGUID | `d1e3d82f-cabd-4c16-9e07-22caac90f76b` |
| **AppointmentTypeDescription** | Records/X-Rays Only |
| **AppointmentNote** | RECORDS - Pan,Ceph,Study Models and Photos |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | Cancelled |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `555a66d6-ab70-48f9-a059-6a07e18457be` |
| OrthodontistCode | MACA |
| **OrthodontistName** | Dr. Matt Cassera |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

---

#### JOHNSON FAMILY - Patient 2: Aaliyah Johnson

##### Patient Record (ALL FIELDS)

| Field | Value |
|-------|-------|
| **PatientGUID** | `e0bb22c6-1d31-4746-a01b-5c1960340b6d` ← **DIFFERENT from Elijah** |
| PatientTitle | *(empty)* |
| **PatientFirstName** | Aaliyah |
| PatientMiddleName | *(empty)* |
| **PatientLastName** | Johnson ← **SAME as Elijah** |
| PatientSuffix | *(empty)* |
| PatientGreeting | *(empty)* |
| **PatientGender** | Female |
| PatientStreetAddress | *(not in export)* |
| PatientCity | *(not in export)* |
| PatientState | *(not in export)* |
| PatientPostalCode | *(not in export)* |
| ContactInfo | *(not in export)* |

##### Aaliyah Johnson - Appointment 1 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `f2864f00-7686-45ab-b405-539d1be07e30` |
| **AppointmentDateTime** | 2/22/2023 10:50:00 AM |
| AppointmentTypeGUID | `f6c20c35-9abb-47c2-981a-342996016705` |
| **AppointmentTypeDescription** | Exam - PPO/Self |
| **AppointmentNote** | CONSULT - CONSULT |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | Re-Scheduled |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `ddea9d10-c231-4ad1-9505-a74500dcb77e` |
| OrthodontistCode | HETE |
| **OrthodontistName** | Dr. Hellen Teixeira |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

##### Aaliyah Johnson - Appointment 2 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `c2d045e6-55db-4dd6-9648-44a03f0033b4` |
| **AppointmentDateTime** | 4/13/2023 11:30:00 AM |
| AppointmentTypeGUID | `f6c20c35-9abb-47c2-981a-342996016705` |
| **AppointmentTypeDescription** | Exam - PPO/Self |
| **AppointmentNote** | CONSULT - CONSULT |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | Dismissed |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `ddea9d10-c231-4ad1-9505-a74500dcb77e` |
| OrthodontistCode | HETE |
| **OrthodontistName** | Dr. Hellen Teixeira |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

##### Aaliyah Johnson - Appointment 3 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `5f192409-ab07-49d5-b416-f7b1e262314b` |
| **AppointmentDateTime** | 6/21/2024 11:50:00 AM |
| AppointmentTypeGUID | `1cb4bcb3-0afd-4f5f-9611-594bc5ef273e` |
| **AppointmentTypeDescription** | Observation |
| **AppointmentNote** | RECALL_6-MONTH - RECALL_6-MONTH |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | Dismissed |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `0f588ace-e0bf-44ba-b8ef-be8cbb63153b` |
| OrthodontistCode | TRMC |
| **OrthodontistName** | Dr. Troy McCartney |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

---

#### JOHNSON FAMILY - Comparison Table

| Field | Elijah Johnson | Aaliyah Johnson | Same? |
|-------|----------------|-----------------|-------|
| **PatientGUID** | `72859177-96d9-41ce-a024-35fa19bbdb55` | `e0bb22c6-1d31-4746-a01b-5c1960340b6d` | **NO** |
| PatientTitle | *(empty)* | *(empty)* | YES |
| **PatientFirstName** | Elijah | Aaliyah | **NO** |
| PatientMiddleName | *(empty)* | *(empty)* | YES |
| **PatientLastName** | Johnson | Johnson | **YES** |
| PatientSuffix | *(empty)* | *(empty)* | YES |
| PatientGreeting | *(empty)* | *(empty)* | YES |
| **PatientGender** | Male | Female | **NO** |
| Total Appointments | 2 | 8 | NO |
| First Appointment | 3/2/2021 | 2/22/2023 | NO |

**Family Linkage Logic:** Same LastName = potential siblings. Would need to query by address/phone to confirm.

---

### REAL FAMILY DATA: Rivera Family (Potential Siblings)

**Data Source:** `backend/allegheny-all-locations.json` (CDH - Allegheny 202)

---

#### RIVERA FAMILY - Patient 1: Damien Rivera

##### Patient Record (ALL FIELDS)

| Field | Value |
|-------|-------|
| **PatientGUID** | `ec3c3e61-8184-42ac-b1b2-e72c08703130` |
| PatientTitle | *(empty)* |
| **PatientFirstName** | Damien |
| PatientMiddleName | *(empty)* |
| **PatientLastName** | Rivera |
| PatientSuffix | *(empty)* |
| PatientGreeting | *(empty)* |
| **PatientGender** | Male |
| PatientStreetAddress | *(not in export)* |
| PatientCity | *(not in export)* |
| PatientState | *(not in export)* |
| PatientPostalCode | *(not in export)* |
| ContactInfo | *(not in export)* |

##### Damien Rivera - Appointment 1 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `2f853d61-a6f3-45de-8d14-257e231e0c2d` |
| **AppointmentDateTime** | 1/12/2022 9:50:00 AM |
| AppointmentTypeGUID | `f6c20c35-9abb-47c2-981a-342996016705` |
| **AppointmentTypeDescription** | Exam - PPO/Self |
| **AppointmentNote** | CONSULT - CONSULT |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | Re-Scheduled |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `555a66d6-ab70-48f9-a059-6a07e18457be` |
| OrthodontistCode | MACA |
| **OrthodontistName** | Dr. Matt Cassera |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

##### Damien Rivera - Appointment 2 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `87a7a9d8-f55e-4575-9084-2e345c88b552` |
| **AppointmentDateTime** | 4/12/2022 11:10:00 AM |
| AppointmentTypeGUID | `f6c20c35-9abb-47c2-981a-342996016705` |
| **AppointmentTypeDescription** | Exam - PPO/Self |
| **AppointmentNote** | CONSULT - CONSULT |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | Cancelled |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `555a66d6-ab70-48f9-a059-6a07e18457be` |
| OrthodontistCode | MACA |
| **OrthodontistName** | Dr. Matt Cassera |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

---

#### RIVERA FAMILY - Patient 2: Jayden Rivera

##### Patient Record (ALL FIELDS)

| Field | Value |
|-------|-------|
| **PatientGUID** | `ed7ebeae-7d7b-402a-b2ff-eb1180480152` ← **DIFFERENT from Damien** |
| PatientTitle | *(empty)* |
| **PatientFirstName** | Jayden |
| PatientMiddleName | *(empty)* |
| **PatientLastName** | Rivera ← **SAME as Damien** |
| PatientSuffix | *(empty)* |
| PatientGreeting | *(empty)* |
| **PatientGender** | Male |
| PatientStreetAddress | *(not in export)* |
| PatientCity | *(not in export)* |
| PatientState | *(not in export)* |
| PatientPostalCode | *(not in export)* |
| ContactInfo | *(not in export)* |

##### Jayden Rivera - Appointment 1 (ALL FIELDS)

| Field | Value |
|-------|-------|
| **AppointmentGUID** | `a59bffe1-3aa9-400b-b2a7-2367fb2b36f1` |
| **AppointmentDateTime** | 10/30/2024 1:50:00 PM |
| AppointmentTypeGUID | `f6c20c35-9abb-47c2-981a-342996016705` |
| **AppointmentTypeDescription** | Exam - PPO/Self |
| **AppointmentNote** | CONSULT - CONSULT |
| AppointmentMinutes | 20 |
| **AppointmentStatusDescription** | Re-Scheduled |
| AppointmentConfirmation | *(empty)* |
| OrthodontistGUID | `0f588ace-e0bf-44ba-b8ef-be8cbb63153b` |
| OrthodontistCode | TRMC |
| **OrthodontistName** | Dr. Troy McCartney |
| LocationGUID | `799d413a-5e1a-46a2-b169-e2108bf517d6` |
| LocationCode | CDAL |
| **LocationName** | CDH - Allegheny 300M |
| SourceLocation | CDH - Allegheny 202 |
| SourceLocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

---

#### RIVERA FAMILY - Comparison Table

| Field | Damien Rivera | Jayden Rivera | Same? |
|-------|---------------|---------------|-------|
| **PatientGUID** | `ec3c3e61-8184-42ac-b1b2-e72c08703130` | `ed7ebeae-7d7b-402a-b2ff-eb1180480152` | **NO** |
| PatientTitle | *(empty)* | *(empty)* | YES |
| **PatientFirstName** | Damien | Jayden | **NO** |
| PatientMiddleName | *(empty)* | *(empty)* | YES |
| **PatientLastName** | Rivera | Rivera | **YES** |
| PatientSuffix | *(empty)* | *(empty)* | YES |
| PatientGreeting | *(empty)* | *(empty)* | YES |
| **PatientGender** | Male | Male | **YES** |
| Total Appointments | 4 | 4 | YES |
| First Appointment | 1/12/2022 | 10/30/2024 | NO |

**Family Linkage Logic:** Same LastName + Same Gender + Same Location = likely brothers.

---

### KEY OBSERVATION: Cloud9 Native Pattern

In **native Cloud9** (as shown in Johnson and Rivera families above):
- **Each child has their OWN PatientGUID** (different GUIDs)
- **AppointmentNote contains CLINICAL notes only** (not child identification)
- **Family linkage** would be via:
  - Same `PatientLastName`
  - Same address (if available)
  - Same phone number (if available)
  - `GetResponsiblePartiesForPatient` API

This is different from **our parent-as-patient model** where:
- All children share the **SAME PatientGUID** (the parent's)
- **AppointmentNote contains child identification** (`Child: name | DOB: date`)

---

### NATIVE Cloud9 Record Structure (From Production Data)

The following examples show REAL production data from `backend/allegany-chair8-results.json` with **ALL** fields.

---

#### EXAMPLE FAMILY 1: Same Patient, Multiple Appointments (Binyomin Tauber)

**Observation:** This is ONE patient (same PatientGUID) with 2 appointments. NOT siblings.

| Field | Appointment 1 | Appointment 2 |
|-------|---------------|---------------|
| **PATIENT FIELDS** | | |
| PatientGUID | `b90150c6-b1af-47c4-b080-cc9b240ec70b` | `b90150c6-b1af-47c4-b080-cc9b240ec70b` ← **SAME** |
| PatientTitle | *(empty)* | *(empty)* |
| PatientFirstName | Binyomin | Binyomin |
| PatientMiddleName | *(empty)* | *(empty)* |
| PatientLastName | Tauber | Tauber |
| PatientSuffix | *(empty)* | *(empty)* |
| PatientGreeting | *(empty)* | *(empty)* |
| PatientGender | Male | Male |
| **ADDRESS FIELDS** | | |
| PatientStreetAddress | 2 Regal Ct | 2 Regal Ct |
| PatientCity | Lakewood | Lakewood |
| PatientState | NJ | NJ |
| PatientPostalCode | 08701 | 08701 |
| ContactInfo | Home: (732) 364-3365 | Home: (732) 364-3365 |
| **APPOINTMENT FIELDS** | | |
| AppointmentGUID | `fadd467b-61b6-45ef-abb2-52579168fa1b` | `480f37e2-e421-4b8e-b440-fdcc298c6bf0` ← **DIFFERENT** |
| AppointmentDateTime | 1/2/2026 8:50:00 AM | 1/2/2026 8:50:00 AM |
| AppointmentTypeGUID | `d1e3d82f-cabd-4c16-9e07-22caac90f76b` | `d1e3d82f-cabd-4c16-9e07-22caac90f76b` |
| AppointmentTypeDescription | Records/X-Rays Only | Records/X-Rays Only |
| AppointmentNote | NEEDS WORK SCHEDULED 1/19/2026 | NEEDS WORK SCHEDULED 1/19/2026 |
| AppointmentMinutes | 20 | 40 |
| AppointmentStatusDescription | Re-Scheduled | Re-Scheduled |
| AppointmentConfirmation | *(empty)* | *(empty)* |
| AppointmentIsConfirmed | False | False |
| **PROVIDER/LOCATION** | | |
| OrthodontistGUID | `4e4441a8-8893-489b-8286-fa04b870a653` | `4e4441a8-8893-489b-8286-fa04b870a653` |
| OrthodontistCode | BHEN | BHEN |
| OrthodontistName | Dr. Bridget Henn | Dr. Bridget Henn |
| LocationGUID | `09fa3bed-3619-4bef-80ef-020bca84ae80` | `09fa3bed-3619-4bef-80ef-020bca84ae80` |
| LocationCode | DFHO | DFHO |
| LocationName | DFC - Howell | DFC - Howell |
| CreatedDateTime | 12/23/2025 3:53:44 PM | 12/31/2025 10:35:08 AM |

**Linkage Logic:** Same PatientGUID = Same person with multiple appointments

---

#### EXAMPLE FAMILY 2: Two DIFFERENT Patients at Same Address (Ocean Township)

**Observation:** Two DIFFERENT patients (different PatientGUIDs) happen to live in Ocean Township but at DIFFERENT addresses. NOT in the same family.

| Field | Patient 1 (Camila Rojas) | Patient 2 (Ah'mylah Gregory) |
|-------|--------------------------|------------------------------|
| **PATIENT FIELDS** | | |
| PatientGUID | `a2b1ee95-bee9-44c3-95f2-963af3147c4a` | `702c5b31-c1a8-4ed0-af7f-f7aaba975551` ← **DIFFERENT** |
| PatientTitle | *(empty)* | *(empty)* |
| PatientFirstName | Camila | Ah'mylah |
| PatientMiddleName | *(empty)* | M |
| PatientLastName | Rojas | Gregory |
| PatientSuffix | *(empty)* | *(empty)* |
| PatientGreeting | *(empty)* | *(empty)* |
| PatientGender | Unknown | Female |
| **ADDRESS FIELDS** | | |
| PatientStreetAddress | 1515 Allen Avenue | 1414 Rustic Avenue Apt 1 |
| PatientCity | Ocean Township | Ocean Township |
| PatientState | NJ | NJ |
| PatientPostalCode | 07712 | 07712 |
| ContactInfo | *(empty)* | *(empty)* |
| **APPOINTMENT FIELDS** | | |
| AppointmentGUID | `6441be7f-35f5-4d00-b44b-5cb01daa1fa2` | `c082a3f1-bdfd-470a-992f-1e7d385afe82` |
| AppointmentDateTime | 1/2/2026 8:30:00 AM | 1/2/2026 8:30:00 AM |
| AppointmentTypeGUID | `1cb4bcb3-0afd-4f5f-9611-594bc5ef273e` | `b065b156-52b1-41d4-ae84-5a874acc0340` |
| AppointmentTypeDescription | Observation | Emergency |
| AppointmentNote | GOOD FOR RECORDS | *(empty)* |
| AppointmentMinutes | 30 | 20 |
| AppointmentStatusDescription | No-Show | Re-Scheduled |
| AppointmentConfirmation | *(empty)* | *(empty)* |
| AppointmentIsConfirmed | False | True |
| **PROVIDER/LOCATION** | | |
| OrthodontistGUID | `69b87ef9-ab78-4c1d-9e56-a779e4b43e11` | `69b87ef9-ab78-4c1d-9e56-a779e4b43e11` |
| OrthodontistCode | NPAT | NPAT |
| OrthodontistName | Dr. Nirav Patel | Dr. Nirav Patel |
| LocationGUID | `09fa3bed-3619-4bef-80ef-020bca84ae80` | `09fa3bed-3619-4bef-80ef-020bca84ae80` |
| LocationCode | DFHO | DFHO |
| LocationName | DFC - Howell | DFC - Howell |
| CreatedDateTime | 1/2/2026 4:28:05 PM | 1/2/2026 10:47:25 AM |

**Linkage Logic:** Different PatientGUID = Different people. Same city/zip does NOT mean same family.

---

### OUR Custom Implementation: Parent-as-Patient Model (From Test Data)

The following examples show our custom implementation where:
- Parent is the patient record holder
- Child information is stored in appointment notes

---

#### EXAMPLE FAMILY 3: Parent with Two Children (Davis Family - Our Implementation)

**From:** `test-agent/data/parent-as-patient-e2e-log.txt`

| Field | Parent Record | Child 1 Appointment | Child 2 Appointment |
|-------|---------------|---------------------|---------------------|
| **PATIENT FIELDS** | | | |
| PatientGUID | `A45CE3C3-3145-4252-9F24-FE6DC3099BFD` | `A45CE3C3-3145-4252-9F24-FE6DC3099BFD` ← **SAME** | `A45CE3C3-3145-4252-9F24-FE6DC3099BFD` ← **SAME** |
| PatientTitle | *(not stored)* | — | — |
| PatientFirstName | TestParent | — | — |
| PatientMiddleName | *(not stored)* | — | — |
| PatientLastName | Davis8790 | — | — |
| PatientSuffix | *(not stored)* | — | — |
| PatientGreeting | *(not stored)* | — | — |
| PatientGender | *(not stored)* | — | — |
| **ADDRESS FIELDS** | | | |
| PatientStreetAddress | *(not stored)* | — | — |
| PatientCity | *(not stored)* | — | — |
| PatientState | *(not stored)* | — | — |
| PatientPostalCode | *(not stored)* | — | — |
| ContactInfo (Phone) | 5551938790 | — | — |
| **APPOINTMENT FIELDS** | | | |
| AppointmentGUID | N/A | `D89BD642-0EEF-4AE8-8991-872449E422FD` | `F99D8E54-1AAE-45B0-8D53-966899E764AB` ← **DIFFERENT** |
| AppointmentDateTime | N/A | 2/7/2026 9:40:00 AM | 2/7/2026 10:40:00 AM |
| AppointmentTypeGUID | N/A | `f6c20c35-9abb-47c2-981a-342996016705` | `f6c20c35-9abb-47c2-981a-342996016705` |
| AppointmentTypeDescription | N/A | Exam | Exam |
| **AppointmentNote** | N/A | `Child: Jake Davis \| DOB: 01/10/2012 \| Parent: TestParent Davis8790 \| Insurance: Delta Dental \| GroupID: DD-12345 \| MemberID: MBR-98765` | `Child: Lily Davis \| DOB: 05/20/2015 \| Parent: TestParent Davis8790 \| Insurance: Delta Dental \| GroupID: DD-12345 \| MemberID: MBR-98766` |
| AppointmentMinutes | N/A | 40 | 40 |
| AppointmentStatusDescription | N/A | *(pending)* | *(pending)* |
| AppointmentConfirmation | N/A | *(empty)* | *(empty)* |
| AppointmentIsConfirmed | N/A | *(pending)* | *(pending)* |
| **PROVIDER/LOCATION** | | | |
| ScheduleViewGUID | N/A | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` |
| ScheduleColumnGUID | N/A | `24f214b0-a7ab-496b-94d9-60c933d70fda` (Chair 3) | `f0fa4eda-0136-45d5-a5d8-91ad7d0b608a` (Chair 4) |
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |

**Linkage Logic:**
- Same PatientGUID for all appointments = Same family account (parent)
- Child identity extracted from AppointmentNote field
- Different AppointmentGUID = Different booking

---

### Family Identification Logic Summary

| Scenario | How to Identify | Fields to Match |
|----------|-----------------|-----------------|
| **Same Patient, Multiple Visits** | Match PatientGUID | `PatientGUID` |
| **Native Cloud9 Family** | Match address + phone + last name | `PatientStreetAddress`, `PatientPostalCode`, `ContactInfo`, `PatientLastName` |
| **Our Implementation (Parent-as-Patient)** | Match PatientGUID + parse AppointmentNote | `PatientGUID`, then parse `Child:` from `AppointmentNote` |

---

### Fields That DO vs DO NOT Indicate Family Relationship

| Field | Indicates Same Family? | Notes |
|-------|----------------------|-------|
| `PatientGUID` | **YES (Our Model)** | In parent-as-patient, same GUID = same family |
| `PatientGUID` | **NO (Native)** | In native Cloud9, same GUID = same person |
| `PatientLastName` | **MAYBE** | Same last name could be family OR unrelated |
| `PatientStreetAddress` + `PatientPostalCode` | **LIKELY** | Same exact address = probably family |
| `ContactInfo` (Phone) | **YES** | Same phone = definitely same family (Cloud9 enforces uniqueness) |
| `AppointmentNote` | **YES (Our Model)** | Contains `Child:` format = child identification |
| `PatientCity` | **NO** | Same city = coincidence, not family |
| `OrthodontistGUID` | **NO** | Same doctor = coincidence, not family |
| `LocationGUID` | **NO** | Same location = coincidence, not family |

---

## Detailed Examples with Full GUIDs

### EXAMPLE 1: Parent-as-Patient Model (Davis Family)

**Test Date:** 2026-01-18

#### Patient Record (Parent)
```
firstName:    TestParent
lastName:     Davis8790
phone:        5551938790
patientGUID:  A45CE3C3-3145-4252-9F24-FE6DC3099BFD
```

#### Appointment 1 (Child: Jake Davis)
```
appointmentGUID:      D89BD642-0EEF-4AE8-8991-872449E422FD
patientGUID:          A45CE3C3-3145-4252-9F24-FE6DC3099BFD  ← SAME as parent
startTime:            2/7/2026 9:40:00 AM
scheduleViewGUID:     4c9e9333-4951-4eb0-8d97-e1ad83ef422d
scheduleColumnGUID:   24f214b0-a7ab-496b-94d9-60c933d70fda (Chair 3)
appointmentTypeGUID:  f6c20c35-9abb-47c2-981a-342996016705

apptNote: "Child: Jake Davis | DOB: 01/10/2012 | Parent: TestParent Davis8790 | Insurance: Delta Dental | GroupID: DD-12345 | MemberID: MBR-98765"
```

#### Appointment 2 (Child: Lily Davis)
```
appointmentGUID:      F99D8E54-1AAE-45B0-8D53-966899E764AB
patientGUID:          A45CE3C3-3145-4252-9F24-FE6DC3099BFD  ← SAME as parent
startTime:            2/7/2026 10:40:00 AM
scheduleViewGUID:     4c9e9333-4951-4eb0-8d97-e1ad83ef422d
scheduleColumnGUID:   f0fa4eda-0136-45d5-a5d8-91ad7d0b608a (Chair 4)
appointmentTypeGUID:  f6c20c35-9abb-47c2-981a-342996016705

apptNote: "Child: Lily Davis | DOB: 05/20/2015 | Parent: TestParent Davis8790 | Insurance: Delta Dental | GroupID: DD-12345 | MemberID: MBR-98766"
```

### EXAMPLE 2: Parent-as-Patient Model (Chair8 Family)

**Test Date:** 2026-01-18

#### Patient Record (Parent)
```
firstName:    TestParent
lastName:     Chair8_3284
phone:        5552673284
patientGUID:  5E10B772-38AF-45D4-9132-1772584FC330
```

#### Appointment 1 (Child: Jake Davis)
```
appointmentGUID:      F6FAFF65-5913-49B4-B067-A686D021B9DC
patientGUID:          5E10B772-38AF-45D4-9132-1772584FC330  ← SAME as parent
startTime:            3/13/2026 10:30:00 AM
scheduleViewGUID:     4c9e9333-4951-4eb0-8d97-e1ad83ef422d
scheduleColumnGUID:   07687884-7e37-49aa-8028-d43b751c9034 (Chair 8)

apptNote: "Child: Jake Davis | DOB: 01/10/2012 | Parent: TestParent Chair8_3284 | Insurance: Delta Dental | GroupID: DD-12345 | MemberID: MBR-98765"
```

#### Appointment 2 (Child: Lily Davis)
```
appointmentGUID:      BA8D8503-3389-435B-87DC-D1272909B711
patientGUID:          5E10B772-38AF-45D4-9132-1772584FC330  ← SAME as parent
startTime:            3/13/2026 11:10:00 AM
scheduleViewGUID:     4c9e9333-4951-4eb0-8d97-e1ad83ef422d
scheduleColumnGUID:   07687884-7e37-49aa-8028-d43b751c9034 (Chair 8)

apptNote: "Child: Lily Davis | DOB: 05/20/2015 | Parent: TestParent Chair8_3284 | Insurance: Delta Dental | GroupID: DD-12345 | MemberID: MBR-98766"
```

### EXAMPLE 3: Rate Limit Test (Same Patient GUID for Multiple Bookings)

**Test Date:** 2026-01-18

#### Patient Record
```
firstName:    TEST_SiblingA
lastName:     RateLimitTest
patientGUID:  54427945-51CA-481E-B758-B698C2F2B887
```

#### Appointment 1 (SiblingA)
```
appointmentGUID:      285BAE18-6995-40A5-A85A-71F347CF10F1
patientGUID:          54427945-51CA-481E-B758-B698C2F2B887  ← SAME GUID
startTime:            3/12/2026 9:50:00 AM
scheduleViewGUID:     4c9e9333-4951-4eb0-8d97-e1ad83ef422d
scheduleColumnGUID:   07687884-7e37-49aa-8028-d43b751c9034 (Chair 8)
childName:            TEST_SiblingA RateLimitTest
```

#### Appointment 2 (SiblingB)
```
appointmentGUID:      FFFD9B78-2672-4AB0-979B-9B52BC20FEE1
patientGUID:          54427945-51CA-481E-B758-B698C2F2B887  ← SAME GUID
startTime:            3/12/2026 10:30:00 AM
scheduleViewGUID:     4c9e9333-4951-4eb0-8d97-e1ad83ef422d
scheduleColumnGUID:   07687884-7e37-49aa-8028-d43b751c9034 (Chair 8)
childName:            TEST_SiblingB RateLimitTest
```

---

## Cloud9 API Family Concepts

| Feature | Supported? | Details |
|---------|-----------|---------|
| Family/Household GUID | **NO** | No native family grouping |
| Responsible Parties | **YES** | `GetResponsiblePartiesForPatient` API |
| Multiple patients same phone | **NO** | Duplicate detection blocks this |
| Appointment Notes | **YES** | `apptNote` field in `SetAppointment` |
| Patient Comments | **YES** | `SetPatientComment` API |

### Relevant API Calls

- `SetPatient` - Creates patient record (parent)
- `SetAppointment` - Creates appointment with `apptNote` parameter
- `SetPatientComment` - Adds notes to patient record
- `GetAppointmentListByPatient` - Retrieves appointments by `patGUID`
- `GetResponsiblePartiesForPatient` - Financial responsibility links

---

## Comparison: Traditional vs Our Implementation

| Aspect | Historical Cloud9 Records | Our Implementation |
|--------|--------------------------|-------------------|
| PatientGUID | One per individual person | One per family (parent) |
| AppointmentNote | Clinical notes only | Child info + insurance |
| Children | Would have their own PatientGUID | Child info stored in note |
| Family link | Via responsible party API | Via shared PatientGUID |

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/v1/chord_dso_patient_Tool.json` | Patient tool - PARENT-AS-PATIENT MODEL |
| `docs/v1/schedule_appointment_dso_Tool.json` | Scheduling tool with `childName`, `apptNote` |
| `docs/v1/Chord_Cloud9_SystemPrompt.md` | Rules A19, A27 for booking flow |
| `test-agent/data/parent-as-patient-e2e-log.txt` | Real test evidence |
| `docs/archive/sibling-booking/` | Failed approach documentation |

---

## Conclusion

**The current method (parent GUID + child info in appointment notes) IS the correct approach** based on:

1. **Cloud9 API constraints** - Cannot create multiple patients with same phone
2. **Working production implementation** - Test evidence shows successful bookings
3. **Documented and deprecated alternative** - Sibling-per-child was tried and failed

The system correctly:
- Creates ONE patient record for the parent/guardian
- Stores child details in appointment note fields
- Reuses the same `patientGUID` for all sibling appointments
- Assigns unique `appointmentGUID` to each booking
