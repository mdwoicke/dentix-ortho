# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---
## ⚠️ MANDATORY - App UI Version Sync (READ THIS FIRST)

**EVERY TIME you edit ANY of these files, you MUST run the update script IMMEDIATELY after:**

| File | Command |
|------|---------|
| `nodered/nodered_Cloud9_flows.json` | `cd test-agent && node scripts/update-prompt-version.js nodered_flow "<description>"` |
| `docs/v1/nodered_Cloud9_flows.json` | `cd test-agent && node scripts/update-prompt-version.js nodered_flow "<description>"` |
| `docs/v1/Chord_Cloud9_SystemPrompt.md` | `cd test-agent && node scripts/update-prompt-version.js system_prompt "<description>"` |
| `docs/v1/chord_dso_patient_Tool.json` | `cd test-agent && node scripts/update-prompt-version.js patient_tool "<description>"` |
| `docs/v1/schedule_appointment_dso_Tool.json` | `cd test-agent && node scripts/update-prompt-version.js scheduling_tool "<description>"` |

**NO EXCEPTIONS. Do NOT skip this step. The App UI "Prompt Versions" panel must always reflect the latest changes.**

The hook at `.claude/hooks/sync-v1-to-langfuse.js` may auto-sync, but ALWAYS verify by running the script manually if in doubt.

---

## Project Overview

This repository contains API integration specifications for Cloud 9 Ortho (Dentrix Orthodontic practice management system). The primary artifact is a Postman collection that documents and tests the Cloud 9 Partner API endpoints.

## Architecture

**API Integration Pattern**: The Cloud 9 API uses XML-based SOAP-like requests with the following structure:
- **Authentication**: Each request includes ClientID, UserName, and Password in the XML body
- **Environments**: Two environments exist - Production and Sandbox (test)
  - Production: `https://us-ea1-partner.cloud9ortho.com/GetData.ashx`
  - Sandbox: `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx`
- **Request Format**: XML payloads with a `<Procedure>` element defining the operation
- **HTTP Method**: Most operations use GET requests with XML in the request body

## V1 Production Files

The canonical V1 production files are located in `/docs/v1/`. These files define the Flowise + Node Red integration architecture:

**Data Flow:**
```
User input → Flowise Prompt → Flowise Tool → Node Red API → Cloud9 API
```

**V1 Files:**

| File | Type | Description |
|------|------|-------------|
| `Chord_Cloud9_SystemPrompt.md` | Prompt | IVA system prompt for Allie |
| `nodered_Cloud9_flows.json` | Flow | Node Red flow definitions |
| `chord_dso_patient_Tool.json` | Tool | Patient operations tool |
| `schedule_appointment_dso_Tool.json` | Tool | Scheduling operations tool |

**V1 File Management Endpoints:**
- `GET /api/test-monitor/v1-files/status` - Health check
- `GET /api/test-monitor/v1-files` - List files
- `GET /api/test-monitor/v1-files/:fileKey` - Get file content
- `POST /api/test-monitor/v1-files/:fileKey/validate` - Validate content
- `POST /api/test-monitor/v1-files/sync` - Sync to nodered directory

**File Locations:**
- `/docs/v1/` - Canonical source for V1 files
- `/docs/archive/` - Archived old files
- `/nodered/` - Working copies (synced from V1)

**IMPORTANT - Prompt Sync Requirements:**

When updating V1 prompts (especially `Chord_Cloud9_SystemPrompt.md`), you MUST sync to BOTH locations:

1. **Local SQLite Database** (for App UI):
   - Database: `test-agent/data/test-results.db`
   - Tables: `prompt_working_copies`, `prompt_version_history`
   - Script: `backend/scripts/save-v31-prompt.js` (or similar)
   - Content must have double curly brackets `{{` escaped for Flowise Mustache templates

2. **Langfuse Cloud** (for prompt management):
   - Host: `https://langfuse-6x3cj-u15194.vm.elestio.app`
   - Prompt name: "System Prompt"
   - Use MCP tools or direct API to create new version
   - Same double curly bracket escaping required

The hook `.claude/hooks/sync-v1-to-langfuse.js` attempts to sync both automatically on Write/Edit to `/docs/v1/` files, but manual sync may be needed if the hook doesn't trigger.

## Tool Version Updates (IMPORTANT)

**When updating Flowise tools (`scheduling_tool`, `patient_tool`):**

1. **ONLY the JavaScript `func` field matters** - Flowise uses just the JavaScript code, not the full JSON
2. **Always use the update script:**
   ```bash
   cd test-agent && node scripts/update-prompt-version.js scheduling_tool "<description>"
   ```
3. **The script automatically:**
   - Extracts only the `func` field from the tool JSON
   - Saves it to a separate `.js` file (e.g., `docs/v1/scheduling_tool_func.js`)
   - Updates the database with just the JavaScript content

---
## ⚠️⚠️⚠️ CRITICAL - ESCAPING RULES (READ CAREFULLY) ⚠️⚠️⚠️

### ONLY ESCAPE SYSTEM PROMPTS - NEVER ESCAPE TOOLS!

| Content Type | Escape Curly Brackets? | Why |
|--------------|----------------------|-----|
| **System Prompts** (`.md`) | ✅ YES - `{` → `{{` | Flowise uses Mustache templates for prompts |
| **Tool JavaScript** (`.js`) | ❌ **NEVER** | Tools are raw JavaScript - escaping breaks the code! |
| **JSON configs** | ❌ NEVER | JSON needs valid syntax |
| **Regular code** | ❌ NEVER | Code needs valid syntax |

### Files and Their Escaping Status:

| File | Escaped? | Use For |
|------|----------|---------|
| `docs/v1/system_prompt_escaped.md` | ✅ YES | **DEPLOY TO FLOWISE** |
| `docs/v1/Chord_Cloud9_SystemPrompt.md` | ❌ NO | Source/reference only |
| `docs/v1/scheduling_tool_func.js` | ❌ NO | **DEPLOY TO FLOWISE** |
| `docs/v1/patient_tool_func.js` | ❌ NO | **DEPLOY TO FLOWISE** |

### Why Tools Must NOT Be Escaped:
- Tools contain JavaScript code that runs directly in Node.js
- Escaping `{` to `{{` creates invalid JavaScript syntax
- Example: `const obj = {{ key: value }}` is BROKEN JavaScript
- Flowise does NOT apply Mustache templating to tool code

### Why Prompts MUST Be Escaped:
- Flowise applies Mustache templating to system prompts
- Variables like `{{input}}` are replaced by Flowise
- To show literal `{` in prompts, escape as `{{`

---

**NEVER save the entire tool JSON to the database** - only the JavaScript func portion is needed for versioning and deployment.

---
## ⚠️ MANDATORY - Sandbox File Sync (DO NOT FORGET!)

**EVERY TIME you update a source file in `/docs/v1/`, you MUST ALSO update the corresponding sandbox files in the database!**

| Source File | Database Table | Sandbox Column |
|-------------|----------------|----------------|
| `docs/v1/scheduling_tool_func.js` | `ab_sandbox_files` | `sandbox_a`, `sandbox_b` |
| `docs/v1/patient_tool_func.js` | `ab_sandbox_files` | `sandbox_a`, `sandbox_b` |
| `docs/v1/Chord_Cloud9_SystemPrompt.md` | `ab_sandbox_files` | `sandbox_a`, `sandbox_b` |

**How to update sandbox files:**
```javascript
// In test-agent directory:
const BetterSqlite3 = require('better-sqlite3');
const fs = require('fs');
const db = new BetterSqlite3('./data/test-results.db');

// Read the source file
const content = fs.readFileSync('../docs/v1/scheduling_tool_func.js', 'utf-8');

// Update sandbox_b (file_type = 'scheduling_tool', sandbox = 'sandbox_b')
db.prepare(`UPDATE ab_sandbox_files SET content = ?, version = version + 1, updated_at = ? WHERE file_type = ? AND sandbox = ?`)
  .run(content, new Date().toISOString(), 'scheduling_tool', 'sandbox_b');

db.close();
```

**NO EXCEPTIONS. Source file changes MUST be synced to sandbox files or A/B testing will use stale code!**

---

**ALWAYS add new versions to App UI:**

When updating prompts, Node-RED flows, or tools:
1. **Include version number in file header** (e.g., `<!-- v45 -->` or `// v45`)
2. **Add the new version to the App UI** via the update script or database
3. Never skip the App UI update - this ensures version history is tracked

## Caching Configuration

**Real-Time Data Fetching**: Caching is disabled by default to ensure all data is fetched in real-time from the Cloud 9 API.

- **Configuration**: Set via `ENABLE_CACHING` environment variable in `.env` file
  - `ENABLE_CACHING=false` (default) - All API calls fetch fresh data directly from Cloud 9 API
  - `ENABLE_CACHING=true` - Enable TTL-based caching (requires database writes to be restored in controllers)

- **Current Behavior** (with caching disabled):
  - No database writes occur - all data is returned directly from Cloud 9 API
  - All endpoints return `cached: false` in their responses
  - Higher latency as every request hits the Cloud 9 API
  - No stale data - always real-time
  - If Cloud 9 API is down, no fallback data is available

- **Performance Implications**:
  - Every API request results in a call to Cloud 9 API
  - No cache buffer - users experience actual Cloud 9 API response times
  - Reference data (locations, appointment types, providers) is fetched fresh on every request
  - Patient and appointment data is always current

- **Deprecated Endpoints**:
  - `GET /api/appointments/date-range` - Returns HTTP 410 (Gone) since Cloud 9 API doesn't support date range queries
  - `POST /api/reference/refresh` - Returns success but is a no-op (caching disabled)
  - `GET /api/reference/cache/stats` - Returns empty stats with `cachingEnabled: false`

- **Re-enabling Caching** (if needed):
  1. Set `ENABLE_CACHING=true` in `.env` file
  2. Restore database write operations in controllers:
     - `referenceController.ts` - Add back `Model.bulkUpsert()` calls
     - `patientController.ts` - Add back `PatientModel.upsert()` calls
     - `appointmentController.ts` - Add back `AppointmentModel.upsert()` calls
  3. Restart the backend server
  4. Caching infrastructure (database tables, cache service) is still present and functional

## Available API Operations

The Postman collection includes endpoints for:

**Practice Data**:
- GetLocations - Retrieve practice locations
- GetDoctors - Retrieve doctor information
- GetProviders - Retrieve provider information
- GetLocationInfo - Get detailed location information

**Patient Data**:
- GetRecords - Retrieve patient records (filtered)
- GetAllRecords - Retrieve all patient records
- GetEmail - Retrieve patient email information
- CreatePatient - Create new patient record
- UpdatePatient - Update existing patient record

**Appointment Management**:
- GetApptTypes - Retrieve available appointment types
- GetAvailableAppts - Check appointment availability
- GetExistingAppts - Retrieve scheduled appointments
- ScheduleNewAppt - Schedule a new appointment
- ConfirmExistingAppts - Confirm appointments
- CancelExistingAppts - Cancel appointments

## Working with the Postman Collection

**File**: `Export Test Response Cloud 9 APIs.postman_collection.json`

This is a Postman Collection v2.1.0 format file containing:
- Request definitions with XML body templates
- Saved response examples (primarily from Sandbox environment)
- Authentication credentials (separate for Prod and Sandbox)

**Important Notes**:
- The Postman collection contains hardcoded credentials - these should be treated as sensitive
- Many sandbox requests include saved response examples for reference
- The XML namespace is `http://schemas.practica.ws/cloud9/partners/`
- All XML requests should include proper XML declaration and encoding

## Development Workflow

When working with Cloud 9 API integrations:

1. **Use Sandbox First**: Test all operations against the sandbox environment before production
2. **XML Structure**: Maintain proper XML structure with namespace declarations
3. **Parameter Validation**: The `<Parameters>` section varies by procedure - reference existing examples
4. **Response Handling**: Responses are in XML format - parse accordingly
5. **Error Handling**: Check API responses for error nodes/status codes

## Credentials

The collection contains two sets of credentials:
- **Production**: ClientID `b42c51be-2529-4d31-92cb-50fd1a58c084`
- **Sandbox**: ClientID `c15aa02a-adc1-40ae-a2b5-d2e39173ae56`

Note: Credentials are embedded in the Postman collection and should be secured appropriately in production implementations.

---

## Cloud 9 API Reference

**Source:** Cloud9_API_Markdown.md (Updated March 2024 / 11.3 C9 Release)
**Support Contact:** cloud9.integrations@planetdds.com

### Environments & Endpoints

| Environment | Endpoint URL | Availability | Notes |
| :--- | :--- | :--- | :--- |
| **Testing** | `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx` | 24/7 (except maintenance) | Sandbox deactivated after 6 months of inactivity |
| **Production** | `https://us-ea1-partner.cloud9ortho.com/GetData.ashx` | 12:00 AM - 11:00 AM UTC | **Strictly Enforced.** Access outside these hours requires approval |

### Request Format

All requests are **HTTP POST** containing an **XML body**:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>[Cloud9 Client GUID]</ClientID>
    <UserName>[Partner UserName]</UserName>
    <Password>[Partner Password]</Password>
    <Procedure>[Procedure Name]</Procedure>
    <Parameters>
    </Parameters>
</GetDataRequest>
```

### Response Format

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

- **bit:** `1` (True) / `0` (False)
- **datetime:** `MM/DD/YYYY` or `MM/DD/YYYY 12:00:00 AM`
- **uniqueidentifier:** GUID format (e.g., `59D26B3E-2725-460D-9FD7-BD9C03452B86`)

### Error Codes

| Code | Message |
| --- | --- |
| **0** | An unknown error occurred |
| **1** | Invalid client / username / password combination |
| **2** | A required parameter was not specified |
| **3** | Invalid value for parameter |
| **6** | Not authorized to access client |
| **7** | Not authorized to collect data outside of allowance window |
| **10** | Procedure is not authorized |

---

## GET APIs (Read Operations)

### Patient Search & Demographics

#### `GetPortalPatientLookup`
Returns a list of patients or responsible parties ordered by name.
- **Parameters:**
  - `filter` (Req): "LastName, FirstName" or Patient ID
  - `lookupByPatient`: `1` for Patient (Default), `0` for Resp. Party
  - `showInactive`: `0` (Default) or `1`
- **Returns:** PatientName, PatientID, PatientBirthDate, ResponsiblePartyName

#### `GetPatient`
Returns GUIDs associated to a patient.
- **Parameters:** `patGUID` (Req)

#### `GetPatientInformation`
Returns 'Edit Patient' details (Demographics, Staff, Contact Info).
- **Parameters:** `patguid` (Req)
- **Returns:** FullName, BirthDate, Orthodontist, TreatmentCoordinator, Email, Phone

#### `GetPatientAddress`
Returns address details for all patients.
- **Returns:** PatientStreetAddress, PatientCity, PatientState, PatientPostalCode

#### `GetBirthdayList`
Returns a list of patients with birthdates on a designated month/day.
- **Parameters:** `dtBirthday` (Req)

### Scheduling & Appointments

#### `GetAppointmentListByDate`
Returns scheduled appointments for a date range.
- **Parameters:** `dtAppointment` (Req), `dtAppointmentEnd`

#### `GetAppointmentListByPatient`
Returns all appointment details for a specific patient.
- **Parameters:** `patGUID` (Req)

#### `GetAppointmentsByDate`
Returns appointments for a specific date and schedule view.
- **Parameters:** `dtAppointment` (Req), `schdvwGUID` (Req)

#### `GetOnlineReservations`
Returns available slots for online scheduling.
- **Parameters:** `startDate` (Req), `endDate` (Req), `schdvwGUIDs`
- **Note:** Date range must be within 28 weeks

### Insurance & Responsible Parties

#### `GetInsurancePolicies`
Returns details for patient insurance policies.
- **Parameters:** `modifiedDate`
- **Returns:** PolicyNumber, GroupNumber, SubscriberName, CarrierName (`oipName`)

#### `GetPatientInsurancePolicies`
Returns details for all patient insurance policies.
- **Parameters:** `ExcludeInactivePatients` (Default 0)

#### `GetResponsiblePartiesForPatient`
Returns financially responsible parties linked to a patient.
- **Parameters:** `PatientGUID` (Req)

### Financial Data

#### `GetLedger`
Returns transaction details for all ledger entries.
- **Parameters:** `patGUIDString`, `fromDate`, `toDate`

#### `GetPayments`
Returns a list of payments within a date range.
- **Parameters:** `StartDateParam` (Req), `EndDateParam` (Req)

---

## SET APIs (Write Operations)

### Patient Management

#### `SetPatient`
Creates a new patient.
- **Required Parameters:**
  - `patientFirstName`, `patientLastName`
  - `providerGUID` (Must be Orthodontist with Specialty)
  - `locationGUID`
  - `VendorUserName`
- **Optional Parameters:** `birthdayDateTime`, `gender`, `phoneNumber`, `addressStreet`
- **Important:** Database must have a Patient Status code of **"NEW"**

#### `SetPatientDemographicInfo`
Updates demographics for an existing patient.
- **Parameters:** `patGUID` (Req), `persFirstName`, `persLastName`, `addStreet`, `pcodCity`

#### `SetPatientComment`
Adds or edits a patient comment.
- **Parameters:** `patGUID` (Req), `patComment` (Req)

### Appointments

#### `SetAppointment`
Creates an appointment.
- **Required Parameters:** `PatientGUID`, `StartTime`, `ScheduleViewGUID`, `ScheduleColumnGUID`, `AppointmentTypeGUID`, `Minutes`, `VendorUserName`
- **Returns:** `Appointment GUID Added: {GUID}`

#### `SetAppointmentInsuranceVerified`
Checks the "Insurance Verified" box for an appointment.
- **Parameters:** `apptGUIDs` (Pipe separated)
