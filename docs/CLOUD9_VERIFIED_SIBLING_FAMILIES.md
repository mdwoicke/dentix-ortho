# Cloud9 Verified Sibling Families - Complete Data Export

**Generated:** 2026-01-26
**Data Source:** `backend/past-chair8-both-locations.json`
**Location:** CDH - Allegheny 202

---

## Purpose

This document contains **ALL fields** from verified sibling families in Cloud9, demonstrating that native Cloud9 creates **separate patient records** for each sibling (different PatientIDs).

---

## Summary Table

| Family | Sibling 1 | PatientID | Sibling 2 | PatientID | Same PatientID? |
|--------|-----------|-----------|-----------|-----------|-----------------|
| **BOND** | Jaiannah Bond | `202406-AL` | Jamere Bond | `1084825-AL` | **NO** |
| **MUHAMMAD** | Abdus Salaam Muhammad | `25103794CDAL` | Safiyat O Muhammad | `207251-AL` | **NO** |
| **SUASTEGUI** | John Suastegui | `209604-AL` | Myaleen Suastegui | `23060554-AL` | **NO** |

---

# FAMILY 1: BOND

## Sibling 1: Jaiannah Bond

### Patient Table - ALL FIELDS

| Field | Value |
|-------|-------|
| PatientID | `202406-AL` |
| PatientTitle | *(empty)* |
| PatientFullName | `Jaiannah Bond` |
| persLastFirst | `Bond, Jaiannah` |
| PatientBirthday | `11/8/2013 12:00:00 AM` |
| BirthdayMonth | *(empty)* |
| BirthdayMonthDescription | *(empty)* |
| BirthdayDescription | *(empty)* |
| Adult | *(empty)* |
| PatientModels | *(empty)* |
| PatientStatusCode | `OBS` |
| MonthsinStatus | `0` |
| FullMonthsDetail | `0OBS` |
| Current | `000` (= $0.00) |
| PastDue | `000` (= $0.00) |
| DueNow | `000` (= $0.00) |
| TotalDue | `000` (= $0.00) |

### Appointment Table - ALL FIELDS

| Field | Value |
|-------|-------|
| AppointmentGUID | `b4183598-0a9f-4787-b35e-b569536dfc4a` |
| PatientID (FK) | `202406-AL` |
| AppointmentDateTime | `1/8/2026 3:20:00 PM` |
| QueryDate | `1/8/2026` |
| Chair | `8` |
| AppointmentTypeGUID | `1cb4bcb3-0afd-4f5f-9611-594bc5ef273e` |
| AppointmentTypeDescription | `Observation` |
| apptstDescription | `No-Show` |
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |
| LocationName | `CDH - Allegheny 202` |
| SourceLocation | `CDH - Allegheny 202` |
| apptNote | *(empty)* |

---

## Sibling 2: Jamere Bond

### Patient Table - ALL FIELDS

| Field | Value |
|-------|-------|
| PatientID | `1084825-AL` |
| PatientTitle | *(empty)* |
| PatientFullName | `Jamere Bond` |
| persLastFirst | `Bond, Jamere` |
| PatientBirthday | `9/29/2006 12:00:00 AM` |
| BirthdayMonth | *(empty)* |
| BirthdayMonthDescription | *(empty)* |
| BirthdayDescription | *(empty)* |
| Adult | `A` |
| PatientModels | *(empty)* |
| PatientStatusCode | `RET` |
| MonthsinStatus | `6` |
| FullMonthsDetail | `6RET` |
| Current | `000` (= $0.00) |
| PastDue | `000` (= $0.00) |
| DueNow | `000` (= $0.00) |
| TotalDue | `000` (= $0.00) |

### Appointment Table - ALL FIELDS

| Field | Value |
|-------|-------|
| AppointmentGUID | `35cfbec1-fdfb-4856-8b4c-91d31381994a` |
| PatientID (FK) | `1084825-AL` |
| AppointmentDateTime | `1/8/2026 3:20:00 PM` |
| QueryDate | `1/8/2026` |
| Chair | `3` |
| AppointmentTypeGUID | `7351cb28-5064-41c8-b050-017557bb3aa4` |
| AppointmentTypeDescription | `Retainer Check` |
| apptstDescription | `No-Show` |
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |
| LocationName | `CDH - Allegheny 202` |
| SourceLocation | `CDH - Allegheny 202` |
| apptNote | *(empty)* |

---

## BOND Family - Comparison

| Field | Jaiannah Bond | Jamere Bond | Same? |
|-------|---------------|-------------|-------|
| **PatientID** | `202406-AL` | `1084825-AL` | **NO** |
| PatientTitle | *(empty)* | *(empty)* | YES |
| PatientFullName | `Jaiannah Bond` | `Jamere Bond` | NO |
| persLastFirst | `Bond, Jaiannah` | `Bond, Jamere` | NO |
| PatientBirthday | `11/8/2013` | `9/29/2006` | NO |
| Adult | *(empty)* | `A` | NO |
| PatientStatusCode | `OBS` | `RET` | NO |
| **AppointmentGUID** | `b4183598-...` | `35cfbec1-...` | **NO** |
| **AppointmentDateTime** | `1/8/2026 3:20 PM` | `1/8/2026 3:20 PM` | **YES** |
| LocationGUID | `1fef9297-...` | `1fef9297-...` | YES |

**Verification:** Same appointment time (3:20 PM) + uncommon last name = confirmed siblings with DIFFERENT PatientIDs.

---

# FAMILY 2: MUHAMMAD

## Sibling 1: Abdus Salaam Muhammad

### Patient Table - ALL FIELDS

| Field | Value |
|-------|-------|
| PatientID | `25103794CDAL` |
| PatientTitle | *(empty)* |
| PatientFullName | `Abdus Salaam Muhammad` |
| persLastFirst | `Muhammad, Abdus Salaam` |
| PatientBirthday | `8/17/2011 12:00:00 AM` |
| BirthdayMonth | *(empty)* |
| BirthdayMonthDescription | *(empty)* |
| BirthdayDescription | *(empty)* |
| Adult | *(empty)* |
| PatientModels | *(empty)* |
| PatientStatusCode | `MA-NRS` |
| MonthsinStatus | `0` |
| FullMonthsDetail | `0MA-NRS` |
| Current | `5000` (= $50.00) |
| PastDue | `000` (= $0.00) |
| DueNow | `5000` (= $50.00) |
| TotalDue | `5000` (= $50.00) |

### Appointment Table - ALL FIELDS

| Field | Value |
|-------|-------|
| AppointmentGUID | `5ce2d7f5-3f26-444a-a6b2-9338a9189d64` |
| PatientID (FK) | `25103794CDAL` |
| AppointmentDateTime | `1/8/2026 10:00:00 AM` |
| QueryDate | `1/8/2026` |
| Chair | `8` |
| AppointmentTypeGUID | `a22feff5-1cee-ec24-3cb7-4cd20cae3630` |
| AppointmentTypeDescription | `Records MA Exam` |
| apptstDescription | `Dismissed` |
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |
| LocationName | `CDH - Allegheny 202` |
| SourceLocation | `CDH - Allegheny 202` |
| apptNote | `BILL FOR RECORDS` |

---

## Sibling 2: Safiyat O Muhammad

### Patient Table - ALL FIELDS

| Field | Value |
|-------|-------|
| PatientID | `207251-AL` |
| PatientTitle | *(empty)* |
| PatientFullName | `Safiyat O Muhammad` |
| persLastFirst | `Muhammad, Safiyat O` |
| PatientBirthday | `5/17/2008 12:00:00 AM` |
| BirthdayMonth | *(empty)* |
| BirthdayMonthDescription | *(empty)* |
| BirthdayDescription | *(empty)* |
| Adult | `A` |
| PatientModels | *(empty)* |
| PatientStatusCode | `FULL` |
| MonthsinStatus | `31` |
| FullMonthsDetail | `31FULL` |
| Current | `000` (= $0.00) |
| PastDue | `000` (= $0.00) |
| DueNow | `000` (= $0.00) |
| TotalDue | `000` (= $0.00) |

### Appointment Table - ALL FIELDS

| Field | Value |
|-------|-------|
| AppointmentGUID | `9ed4504b-e375-410e-b250-6c2a3bebc443` |
| PatientID (FK) | `207251-AL` |
| AppointmentDateTime | `1/8/2026 10:20:00 AM` |
| QueryDate | `1/8/2026` |
| Chair | `4` |
| AppointmentTypeGUID | `db8bc1c2-dfd0-4dd6-989e-23060d82b9b0` |
| AppointmentTypeDescription | `Adjustment - 20 Min` |
| apptstDescription | `Dismissed` |
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |
| LocationName | `CDH - Allegheny 202` |
| SourceLocation | `CDH - Allegheny 202` |
| apptNote | `APPT CONFIRM ` |

---

## MUHAMMAD Family - Comparison

| Field | Abdus Salaam Muhammad | Safiyat O Muhammad | Same? |
|-------|----------------------|---------------------|-------|
| **PatientID** | `25103794CDAL` | `207251-AL` | **NO** |
| PatientTitle | *(empty)* | *(empty)* | YES |
| PatientFullName | `Abdus Salaam Muhammad` | `Safiyat O Muhammad` | NO |
| persLastFirst | `Muhammad, Abdus Salaam` | `Muhammad, Safiyat O` | NO |
| PatientBirthday | `8/17/2011` | `5/17/2008` | NO |
| Adult | *(empty)* | `A` | NO |
| PatientStatusCode | `MA-NRS` | `FULL` | NO |
| Current | $50.00 | $0.00 | NO |
| **AppointmentGUID** | `5ce2d7f5-...` | `9ed4504b-...` | **NO** |
| **AppointmentDateTime** | `10:00 AM` | `10:20 AM` | NO (20 min apart) |
| LocationGUID | `1fef9297-...` | `1fef9297-...` | YES |

**Verification:** Back-to-back appointments (20 min apart) + uncommon last name = confirmed siblings with DIFFERENT PatientIDs.

---

# FAMILY 3: SUASTEGUI

## Sibling 1: John Suastegui

### Patient Table - ALL FIELDS

| Field | Value |
|-------|-------|
| PatientID | `209604-AL` |
| PatientTitle | *(empty)* |
| PatientFullName | `John Suastegui` |
| persLastFirst | `Suastegui, John` |
| PatientBirthday | `4/24/2013 12:00:00 AM` |
| BirthdayMonth | *(empty)* |
| BirthdayMonthDescription | *(empty)* |
| BirthdayDescription | *(empty)* |
| Adult | *(empty)* |
| PatientModels | *(empty)* |
| PatientStatusCode | `MAPH1` |
| MonthsinStatus | `15` |
| FullMonthsDetail | `15MAPH1` |
| Current | `000` (= $0.00) |
| PastDue | `000` (= $0.00) |
| DueNow | `000` (= $0.00) |
| TotalDue | `000` (= $0.00) |

### Appointment Table - ALL FIELDS

| Field | Value |
|-------|-------|
| AppointmentGUID | `46f8e023-d7cb-436d-b964-d6c627712302` |
| PatientID (FK) | `209604-AL` |
| AppointmentDateTime | `1/8/2026 4:00:00 PM` |
| QueryDate | `1/8/2026` |
| Chair | `4` |
| AppointmentTypeGUID | `db8bc1c2-dfd0-4dd6-989e-23060d82b9b0` |
| AppointmentTypeDescription | `Adjustment - 20 Min` |
| apptstDescription | `Dismissed` |
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |
| LocationName | `CDH - Allegheny 202` |
| SourceLocation | `CDH - Allegheny 202` |
| apptNote | *(empty)* |

---

## Sibling 2: Myaleen Suastegui

### Patient Table - ALL FIELDS

| Field | Value |
|-------|-------|
| PatientID | `23060554-AL` |
| PatientTitle | *(empty)* |
| PatientFullName | `Myaleen Suastegui` |
| persLastFirst | `Suastegui, Myaleen` |
| PatientBirthday | `6/14/2011 12:00:00 AM` |
| BirthdayMonth | *(empty)* |
| BirthdayMonthDescription | *(empty)* |
| BirthdayDescription | *(empty)* |
| Adult | *(empty)* |
| PatientModels | *(empty)* |
| PatientStatusCode | `MAF` |
| MonthsinStatus | `26` |
| FullMonthsDetail | `26MAF` |
| Current | `000` (= $0.00) |
| PastDue | `80500` (= $805.00) |
| DueNow | `80500` (= $805.00) |
| TotalDue | `103000` (= $1,030.00) |

### Appointment Table - ALL FIELDS

| Field | Value |
|-------|-------|
| AppointmentGUID | `015ab96d-1e54-44c4-a918-c3e6421316ea` |
| PatientID (FK) | `23060554-AL` |
| AppointmentDateTime | `1/8/2026 3:50:00 PM` |
| QueryDate | `1/8/2026` |
| Chair | `2` |
| AppointmentTypeGUID | `db8bc1c2-dfd0-4dd6-989e-23060d82b9b0` |
| AppointmentTypeDescription | `Adjustment - 20 Min` |
| apptstDescription | `Dismissed` |
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` |
| LocationName | `CDH - Allegheny 202` |
| SourceLocation | `CDH - Allegheny 202` |
| apptNote | *(empty)* |

---

## SUASTEGUI Family - Comparison

| Field | John Suastegui | Myaleen Suastegui | Same? |
|-------|----------------|-------------------|-------|
| **PatientID** | `209604-AL` | `23060554-AL` | **NO** |
| PatientTitle | *(empty)* | *(empty)* | YES |
| PatientFullName | `John Suastegui` | `Myaleen Suastegui` | NO |
| persLastFirst | `Suastegui, John` | `Suastegui, Myaleen` | NO |
| PatientBirthday | `4/24/2013` | `6/14/2011` | NO |
| Adult | *(empty)* | *(empty)* | YES |
| PatientStatusCode | `MAPH1` | `MAF` | NO |
| TotalDue | $0.00 | $1,030.00 | NO |
| **AppointmentGUID** | `46f8e023-...` | `015ab96d-...` | **NO** |
| **AppointmentDateTime** | `4:00 PM` | `3:50 PM` | NO (10 min apart) |
| LocationGUID | `1fef9297-...` | `1fef9297-...` | YES |

**Verification:** Back-to-back appointments (10 min apart) + very uncommon last name = confirmed siblings with DIFFERENT PatientIDs.

---

# API Calls to Reproduce This Data

## GetAppointmentListByDate (Returns appointments with patient data)

```xml
<Procedure>GetAppointmentListByDate</Procedure>
<Parameters>
    <dtAppointment>1/8/2026</dtAppointment>
    <dtAppointmentEnd>1/8/2026</dtAppointmentEnd>
</Parameters>
```

**Response Fields (ALL):**

| Field | Description |
|-------|-------------|
| `AppointmentGUID` | Unique appointment identifier |
| `PatientID` | Patient identifier (links to patient record) |
| `PatientTitle` | Title (Mr., Mrs., etc.) |
| `PatientFullName` | Full patient name |
| `persLastFirst` | Name in "Last, First" format |
| `PatientBirthday` | Date of birth |
| `BirthdayMonth` | Birth month |
| `BirthdayMonthDescription` | Birth month description |
| `BirthdayDescription` | Birthday description |
| `Adult` | Adult flag ("A" if adult) |
| `PatientModels` | Patient models |
| `PatientStatusCode` | Treatment status code |
| `MonthsinStatus` | Months in current status |
| `FullMonthsDetail` | Full months detail |
| `Current` | Current balance (cents) |
| `PastDue` | Past due balance (cents) |
| `DueNow` | Due now balance (cents) |
| `TotalDue` | Total due balance (cents) |
| `AppointmentDateTime` | Appointment date/time |
| `QueryDate` | Query date |
| `Chair` | Chair number |
| `AppointmentTypeGUID` | Appointment type GUID |
| `AppointmentTypeDescription` | Appointment type description |
| `apptstDescription` | Appointment status |
| `LocationGUID` | Location GUID |
| `LocationName` | Location name |
| `SourceLocation` | Source location |
| `apptNote` | Appointment note |

---

## SetPatient (Create patient - used for each sibling)

```xml
<Procedure>SetPatient</Procedure>
<Parameters>
    <patientFirstName>Jaiannah</patientFirstName>
    <patientLastName>Bond</patientLastName>
    <birthdayDateTime>11/8/2013</birthdayDateTime>
    <phoneNumber>555-1234</phoneNumber>
    <providerGUID>{orthodontist-guid}</providerGUID>
    <locationGUID>1fef9297-7c8b-426b-b0d1-f2275136e48b</locationGUID>
    <VendorUserName>API-User</VendorUserName>
</Parameters>
```

**Response:** Returns `PatientGUID` (unique for each patient)

---

## SetAppointment (Create appointment - links to patient via PatientGUID)

```xml
<Procedure>SetAppointment</Procedure>
<Parameters>
    <PatientGUID>{patient-guid-from-SetPatient}</PatientGUID>
    <StartTime>1/8/2026 3:20:00 PM</StartTime>
    <ScheduleViewGUID>4c9e9333-4951-4eb0-8d97-e1ad83ef422d</ScheduleViewGUID>
    <ScheduleColumnGUID>07687884-7e37-49aa-8028-d43b751c9034</ScheduleColumnGUID>
    <AppointmentTypeGUID>1cb4bcb3-0afd-4f5f-9611-594bc5ef273e</AppointmentTypeGUID>
    <Minutes>20</Minutes>
    <VendorUserName>API-User</VendorUserName>
    <apptNote>Clinical notes here</apptNote>
</Parameters>
```

**Response:** Returns `AppointmentGUID` (unique for each appointment)

---

# Key GUIDs Reference

| GUID Type | Value | Description |
|-----------|-------|-------------|
| LocationGUID | `1fef9297-7c8b-426b-b0d1-f2275136e48b` | CDH - Allegheny 202 |
| ScheduleViewGUID | `4c9e9333-4951-4eb0-8d97-e1ad83ef422d` | Schedule view |
| AppointmentTypeGUID (Observation) | `1cb4bcb3-0afd-4f5f-9611-594bc5ef273e` | Observation |
| AppointmentTypeGUID (Retainer Check) | `7351cb28-5064-41c8-b050-017557bb3aa4` | Retainer Check |
| AppointmentTypeGUID (Records MA Exam) | `a22feff5-1cee-ec24-3cb7-4cd20cae3630` | Records MA Exam |
| AppointmentTypeGUID (Adjustment 20 Min) | `db8bc1c2-dfd0-4dd6-989e-23060d82b9b0` | Adjustment - 20 Min |

---

# Conclusion

**Native Cloud9 Pattern:**
- Each sibling has their **OWN unique PatientID**
- Appointment's `PatientID (FK)` links to that specific patient record
- `apptNote` contains **clinical notes only** (not child identification)

**Our Parent-as-Patient Model (Different):**
- All siblings share the **SAME PatientID** (the parent's)
- Appointment's `PatientID (FK)` points to parent record
- `apptNote` contains **child identification**: `Child: [name] | DOB: [date]`

**Why We Use Parent-as-Patient:**
- Cloud9 rejects duplicate phone numbers
- Cannot create separate patient records for siblings sharing family phone
- Parent-as-patient with child info in notes is the workaround
