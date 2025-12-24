# Cloud 9 Ortho API - Workflow Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Common Prerequisites](#common-prerequisites)
4. [Patient Management Workflows](#patient-management-workflows)
   - [Create New Patient](#workflow-1-create-new-patient)
   - [Update Existing Patient](#workflow-2-update-existing-patient)
   - [Search and Retrieve Patient Information](#workflow-3-search-and-retrieve-patient-information)
5. [Appointment Management Workflows](#appointment-management-workflows)
   - [Create New Appointment](#workflow-4-create-new-appointment)
   - [Confirm Appointment](#workflow-5-confirm-appointment)
   - [Cancel Appointment](#workflow-6-cancel-appointment)
   - [View Patient Appointments](#workflow-7-view-patient-appointments)

---

## Overview

This document outlines the end-to-end workflows for common operations in the Cloud 9 Ortho Partner API. Each workflow includes:
- Required steps in sequential order
- Input parameters needed for each step
- Output values (IDs) returned from each step
- How to use outputs from previous steps in subsequent requests

## Authentication

All API requests require the following authentication parameters in the XML body:

**Production Environment:**
```xml
<ClientID>b42c51be-2529-4d31-92cb-50fd1a58c084</ClientID>
<UserName>Intelepeer</UserName>
<Password>$#1Nt-p33R-AwS#$</Password>
```
**Endpoint:** `https://us-ea1-partner.cloud9ortho.com/GetData.ashx`

**Sandbox Environment:**
```xml
<ClientID>c15aa02a-adc1-40ae-a2b5-d2e39173ae56</ClientID>
<UserName>IntelepeerTest</UserName>
<Password>#!InteleP33rTest!#</Password>
```
**Endpoint:** `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx`

---

## Common Prerequisites

Before executing patient or appointment workflows, you typically need to retrieve reference data:

### Get Practice Locations

**Procedure:** `GetLocations`

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetLocations</Procedure>
    <Parameters>
        <showDeleted>False</showDeleted>
    </Parameters>
</GetDataRequest>
```

**Response - Extract These Values:**
- `LocationGUID` - Used for patient creation and appointment scheduling
- `LocationName` - For reference
- `LocationCode` - For reference

**Sample Response:**
```xml
<Record>
    <LocationGUID>50351deb-b8df-4fff-92f9-0db75ce4a759</LocationGUID>
    <LocationName>Location9</LocationName>
    <LocationCode>ZCME</LocationCode>
    <TimeZone>Mountain Standard Time</TimeZone>
</Record>
```

---

### Get Chair Schedules (Providers/Doctors)

**Procedure:** `GetChairSchedules`

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetChairSchedules</Procedure>
</GetDataRequest>
```

**Response - Extract These Values:**
- `schdvwGUID` (ScheduleViewGUID) - Used for appointment scheduling
- `schdcolGUID` (ScheduleColumnGUID) - Used for appointment scheduling
- `locGUID` (LocationGUID) - Links to location
- `schdvwDescription` - Schedule description (e.g., "Chair 1")

**Sample Response:**
```xml
<Record>
    <locGUID>f808bf47-68fc-437c-9ee4-19e3e9bd3466</locGUID>
    <locName>Location13</locName>
    <schdvwGUID>f625ebd8-7012-4735-be3f-445f15532375</schdvwGUID>
    <schdvwDescription>Location13</schdvwDescription>
    <schdcolGUID>2fc6ca9c-b17c-4dd5-a3a0-eb4963bdfda3</schdcolGUID>
    <schdcolDescription>Chair 1</schdcolDescription>
</Record>
```

---

### Get Appointment Types

**Procedure:** `GetAppointmentTypes`

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetAppointmentTypes</Procedure>
    <Parameters>
        <showDeleted>False</showDeleted>
    </Parameters>
</GetDataRequest>
```

**Response - Extract These Values:**
- `AppointmentTypeGUID` - Used for appointment scheduling
- `AppointmentTypeDescription` - Type description (e.g., "Exam - NP Child")
- `AppointmentTypeMinutes` - Default duration for this appointment type

**Sample Response:**
```xml
<Record>
    <AppointmentTypeGUID>8fc9d063-ae46-4975-a5ae-734c6efe341a</AppointmentTypeGUID>
    <AppointmentTypeCode>100</AppointmentTypeCode>
    <AppointmentTypeDescription>100 Exam - NP Child</AppointmentTypeDescription>
    <AppointmentTypeMinutes>45</AppointmentTypeMinutes>
    <AppointmentTypeAllowOnlineScheduling>True</AppointmentTypeAllowOnlineScheduling>
</Record>
```

---

## Patient Management Workflows

### Workflow 1: Create New Patient

**Goal:** Create a new patient record in the system

#### Step 1: Get Location Information
**Procedure:** `GetLocations` (see [Common Prerequisites](#common-prerequisites))

**Outputs to Save:**
- `LocationGUID` → Use in Step 3

---

#### Step 2: Get Provider Information
**Procedure:** `GetChairSchedules` (see [Common Prerequisites](#common-prerequisites))

**Outputs to Save:**
- `schdvwGUID` (ScheduleViewGUID) - Select a provider
- Note: You can extract provider information from this response

---

#### Step 3: Create Patient
**Procedure:** `SetPatient`

**Inputs Required:**
- `LocationGUID` - From Step 1
- `providerGUID` - Provider GUID (can be obtained from provider/doctor list)
- Patient demographic information (see below)

**Request:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>SetPatient</Procedure>
    <Parameters>
        <patientFirstName>Chris</patientFirstName>
        <patientLastName>Aleman</patientLastName>
        <providerGUID>79ec29fe-c315-4982-845a-0005baefb5a8</providerGUID>
        <locationGUID>1070d281-0952-4f01-9a6e-1a2e6926a7db</locationGUID>
        <note></note>
        <birthdayDateTime>2013-12-25T00:00:00</birthdayDateTime>
        <addressStreet>123 Main St</addressStreet>
        <addressCity>Miami</addressCity>
        <addressState>FL</addressState>
        <addressPostalCode>33101</addressPostalCode>
        <phoneNumber>9548123075</phoneNumber>
        <email>caleman@intelepeer.ai</email>
        <VendorUserName>IntelepeerTest</VendorUserName>
    </Parameters>
</GetDataRequest>
```

**Required Parameters:**
- `patientFirstName` - Patient's first name
- `patientLastName` - Patient's last name
- `providerGUID` - Provider/doctor GUID
- `locationGUID` - Location GUID from Step 1
- `birthdayDateTime` - Format: YYYY-MM-DDTHH:mm:ss
- `phoneNumber` - Contact phone number
- `email` - Patient email address
- `VendorUserName` - Your vendor username

**Optional Parameters:**
- `note` - Additional notes
- `addressStreet` - Street address
- `addressCity` - City
- `addressState` - State code (e.g., FL, CA)
- `addressPostalCode` - ZIP/postal code

**Response - Extract These Values:**
```xml
<GetDataResponse xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <Result>Patient Added: D933D128-E516-40D5-91E5-D8D6B568E347</Result>
        </Record>
    </Records>
</GetDataResponse>
```

**Outputs to Save:**
- `PatientGUID` - Extract from Result field (the GUID after "Patient Added: ")
  - Example: `D933D128-E516-40D5-91E5-D8D6B568E347`
  - Use this for subsequent patient operations and appointment scheduling

---

#### Step 4: Verify Patient Creation (Optional)
**Procedure:** `GetPatientInformation`

**Inputs Required:**
- `patguid` - PatientGUID from Step 3

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetPatientInformation</Procedure>
    <Parameters>
        <patguid>D933D128-E516-40D5-91E5-D8D6B568E347</patguid>
    </Parameters>
</GetDataRequest>
```

**Purpose:** Confirm that the patient was created successfully and retrieve full patient details.

---

### Workflow 2: Update Existing Patient

**Goal:** Update demographic information for an existing patient

#### Step 1: Search for Patient
**Procedure:** `GetPortalPatientLookup` or `GetPatientList`

**Option A - Search by Name (GetPortalPatientLookup):**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetPortalPatientLookup</Procedure>
    <Parameters>
        <filter>Jones, Abigail</filter>
        <lookupByPatient>1</lookupByPatient>
        <pageIndex>1</pageIndex>
        <pageSize>25</pageSize>
    </Parameters>
</GetDataRequest>
```

**Parameters:**
- `filter` - Search term (e.g., "LastName, FirstName")
- `lookupByPatient` - Set to 1 to search by patient
- `pageIndex` - Page number (starts at 1)
- `pageSize` - Number of results per page

**Option B - Get All Patients by Location (GetPatientList):**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetPatientList</Procedure>
    <Parameters>
        <LocGUIDs>799d413a-5e1a-46a2-b169-e2108bf517d6</LocGUIDs>
    </Parameters>
</GetDataRequest>
```

**Parameters:**
- `LocGUIDs` - Location GUID to filter patients

**Response - Extract These Values:**
```xml
<Record>
    <PatientGUID>f9c319a4-250f-4bda-adb7-e5791ba024e5</PatientGUID>
    <PatientFirstName>novinsurance</PatientFirstName>
    <PatientLastName>API_test</PatientLastName>
    <PatientID>MOE015604</PatientID>
    <PatientBirthdate>7/25/1991 12:00:00 AM</PatientBirthdate>
</Record>
```

**Outputs to Save:**
- `PatientGUID` → Use in Step 2

---

#### Step 2: Update Patient Demographics
**Procedure:** `SetPatientDemographicInfo`

**Inputs Required:**
- `patguid` - PatientGUID from Step 1

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>SetPatientDemographicInfo</Procedure>
    <Parameters>
        <patguid>fb0f8b32-1700-46c6-83a3-3239aa48a960</patguid>
        <persUseEmail>newemail@intelepeer.ai</persUseEmail>
    </Parameters>
</GetDataRequest>
```

**Required Parameters:**
- `patguid` - Patient GUID from Step 1

**Optional Parameters (include only fields you want to update):**
- `persUseEmail` - Email address
- `persUsePhone` - Phone number
- `persFirstName` - First name
- `persLastName` - Last name
- `persBirthdate` - Birth date
- `persStreetAddress` - Street address
- `persCity` - City
- `persState` - State
- `persPostalCode` - Postal code

**Note:** Only include the parameters you want to update. Omitted fields will remain unchanged.

---

### Workflow 3: Search and Retrieve Patient Information

**Goal:** Find a patient and retrieve their complete information

#### Step 1: Search for Patient
**Procedure:** `GetPortalPatientLookup`

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetPortalPatientLookup</Procedure>
    <Parameters>
        <filter>Aleman, Chris</filter>
        <lookupByPatient>1</lookupByPatient>
        <pageIndex>1</pageIndex>
        <pageSize>25</pageSize>
    </Parameters>
</GetDataRequest>
```

**Outputs to Save:**
- `PatientGUID` → Use in Step 2

---

#### Step 2: Get Full Patient Information
**Procedure:** `GetPatientInformation`

**Inputs Required:**
- `patguid` - PatientGUID from Step 1

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetPatientInformation</Procedure>
    <Parameters>
        <patguid>D933D128-E516-40D5-91E5-D8D6B568E347</patguid>
    </Parameters>
</GetDataRequest>
```

**Purpose:** Retrieve complete patient demographic and contact information.

---

## Appointment Management Workflows

### Workflow 4: Create New Appointment

**Goal:** Schedule a new appointment for an existing patient

#### Step 1: Get Location Information
**Procedure:** `GetLocations` (see [Common Prerequisites](#common-prerequisites))

**Outputs to Save:**
- `LocationGUID` → Used to filter schedules in Step 2

---

#### Step 2: Get Available Schedules (Chairs/Providers)
**Procedure:** `GetChairSchedules` (see [Common Prerequisites](#common-prerequisites))

**Outputs to Save:**
- `schdvwGUID` (ScheduleViewGUID) → Use in Step 5
- `schdcolGUID` (ScheduleColumnGUID) → Use in Step 5
- `locGUID` (LocationGUID) - Confirm matches your desired location

**Note:** Filter the response to find schedules for your desired location from Step 1.

---

#### Step 3: Get Appointment Types
**Procedure:** `GetAppointmentTypes` (see [Common Prerequisites](#common-prerequisites))

**Outputs to Save:**
- `AppointmentTypeGUID` → Use in Step 5
- `AppointmentTypeMinutes` → Use in Step 5 (or specify your own duration)

---

#### Step 4: Get Patient GUID
**Procedure:** `GetPortalPatientLookup` or `GetPatientList`

If you already created a patient (Workflow 1), use that `PatientGUID`. Otherwise, search for the patient:

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetPortalPatientLookup</Procedure>
    <Parameters>
        <filter>Aleman, Chris</filter>
        <lookupByPatient>1</lookupByPatient>
        <pageIndex>1</pageIndex>
        <pageSize>25</pageSize>
    </Parameters>
</GetDataRequest>
```

**Outputs to Save:**
- `PatientGUID` → Use in Step 5

---

#### Step 5: Schedule the Appointment
**Procedure:** `SetAppointment`

**Inputs Required:**
- `PatientGUID` - From Step 4 (or Workflow 1)
- `ScheduleViewGUID` - From Step 2
- `ScheduleColumnGUID` - From Step 2
- `AppointmentTypeGUID` - From Step 3
- `Minutes` - From Step 3 (or custom duration)
- `StartTime` - Your desired appointment date/time

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>SetAppointment</Procedure>
    <Parameters>
        <PatientGUID>865c8fa6-caf8-4e30-b152-82da6e93f33b</PatientGUID>
        <StartTime>11/3/2025 12:10:00 PM</StartTime>
        <ScheduleViewGUID>0219d6ec-3fe1-4572-9adb-cdae4a0d6aea</ScheduleViewGUID>
        <ScheduleColumnGUID>a68a1410-f771-4fcb-a83d-b44527575723</ScheduleColumnGUID>
        <AppointmentTypeGUID>8fc9d063-ae46-4975-a5ae-734c6efe341a</AppointmentTypeGUID>
        <Minutes>45</Minutes>
        <VendorUserName>IntelePeerTest</VendorUserName>
    </Parameters>
</GetDataRequest>
```

**Required Parameters:**
- `PatientGUID` - Patient identifier from Step 4
- `StartTime` - Appointment date and time (format: MM/DD/YYYY HH:mm:ss AM/PM)
- `ScheduleViewGUID` - Schedule view from Step 2
- `ScheduleColumnGUID` - Schedule column (chair) from Step 2
- `AppointmentTypeGUID` - Appointment type from Step 3
- `Minutes` - Duration of appointment
- `VendorUserName` - Your vendor username

**Important Notes:**
- `StartTime` must be in the future (cannot schedule in the past)
- Time format: `MM/DD/YYYY HH:mm:ss AM/PM` (e.g., "11/3/2025 12:10:00 PM")

**Response - Success:**
```xml
<GetDataResponse xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <Result>Appointment successfully created</Result>
        </Record>
    </Records>
</GetDataResponse>
```

**Response - Error Example:**
```xml
<Record>
    <Result>Error: Appointments cannot be scheduled in the past.</Result>
</Record>
```

---

#### Step 6: Verify Appointment Creation
**Procedure:** `GetAppointmentListByPatient`

**Inputs Required:**
- `patGUID` - PatientGUID from Step 4

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetAppointmentListByPatient</Procedure>
    <Parameters>
        <patGUID>865c8fa6-caf8-4e30-b152-82da6e93f33b</patGUID>
    </Parameters>
</GetDataRequest>
```

**Response - Extract These Values:**
```xml
<Record>
    <AppointmentGUID>0a22fcc4-6ba0-4009-a9e7-2b5664170669</AppointmentGUID>
    <PatientGUID>865c8fa6-caf8-4e30-b152-82da6e93f33b</PatientGUID>
    <PatientFirstName>Chris</PatientFirstName>
    <PatientLastName>Aleman</PatientLastName>
    <AppointmentDateTime>10/29/2025 8:40:00 AM</AppointmentDateTime>
    <OrthodontistGUID>79ec29fe-c315-4982-845a-0005baefb5a8</OrthodontistGUID>
    <OrthodontistName>Bruce (Cole) Ba</OrthodontistName>
    <AppointmentStatus>Scheduled</AppointmentStatus>
</Record>
```

**Outputs to Save:**
- `AppointmentGUID` → Use for confirming or canceling appointments (Workflows 5 & 6)

---

### Workflow 5: Confirm Appointment

**Goal:** Mark an existing appointment as confirmed

#### Step 1: Get Appointment Information
**Procedure:** `GetAppointmentListByPatient`

**Inputs Required:**
- `patGUID` - PatientGUID

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetAppointmentListByPatient</Procedure>
    <Parameters>
        <patGUID>865c8fa6-caf8-4e30-b152-82da6e93f33b</patGUID>
    </Parameters>
</GetDataRequest>
```

**Outputs to Save:**
- `AppointmentGUID` → Use in Step 2

---

#### Step 2: Confirm the Appointment
**Procedure:** `SetAppointmentStatusConfirmed`

**Inputs Required:**
- `apptGUID` - AppointmentGUID from Step 1

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>SetAppointmentStatusConfirmed</Procedure>
    <Parameters>
        <apptGUID>0a22fcc4-6ba0-4009-a9e7-2b5664170669</apptGUID>
    </Parameters>
</GetDataRequest>
```

**Required Parameters:**
- `apptGUID` - Appointment GUID from Step 1

**Purpose:** Updates the appointment status to "Confirmed".

---

### Workflow 6: Cancel Appointment

**Goal:** Cancel an existing appointment

#### Step 1: Get Appointment Information
**Procedure:** `GetAppointmentListByPatient`

**Inputs Required:**
- `patGUID` - PatientGUID

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetAppointmentListByPatient</Procedure>
    <Parameters>
        <patGUID>865c8fa6-caf8-4e30-b152-82da6e93f33b</patGUID>
    </Parameters>
</GetDataRequest>
```

**Outputs to Save:**
- `AppointmentGUID` → Use in Step 2

---

#### Step 2: Cancel the Appointment
**Procedure:** `SetAppointmentStatusCanceled`

**Inputs Required:**
- `apptGUID` - AppointmentGUID from Step 1

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>SetAppointmentStatusCanceled</Procedure>
    <Parameters>
        <apptGUID>0a22fcc4-6ba0-4009-a9e7-2b5664170669</apptGUID>
    </Parameters>
</GetDataRequest>
```

**Required Parameters:**
- `apptGUID` - Appointment GUID from Step 1

**Purpose:** Updates the appointment status to "Canceled".

---

### Workflow 7: View Patient Appointments

**Goal:** Retrieve all appointments for a specific patient

#### Step 1: Get Patient GUID (if needed)
**Procedure:** `GetPortalPatientLookup` or `GetPatientList`

If you don't already have the PatientGUID, search for the patient:

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetPortalPatientLookup</Procedure>
    <Parameters>
        <filter>Aleman, Chris</filter>
        <lookupByPatient>1</lookupByPatient>
        <pageIndex>1</pageIndex>
        <pageSize>25</pageSize>
    </Parameters>
</GetDataRequest>
```

**Outputs to Save:**
- `PatientGUID` → Use in Step 2

---

#### Step 2: Retrieve Patient's Appointments
**Procedure:** `GetAppointmentListByPatient`

**Inputs Required:**
- `patGUID` - PatientGUID from Step 1

**Request:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ClientID>...</ClientID>
    <UserName>...</UserName>
    <Password>...</Password>
    <Procedure>GetAppointmentListByPatient</Procedure>
    <Parameters>
        <patGUID>865c8fa6-caf8-4e30-b152-82da6e93f33b</patGUID>
    </Parameters>
</GetDataRequest>
```

**Response:**
```xml
<GetDataResponse xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            <AppointmentGUID>0a22fcc4-6ba0-4009-a9e7-2b5664170669</AppointmentGUID>
            <PatientGUID>865c8fa6-caf8-4e30-b152-82da6e93f33b</PatientGUID>
            <PatientFirstName>Chris</PatientFirstName>
            <PatientLastName>Aleman</PatientLastName>
            <AppointmentDateTime>10/29/2025 8:40:00 AM</AppointmentDateTime>
            <OrthodontistGUID>79ec29fe-c315-4982-845a-0005baefb5a8</OrthodontistGUID>
            <OrthodontistName>Bruce (Cole) Ba</OrthodontistName>
            <AppointmentStatus>Scheduled</AppointmentStatus>
            <LocationGUID>...</LocationGUID>
            <LocationName>...</LocationName>
        </Record>
    </Records>
</GetDataResponse>
```

**Key Fields Returned:**
- `AppointmentGUID` - Unique appointment identifier
- `AppointmentDateTime` - Date and time of appointment
- `AppointmentStatus` - Status (Scheduled, Confirmed, Canceled, etc.)
- `OrthodontistName` - Assigned provider/doctor
- `LocationName` - Practice location

---

## Complete End-to-End Example

### Example: Create Patient and Schedule Appointment

This example demonstrates creating a new patient and scheduling their first appointment.

#### Step 1: Get Locations
```xml
<Procedure>GetLocations</Procedure>
```
**Save:** `LocationGUID = 50351deb-b8df-4fff-92f9-0db75ce4a759`

---

#### Step 2: Get Chair Schedules
```xml
<Procedure>GetChairSchedules</Procedure>
```
**Save:**
- `ScheduleViewGUID = f625ebd8-7012-4735-be3f-445f15532375`
- `ScheduleColumnGUID = 2fc6ca9c-b17c-4dd5-a3a0-eb4963bdfda3`
- `providerGUID = 79ec29fe-c315-4982-845a-0005baefb5a8` (from provider data)

---

#### Step 3: Get Appointment Types
```xml
<Procedure>GetAppointmentTypes</Procedure>
```
**Save:**
- `AppointmentTypeGUID = 8fc9d063-ae46-4975-a5ae-734c6efe341a`
- `AppointmentTypeMinutes = 45`

---

#### Step 4: Create Patient
```xml
<Procedure>SetPatient</Procedure>
<Parameters>
    <patientFirstName>John</patientFirstName>
    <patientLastName>Smith</patientLastName>
    <providerGUID>79ec29fe-c315-4982-845a-0005baefb5a8</providerGUID>
    <locationGUID>50351deb-b8df-4fff-92f9-0db75ce4a759</locationGUID>
    <birthdayDateTime>1990-05-15T00:00:00</birthdayDateTime>
    <phoneNumber>5551234567</phoneNumber>
    <email>jsmith@example.com</email>
    <VendorUserName>IntelepeerTest</VendorUserName>
</Parameters>
```
**Response:** `Patient Added: A123B456-C789-D012-E345-F67890ABCDEF`
**Save:** `PatientGUID = A123B456-C789-D012-E345-F67890ABCDEF`

---

#### Step 5: Schedule Appointment
```xml
<Procedure>SetAppointment</Procedure>
<Parameters>
    <PatientGUID>A123B456-C789-D012-E345-F67890ABCDEF</PatientGUID>
    <StartTime>12/25/2025 2:00:00 PM</StartTime>
    <ScheduleViewGUID>f625ebd8-7012-4735-be3f-445f15532375</ScheduleViewGUID>
    <ScheduleColumnGUID>2fc6ca9c-b17c-4dd5-a3a0-eb4963bdfda3</ScheduleColumnGUID>
    <AppointmentTypeGUID>8fc9d063-ae46-4975-a5ae-734c6efe341a</AppointmentTypeGUID>
    <Minutes>45</Minutes>
    <VendorUserName>IntelePeerTest</VendorUserName>
</Parameters>
```

---

#### Step 6: Verify Appointment
```xml
<Procedure>GetAppointmentListByPatient</Procedure>
<Parameters>
    <patGUID>A123B456-C789-D012-E345-F67890ABCDEF</patGUID>
</Parameters>
```
**Save:** `AppointmentGUID` from response for future confirmation/cancellation

---

## Summary of Key ID Flows

| Operation | Requires These IDs | Returns These IDs | Use Returned IDs For |
|-----------|-------------------|------------------|---------------------|
| **GetLocations** | None | `LocationGUID` | Patient creation, filtering schedules |
| **GetChairSchedules** | None | `ScheduleViewGUID`, `ScheduleColumnGUID` | Appointment scheduling |
| **GetAppointmentTypes** | None | `AppointmentTypeGUID`, `AppointmentTypeMinutes` | Appointment scheduling |
| **SetPatient** | `LocationGUID`, `providerGUID` | `PatientGUID` | All patient operations, appointment scheduling |
| **SetPatientDemographicInfo** | `PatientGUID` | None (success/error) | N/A |
| **GetPortalPatientLookup** | None (search term) | `PatientGUID` | Patient updates, appointments |
| **GetPatientList** | `LocationGUID` | `PatientGUID` (multiple) | Patient selection |
| **GetPatientInformation** | `PatientGUID` | Full patient details | Verification, display |
| **SetAppointment** | `PatientGUID`, `ScheduleViewGUID`, `ScheduleColumnGUID`, `AppointmentTypeGUID` | Success/error message | N/A |
| **GetAppointmentListByPatient** | `PatientGUID` | `AppointmentGUID` (multiple) | Confirm/cancel appointments |
| **SetAppointmentStatusConfirmed** | `AppointmentGUID` | Success/error | N/A |
| **SetAppointmentStatusCanceled** | `AppointmentGUID` | Success/error | N/A |

---

## Important Notes

1. **Date/Time Format:**
   - Patient birthdate: `YYYY-MM-DDTHH:mm:ss` (e.g., "2013-12-25T00:00:00")
   - Appointment time: `MM/DD/YYYY HH:mm:ss AM/PM` (e.g., "11/3/2025 12:10:00 PM")

2. **GUID Format:**
   - All GUIDs are in standard format: `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
   - GUIDs are case-insensitive

3. **Error Handling:**
   - Always check `ResponseStatus` in the response (Success/Error)
   - Check `Result` field for detailed error messages
   - Common errors:
     - "Appointments cannot be scheduled in the past"
     - Invalid GUID references
     - Missing required parameters

4. **Best Practices:**
   - Cache reference data (Locations, AppointmentTypes, ChairSchedules) to reduce API calls
   - Validate PatientGUID exists before scheduling appointments
   - Always verify appointment creation with GetAppointmentListByPatient
   - Use Sandbox environment for testing before Production

5. **Required Fields:**
   - Patient creation: firstName, lastName, providerGUID, locationGUID, birthdate, phone, email
   - Appointment creation: PatientGUID, StartTime, ScheduleViewGUID, ScheduleColumnGUID, AppointmentTypeGUID, Minutes

---

## API Endpoint Information

**HTTP Method:** GET (for all requests)

**Content-Type:** application/xml

**Production URL:** `https://us-ea1-partner.cloud9ortho.com/GetData.ashx`

**Sandbox URL:** `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx`

All requests use the same endpoint URL. The operation is determined by the `<Procedure>` element in the XML body.
