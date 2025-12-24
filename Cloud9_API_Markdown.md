To help you save this documentation locally, I have compiled the extracted information into a single Markdown block below.

You can copy the code block and save it as `Cloud9_API_Documentation.md`.

```markdown
# Cloud 9 API: Basic Guide and Commonly Used APIs

[cite_start]**Source Document:** Basic Guide and Commonly Used APIs (Updated March 2024 / 11.3 C9 Release) [cite: 1, 2]  
[cite_start]**Support Contact:** cloud9.integrations@planetdds.com [cite: 19]

---

## 1. Access & Authentication

### Agreements Required
Before accessing the API, the following must be executed:
* [cite_start]**MNDA:** Required prior to receiving documentation [cite: 21-22].
* [cite_start]**Integration Agreement:** Required prior to testing or sandbox access [cite: 24-25].
* [cite_start]**Authorization Form:** Required for every client database requested for access [cite: 28-29].

### Environments & Endpoints

| Environment | Endpoint URL | Availability | Notes |
| :--- | :--- | :--- | :--- |
| **Testing** | `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx` | 24/7 (except maintenance) | [cite_start]Sandbox deactivated after 6 months of inactivity[cite: 50, 55]. |
| **Production** | `https://us-ea1-partner.cloud9ortho.com/GetData.ashx` | 12:00 AM - 11:00 AM UTC | [cite_start]**Strictly Enforced.** Access outside these hours requires approval[cite: 58, 62]. |

---

## 2. Request & Response Format

[cite_start]All requests are **HTTP POST** containing an **XML body**[cite: 82].

### Request Structure
```xml
<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="[http://schemas.practica.ws/cloud9/partners/](http://schemas.practica.ws/cloud9/partners/)">
    <ClientID>[Cloud9 Client GUID]</ClientID>
    <UserName>[Partner UserName]</UserName>
    <Password>[Partner Password]</Password>
    <Procedure>[Procedure Name]</Procedure>
    <Parameters>
        </Parameters>
</GetDataRequest>

```



### Success Response Structure

```xml
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records>
        <Record>
            </Record>
    </Records>
</GetDataResponse>

```



### Data Types

* 
**bit:** `1` (True) / `0` (False) 


* 
**datetime:** `MM/DD/YYYY` or `MM/DD/YYYY 12:00:00 AM` 


* 
**uniqueidentifier:** GUID format (e.g., `59D26B3E-2725-460D-9FD7-BD9C03452B86`) 



---

## 3. Common Error Codes

| Code | Message |
| --- | --- |
| **0** | An unknown error occurred. 

 |
| **1** | Invalid client / username / password combination. 

 |
| **2** | A required parameter was not specified. 

 |
| **3** | Invalid value for parameter. 

 |
| **6** | Not authorized to access client. 

 |
| **7** | Not authorized to collect data outside of allowance window. 

 |
| **10** | Procedure is not authorized. 

 |

---

## 4. GET APIs (Read Operations)

### Patient Search & Demographics

#### `GetPortalPatientLookup`

Returns a list of patients or responsible parties ordered by name.

* **Parameters:**
* 
`filter` (Req): "LastName, FirstName" or Patient ID.


* `lookupByPatient`: `1` for Patient (Default), `0` for Resp. Party.


* 
`showInactive`: `0` (Default) or `1`.




* 
**Returns:** PatientName, PatientID, PatientBirthDate, ResponsiblePartyName .



#### `GetPatient`

Returns GUIDs associated to a patient.

* 
**Parameters:** `patGUID` (Req).



#### `GetPatientInformation`

Returns 'Edit Patient' details (Demographics, Staff, Contact Info).

* 
**Parameters:** `patguid` (Req).


* 
**Returns:** FullName, BirthDate, Orthodontist, TreatmentCoordinator, Email, Phone.



#### `GetPatientAddress`

Returns address details for all patients.

* 
**Returns:** PatientStreetAddress, PatientCity, PatientState, PatientPostalCode.



#### `GetBirthdayList`

Returns a list of patients with birthdates on a designated month/day.

* 
**Parameters:** `dtBirthday` (Req).



---

### Scheduling & Appointments

#### `GetAppointmentListByDate`

Returns scheduled appointments for a date range.

* 
**Parameters:** `dtAppointment` (Req), `dtAppointmentEnd`.



#### `GetAppointmentListByPatient`

Returns all appointment details for a specific patient.

* 
**Parameters:** `patGUID` (Req).



#### `GetAppointmentsByDate`

Returns appointments for a specific date and schedule view.

* 
**Parameters:** `dtAppointment` (Req), `schdvwGUID` (Req).



#### `GetOnlineReservations`

Returns available slots for online scheduling.

* 
**Parameters:** `startDate` (Req), `endDate` (Req), `schdvwGUIDs`.


* 
**Note:** Date range must be within 28 weeks.



---

### Insurance & Responsible Parties

#### `GetInsurancePolicies`

Returns details for patient insurance policies.

* 
**Parameters:** `modifiedDate`.


* 
**Returns:** PolicyNumber, GroupNumber, SubscriberName, CarrierName (`oipName`).



#### `GetPatientInsurancePolicies`

Returns details for all patient insurance policies.

* 
**Parameters:** `ExcludeInactivePatients` (Default 0).



#### `GetResponsiblePartiesForPatient`

Returns financially responsible parties linked to a patient.

* 
**Parameters:** `PatientGUID` (Req).



---

### Financial Data

#### `GetLedger`

Returns transaction details for all ledger entries.

* 
**Parameters:** `patGUIDString`, `fromDate`, `toDate`.



#### `GetPayments`

Returns a list of payments within a date range.

* 
**Parameters:** `StartDateParam` (Req), `EndDateParam` (Req).



---

## 5. SET APIs (Write Operations)

### Patient Management

#### `SetPatient`

Creates a new patient.

* **Required Parameters:**
* 
`patientFirstName`, `patientLastName`.


* 
`providerGUID` (Must be Orthodontist with Specialty).


* 
`locationGUID`.


* 
`VendorUserName`.




* 
**Optional Parameters:** `birthdayDateTime`, `gender`, `phoneNumber`, `addressStreet`.


* 
**Important:** Database must have a Patient Status code of **"NEW"**.



#### `SetPatientDemographicInfo`

Updates demographics for an existing patient.

* 
**Parameters:** `patGUID` (Req), `persFirstName`, `persLastName`, `addStreet`, `pcodCity`.



#### `SetPatientComment`

Adds or edits a patient comment.

* 
**Parameters:** `patGUID` (Req), `patComment` (Req).



### Appointments

#### `SetAppointment`

Creates an appointment.

* 
**Required Parameters:** `PatientGUID`, `StartTime`, `ScheduleViewGUID`, `ScheduleColumnGUID`, `AppointmentTypeGUID`, `Minutes`, `VendorUserName`.


* 
**Returns:** `Appointment GUID Added: {GUID}`.



#### `SetAppointmentInsuranceVerified`

Checks the "Insurance Verified" box for an appointment.

* 
**Parameters:** `apptGUIDs` (Pipe separated).



```

```