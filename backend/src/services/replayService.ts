/**
 * Replay Service - Tool Script Emulator
 *
 * This service emulates the FULL tool script logic from:
 * - docs/v1/patient_tool_func.js (chord_ortho_patient)
 * - docs/v1/scheduling_tool_func.js (schedule_appointment_ortho)
 *
 * It replicates all pre-call logic including:
 * - Parameter validation
 * - Date range correction and expansion (for slots)
 * - GUID validation and defaults
 * - Response formatting
 * - Error detection
 *
 * Mock Harness mode:
 * - Generates mock data from captured Langfuse observations
 * - Replays tool logic against captured responses instead of live endpoints
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface ReplayRequest {
  toolName: string;
  action: string;
  input: Record<string, unknown>;
  originalObservationId?: string;
  tenantId?: number; // 1 = Ortho (Cloud9), 5 = Chord (NexHealth)
}

export interface MockHarness {
  traceId: string;
  observations: Array<{ observationId: string; name: string; input: any; output: any }>;
  mockMap: Record<string, any>;
  createdAt: string;
}

export interface ReplayResponse {
  success: boolean;
  data?: {
    response: unknown;
    durationMs: number;
    endpoint: string;
    statusCode: number;
    timestamp: string;
    toolVersion?: string;
    preCallLogs?: string[];
  };
  error?: string;
}

// ============================================================================
// CONFIGURATION - From actual tool scripts
// ============================================================================

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

const AUTH_USERNAME = 'workflowapi';
const AUTH_PASSWORD = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';

// From patient_tool_func.js
const DEFAULT_LOCATION_GUID = '1fef9297-7c8b-426b-b0d1-f2275136e48b';  // CDH - Allegheny 202 (PROD)
const DEFAULT_PROVIDER_GUID = 'a79ec244-9503-44b2-87e4-5920b6e60392';  // Default Orthodontist
const PATIENT_TOOL_VERSION = 'v9';

// From scheduling_tool_func.js
const SCHEDULING_TOOL_VERSION = 'v55';
const MAX_SLOTS_RETURNED = 1;
const DEFAULT_SCHEDULE_COLUMN_GUID = 'dda0b40c-ace5-4427-8b76-493bf9aa26f1';
const SANDBOX_MIN_DATE = new Date(2026, 0, 13);
const DATE_EXPANSION_TIERS = [14, 28, 56]; // 2 weeks, 4 weeks, 8 weeks
const MIN_DATE_RANGE_DAYS = 14;
const MAX_FUTURE_DAYS = 90;

const DEFAULT_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// ============================================================================
// CHORD (NEXHEALTH) TENANT CONFIG - From tenants/chord/v1/
// ============================================================================

// Chord UUI uses 77523 (NexHealth locationId) instead of 333725 (Ortho locationId)
// Node-RED parses the UUI to route to the correct NexHealth practice
const CHORD_DEFAULT_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|77523|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

const CHORD_DEFAULT_LOCATION_ID = '77523';       // NexHealth locationIdProd
const CHORD_DEFAULT_PROVIDER_ID = '223076809';   // NexHealth providerIdProd
const CHORD_PATIENT_TOOL_VERSION = 'v1-nexhealth';
const CHORD_SCHEDULING_TOOL_VERSION = 'v1-nexhealth';
const CHORD_DATE_EXPANSION_TIERS = [30, 60, 90];

function isValidId(value: unknown): boolean {
  if (!value || typeof value !== 'string') return false;
  return /^\d+$/.test((value as string).trim());
}

// Known Chord tool name variants (from toolNameResolver.ts)
const CHORD_PATIENT_TOOL_NAMES = ['chord_patient_v07_stage'];
const CHORD_SCHEDULING_TOOL_NAMES = ['chord_scheduling_v08', 'chord_scheduling_v07_dev'];

function isChordTool(toolName: string): boolean {
  return CHORD_PATIENT_TOOL_NAMES.includes(toolName) || CHORD_SCHEDULING_TOOL_NAMES.includes(toolName);
}

function isChordPatientTool(toolName: string): boolean {
  return CHORD_PATIENT_TOOL_NAMES.includes(toolName);
}

// ============================================================================
// HELPERS - Ported from tool scripts
// ============================================================================

function isValidGUID(value: unknown): boolean {
  if (!value || typeof value !== 'string') return false;
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

function getAuthHeader(): string {
  const credentials = Buffer.from(`${AUTH_USERNAME}:${AUTH_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

function cleanParams(params: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      value !== 'NULL' &&
      value !== 'null' &&
      value !== 'None' &&
      value !== 'none' &&
      value !== 'N/A' &&
      value !== 'n/a' &&
      value !== '***'  // PII-masked values from Langfuse
    ) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Error detection from response - from both tool scripts
 */
function checkForError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // Pattern 1: { success: false, error: "..." }
  if (obj.success === false && !obj.llm_guidance) {
    return (obj.error || obj.message || 'Operation failed') as string;
  }

  // Pattern 2: { code: false, error: [...] }
  if (obj.code === false) {
    if (Array.isArray(obj.error)) {
      return obj.error.join(', ');
    }
    return (obj.error || obj.message || 'API returned error') as string;
  }

  // Pattern 3: { error: "..." } without success/code field
  if (obj.error && !obj.data && !obj.patient && !obj.patients && !obj.appointments &&
      !obj.location && !obj.locations && !obj.slots && !obj.groups && !obj.appointmentGUID) {
    if (Array.isArray(obj.error)) {
      return obj.error.join(', ');
    }
    return obj.error as string;
  }

  // Pattern 4: message contains "error"
  if (obj.message && typeof obj.message === 'string' &&
      obj.message.toLowerCase().includes('error') && !obj.appointmentGUID) {
    return obj.message;
  }

  return null;
}

// ============================================================================
// DATE HELPERS - From scheduling_tool_func.js
// ============================================================================

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}

interface DateRangeResult {
  startDate: string;
  endDate: string;
  expansionDays: number;
  datesCorrected: boolean;
}

/**
 * Date range correction with future date validation - from scheduling_tool_func.js
 */
function correctDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  expansionDays: number = DATE_EXPANSION_TIERS[0],
  logs: string[]
): DateRangeResult {
  let correctedStart = startDate ? parseDate(startDate) : null;
  let correctedEnd = endDate ? parseDate(endDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let datesCorrected = false;
  const originalStart = startDate;
  const originalEnd = endDate;

  // Check if dates are too far in the future (LLM hallucination detection)
  const maxFutureDate = new Date(today);
  maxFutureDate.setDate(maxFutureDate.getDate() + MAX_FUTURE_DAYS);

  if (correctedStart && correctedStart > maxFutureDate) {
    const daysInFuture = Math.ceil((correctedStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    logs.push(`[v51] WARNING: startDate ${startDate} is ${daysInFuture} days in future - AUTO-CORRECTING to today`);
    correctedStart = null;
    datesCorrected = true;
  }
  if (correctedEnd && correctedEnd > maxFutureDate) {
    logs.push(`[v51] WARNING: endDate ${endDate} is too far in future - will be recalculated`);
    correctedEnd = null;
    datesCorrected = true;
  }

  // Fix dates in the past or missing
  if (!correctedStart || correctedStart < today) {
    correctedStart = new Date(Math.max(today.getTime(), SANDBOX_MIN_DATE.getTime()));
  }
  if (correctedStart < SANDBOX_MIN_DATE) {
    correctedStart = new Date(SANDBOX_MIN_DATE);
  }

  // Calculate days between dates
  let daysDiff = 0;
  if (correctedEnd && correctedEnd > correctedStart) {
    daysDiff = Math.ceil((correctedEnd.getTime() - correctedStart.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Enforce minimum range AND use expansion tier
  if (!correctedEnd || correctedEnd <= correctedStart || daysDiff < MIN_DATE_RANGE_DAYS) {
    correctedEnd = new Date(correctedStart);
    correctedEnd.setDate(correctedEnd.getDate() + expansionDays);
  }

  if (datesCorrected) {
    logs.push(`[v51] Date auto-correction: original=${originalStart} to ${originalEnd} -> corrected=${formatDate(correctedStart)} to ${formatDate(correctedEnd)}`);
  }

  return {
    startDate: formatDate(correctedStart),
    endDate: formatDate(correctedEnd),
    expansionDays,
    datesCorrected,
  };
}

/**
 * Format slots response - from scheduling_tool_func.js
 */
function formatSlotsResponse(data: Record<string, unknown>): Record<string, unknown> {
  if (data && data.slots && Array.isArray(data.slots)) {
    data.slots = data.slots.map((slot: Record<string, unknown>) => {
      // NexHealth returns {time, end_time, operatory_id, date, day_of_week}
      // Ortho/Cloud9 returns {startTime, scheduleViewGUID, scheduleColumnGUID, appointmentTypeGUID, minutes}
      const isNexHealth = slot.time !== undefined || slot.operatory_id !== undefined;
      if (isNexHealth) {
        return {
          displayTime: slot.time,
          startTime: slot.time,
          endTime: slot.end_time,
          operatoryId: slot.operatory_id,
          date: slot.date,
          dayOfWeek: slot.day_of_week,
        };
      }
      return {
        displayTime: slot.startTime || slot.StartTime,
        startTime: slot.startTime || slot.StartTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: slot.minutes,
      };
    });
  }
  if (data && data.groups && Array.isArray(data.groups)) {
    data.groups = data.groups.map((group: Record<string, unknown>) => {
      const slots = group.slots && Array.isArray(group.slots) ? group.slots : [];
      const firstSlot = slots[0] as Record<string, unknown> | undefined;
      return {
        groupTime: firstSlot
          ? (firstSlot.time || firstSlot.startTime || firstSlot.StartTime)
          : null,
        slots: slots.map((slot: Record<string, unknown>) => {
          const isNexHealth = slot.time !== undefined || slot.operatory_id !== undefined;
          if (isNexHealth) {
            return {
              displayTime: slot.time,
              startTime: slot.time,
              endTime: slot.end_time,
              operatoryId: slot.operatory_id,
              date: slot.date,
              dayOfWeek: slot.day_of_week,
            };
          }
          return {
            displayTime: slot.startTime || slot.StartTime,
            startTime: slot.startTime || slot.StartTime,
            scheduleViewGUID: slot.scheduleViewGUID,
            scheduleColumnGUID: slot.scheduleColumnGUID,
            appointmentTypeGUID: slot.appointmentTypeGUID,
            minutes: slot.minutes,
          };
        }),
      };
    });
  }
  delete data.voiceSlots;
  return data;
}

// ============================================================================
// PATIENT TOOL EMULATOR - chord_ortho_patient
// ============================================================================

interface PatientActionConfig {
  endpoint: string;
  method: string;
  buildBody: (params: Record<string, unknown>, uui: string) => Record<string, unknown>;
  validate: (params: Record<string, unknown>) => void;
  successLog: string;
}

const PATIENT_ACTIONS: Record<string, PatientActionConfig> = {
  lookup: {
    endpoint: `${BASE_URL}/ortho-prd/getPatientByFilter`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      phoneNumber: params.phoneNumber,
      filter: params.filter,
      locationGUID: params.locationGUID,
    }),
    validate: (params) => {
      if (!params.phoneNumber && !params.filter) {
        throw new Error("phoneNumber or filter is required for 'lookup' action");
      }
    },
    successLog: 'Patient lookup completed',
  },
  get: {
    endpoint: `${BASE_URL}/ortho-prd/getPatient`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      patientGUID: params.patientGUID,
    }),
    validate: (params) => {
      if (!params.patientGUID) {
        throw new Error("patientGUID is required for 'get' action");
      }
    },
    successLog: 'Patient retrieved successfully',
  },
  create: {
    endpoint: `${BASE_URL}/ortho-prd/createPatient`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      patientFirstName: params.patientFirstName,
      patientLastName: params.patientLastName,
      birthdayDateTime: params.birthdayDateTime,
      phoneNumber: params.phoneNumber,
      emailAddress: params.emailAddress,
      gender: params.gender,
      providerGUID: isValidGUID(params.providerGUID) ? params.providerGUID : DEFAULT_PROVIDER_GUID,
      locationGUID: isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID,
    }),
    validate: (params) => {
      if (!params.patientFirstName) throw new Error("patientFirstName (PARENT's first name) is required for 'create' action");
      if (!params.patientLastName) throw new Error("patientLastName (PARENT's last name) is required for 'create' action");
    },
    successLog: 'Patient created successfully',
  },
  appointments: {
    endpoint: `${BASE_URL}/ortho-prd/getPatientAppts`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      patientGUID: params.patientGUID,
    }),
    validate: (params) => {
      if (!params.patientGUID) {
        throw new Error("patientGUID is required for 'appointments' action");
      }
    },
    successLog: 'Patient appointments retrieved',
  },
  clinic_info: {
    endpoint: `${BASE_URL}/ortho-prd/getLocation`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      locationGUID: isValidGUID(params.locationGUID) ? params.locationGUID : DEFAULT_LOCATION_GUID,
    }),
    validate: () => {},
    successLog: 'Clinic info retrieved',
  },
  edit_insurance: {
    endpoint: `${BASE_URL}/ortho-prd/editInsurance`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      patientGUID: params.patientGUID,
      insuranceProvider: params.insuranceProvider,
      insuranceGroupId: params.insuranceGroupId,
      insuranceMemberId: params.insuranceMemberId,
    }),
    validate: (params) => {
      if (!params.patientGUID) {
        throw new Error("patientGUID is required for 'edit_insurance' action");
      }
    },
    successLog: 'Patient insurance updated successfully',
  },
  confirm_appointment: {
    endpoint: `${BASE_URL}/ortho-prd/confirmAppt`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      appointmentId: params.appointmentId,
    }),
    validate: (params) => {
      if (!params.appointmentId) {
        throw new Error("appointmentId is required for 'confirm_appointment' action");
      }
    },
    successLog: 'Appointment confirmed successfully',
  },
};

// ============================================================================
// SCHEDULING TOOL EMULATOR - schedule_appointment_ortho
// ============================================================================

interface SchedulingActionConfig {
  endpoint: string;
  method: string;
  buildBody: (params: Record<string, unknown>, uui: string) => Record<string, unknown>;
  validate: (params: Record<string, unknown>) => void;
  successLog: (data: Record<string, unknown>) => string;
  usesDateExpansion?: boolean;
}

const SCHEDULING_ACTIONS: Record<string, SchedulingActionConfig> = {
  slots: {
    endpoint: `${BASE_URL}/ortho-prd/getApptSlots`,
    method: 'POST',
    buildBody: (params, uui) => {
      const body: Record<string, unknown> = {
        uui,
        startDate: params.startDate,
        endDate: params.endDate,
      };
      if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
      return body;
    },
    validate: () => {},
    successLog: (data) => `Found ${data.count || (Array.isArray(data.slots) ? data.slots.length : 0) || 0} available slots`,
    usesDateExpansion: true,
  },
  grouped_slots: {
    endpoint: `${BASE_URL}/ortho-prd/getGroupedApptSlots`,
    method: 'POST',
    buildBody: (params, uui) => {
      const body: Record<string, unknown> = {
        uui,
        startDate: params.startDate,
        endDate: params.endDate,
        numberOfPatients: params.numberOfPatients || 2,
        timeWindowMinutes: params.timeWindowMinutes || 30,
      };
      if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
      return body;
    },
    validate: () => {},
    successLog: (data) => `Found ${data.totalGroups || (Array.isArray(data.groups) ? data.groups.length : 0) || 0} grouped slot options`,
    usesDateExpansion: true,
  },
  book_child: {
    endpoint: `${BASE_URL}/ortho-prd/createAppt`,
    method: 'POST',
    buildBody: (params, uui) => {
      // Build child info note like the tool does
      let note = '';
      if (params.childName) {
        note = 'Child: ' + params.childName;
        if (params.childDOB) note += ' | DOB: ' + params.childDOB;
        if (params.insuranceProvider) note += ' | Insurance: ' + params.insuranceProvider;
        if (params.groupID) note += ' | GroupID: ' + params.groupID;
        if (params.memberID) note += ' | MemberID: ' + params.memberID;
      }

      const body: Record<string, unknown> = {
        uui,
        patientGUID: params.patientGUID,
        startTime: params.startTime,
        scheduleViewGUID: params.scheduleViewGUID,
        scheduleColumnGUID: params.scheduleColumnGUID || DEFAULT_SCHEDULE_COLUMN_GUID,
        appointmentTypeGUID: params.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
        minutes: params.minutes || 45,
        childName: params.childName,
        bookingAuthToken: params.bookingAuthToken,
      };

      if (note) body.note = note;
      return body;
    },
    validate: (params) => {
      if (!params.patientGUID) throw new Error('BOOKING FAILED - Missing patientGUID (parent GUID)');
      if (!params.startTime) throw new Error('BOOKING FAILED - Missing startTime');
      if (!params.scheduleViewGUID) throw new Error('BOOKING FAILED - Missing scheduleViewGUID');
    },
    successLog: () => 'Appointment booked successfully',
  },
  cancel: {
    endpoint: `${BASE_URL}/ortho-prd/cancelAppt`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      appointmentGUID: params.appointmentGUID,
    }),
    validate: (params) => {
      if (!params.appointmentGUID) throw new Error('appointmentGUID required');
    },
    successLog: () => 'Appointment cancelled successfully',
  },
};

// ============================================================================
// CHORD (NEXHEALTH) PATIENT TOOL ACTIONS - From tenants/chord/v1/patient_tool_func.js
// ============================================================================

interface ChordPatientActionConfig {
  endpoint: string | ((params: Record<string, unknown>) => string);
  method: string;
  buildBody: (params: Record<string, unknown>, uui: string) => Record<string, unknown>;
  validate: (params: Record<string, unknown>) => void;
  successLog: string;
}

const CHORD_PATIENT_ACTIONS: Record<string, ChordPatientActionConfig> = {
  lookup: {
    // NexHealth has separate endpoints for phone vs email lookup
    endpoint: (params: Record<string, unknown>) => {
      if (params.phoneNumber) return `${BASE_URL}/getPatientByPhoneNum`;
      if (params.emailAddress || params.filter) return `${BASE_URL}/getPatientByEmail`;
      return `${BASE_URL}/getPatientByPhoneNum`;
    },
    method: 'POST',
    buildBody: (params, uui) => {
      const body: Record<string, unknown> = { uui };
      if (params.phoneNumber) body.phoneNumber = params.phoneNumber;
      if (params.emailAddress) body.emailAddress = params.emailAddress;
      if (params.filter) {
        if (typeof params.filter === 'string' && params.filter.includes('@')) {
          body.emailAddress = params.filter;
        } else {
          body.phoneNumber = params.filter;
        }
      }
      body.locationId = params.locationId || CHORD_DEFAULT_LOCATION_ID;
      return body;
    },
    validate: (params) => {
      if (!params.phoneNumber && !params.filter && !params.emailAddress) {
        throw new Error("phoneNumber, emailAddress, or filter is required for 'lookup' action");
      }
    },
    successLog: 'Patient lookup completed',
  },
  get: {
    endpoint: `${BASE_URL}/getPatient`,
    method: 'POST',
    buildBody: (params, uui) => ({ uui, patientId: params.patientId }),
    validate: (params) => {
      if (!params.patientId) throw new Error("patientId is required for 'get' action");
    },
    successLog: 'Patient retrieved successfully',
  },
  create: {
    endpoint: `${BASE_URL}/createPatient`,
    method: 'POST',
    buildBody: (params, uui) => {
      const body: Record<string, unknown> = {
        uui,
        patientFirstName: params.patientFirstName,
        patientLastName: params.patientLastName,
        birthdayDateTime: params.birthdayDateTime,
        gender: params.gender,
        providerId: isValidId(params.providerId) ? params.providerId : CHORD_DEFAULT_PROVIDER_ID,
        locationId: isValidId(params.locationId) ? params.locationId : CHORD_DEFAULT_LOCATION_ID,
      };
      if (params.phoneNumber) body.phoneNumber = params.phoneNumber;
      if (params.emailAddress) body.emailAddress = params.emailAddress;
      return body;
    },
    validate: (params) => {
      if (!params.patientFirstName) throw new Error("patientFirstName is required for 'create' action");
      if (!params.patientLastName) throw new Error("patientLastName is required for 'create' action");
    },
    successLog: 'Patient created successfully',
  },
  appointments: {
    endpoint: `${BASE_URL}/getPatientAppts`,
    method: 'POST',
    buildBody: (params, uui) => ({ uui, patientId: params.patientId }),
    validate: (params) => {
      if (!params.patientId) throw new Error("patientId is required for 'appointments' action");
    },
    successLog: 'Patient appointments retrieved',
  },
  clinic_info: {
    endpoint: `${BASE_URL}/getLocation`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      locationId: isValidId(params.locationId) ? params.locationId : CHORD_DEFAULT_LOCATION_ID,
    }),
    validate: () => {},
    successLog: 'Clinic info retrieved',
  },
  edit_insurance: {
    endpoint: `${BASE_URL}/editPatientInsurance`,
    method: 'POST',
    buildBody: (params, uui) => ({
      uui,
      patientId: params.patientId,
      insuranceProvider: params.insuranceProvider,
      insuranceGroupId: params.insuranceGroupId,
      insuranceMemberId: params.insuranceMemberId,
    }),
    validate: (params) => {
      if (!params.patientId) throw new Error("patientId is required for 'edit_insurance' action");
    },
    successLog: 'Patient insurance updated successfully',
  },
  confirm_appointment: {
    endpoint: `${BASE_URL}/confirmAppt`,
    method: 'POST',
    buildBody: (params, uui) => ({ uui, appointmentId: params.appointmentId }),
    validate: (params) => {
      if (!params.appointmentId) throw new Error("appointmentId is required for 'confirm_appointment' action");
    },
    successLog: 'Appointment confirmed successfully',
  },
};

// ============================================================================
// CHORD (NEXHEALTH) SCHEDULING TOOL ACTIONS - From tenants/chord/v1/scheduling_tool_func.js
// ============================================================================

const CHORD_SCHEDULING_ACTIONS: Record<string, SchedulingActionConfig> = {
  slots: {
    endpoint: `${BASE_URL}/getApptSlots`,
    method: 'POST',
    buildBody: (params, uui) => {
      const body: Record<string, unknown> = { uui, startDate: params.startDate, endDate: params.endDate };
      if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
      // Node-RED DetermineProvider needs isNewPatient + patientDob to select correct NexHealth provider
      if (params.isNewPatient !== undefined) body.isNewPatient = params.isNewPatient;
      if (params.patientDob) body.patientDob = params.patientDob;
      if (params.patientAge) body.patientAge = params.patientAge;
      if (params.sessionId) body.sessionId = params.sessionId;
      // Default isNewPatient to true if not specified (new patient = broader provider availability)
      if (body.isNewPatient === undefined) body.isNewPatient = true;
      return body;
    },
    validate: () => {},
    successLog: (data) => `Found ${data.count || (Array.isArray(data.slots) ? data.slots.length : 0) || 0} available slots`,
    usesDateExpansion: true,
  },
  grouped_slots: {
    endpoint: `${BASE_URL}/getGroupedApptSlots`,
    method: 'POST',
    buildBody: (params, uui) => {
      const body: Record<string, unknown> = {
        uui, startDate: params.startDate, endDate: params.endDate,
        numberOfPatients: params.numberOfPatients || 1,
        timeWindowMinutes: params.timeWindowMinutes || 40,
      };
      if (params.scheduleViewGUIDs) body.scheduleViewGUIDs = params.scheduleViewGUIDs;
      // Node-RED DetermineProvider needs isNewPatient + patientDob to select correct NexHealth provider
      if (params.isNewPatient !== undefined) body.isNewPatient = params.isNewPatient;
      if (params.patientDob) body.patientDob = params.patientDob;
      if (params.patientAge) body.patientAge = params.patientAge;
      if (params.sessionId) body.sessionId = params.sessionId;
      if (body.isNewPatient === undefined) body.isNewPatient = true;
      return body;
    },
    validate: () => {},
    successLog: (data) => `Found ${data.totalGroups || (Array.isArray(data.groups) ? data.groups.length : 0) || 0} grouped slot options`,
    usesDateExpansion: true,
  },
  book_child: {
    endpoint: `${BASE_URL}/createAppt`,
    method: 'POST',
    buildBody: (params, uui) => {
      const body: Record<string, unknown> = {
        uui,
        patientId: params.patientId || params.patientGUID,
        bookingAuthToken: params.bookingAuthToken,
      };
      if (params.children && Array.isArray(params.children)) {
        body.children = params.children;
      } else {
        // Support both Ortho field names (startTime, scheduleViewGUID) and
        // Chord/NexHealth field names (appointmentDate+appointmentTime, operatoryId)
        if (params.startTime) body.startTime = params.startTime;
        if (params.appointmentDate) body.appointmentDate = params.appointmentDate;
        if (params.appointmentTime) body.appointmentTime = params.appointmentTime;
        if (params.scheduleViewGUID || params.scheduleViewId) {
          body.scheduleViewGUID = params.scheduleViewGUID || params.scheduleViewId;
        }
        if (params.operatoryId) body.operatoryId = params.operatoryId;
        if (params.scheduleColumnGUID || params.scheduleColumnId) {
          body.scheduleColumnGUID = params.scheduleColumnGUID || params.scheduleColumnId;
        }
        if (params.appointmentTypeGUID || params.appointmentTypeId) {
          body.appointmentTypeGUID = params.appointmentTypeGUID || params.appointmentTypeId;
        }
        if (params.minutes) body.minutes = params.minutes;
        if (params.childName) body.childName = params.childName;
        if (params.childFirstName) body.childFirstName = params.childFirstName;
        if (params.childLastName) body.childLastName = params.childLastName;
        if (params.childDateOfBirth) body.childDateOfBirth = params.childDateOfBirth;
      }
      return body;
    },
    validate: (params) => {
      if (!params.patientId && !params.patientGUID) throw new Error('BOOKING FAILED - Missing patientId');
      // Accept either startTime (Ortho) or appointmentDate+appointmentTime (Chord/NexHealth)
      const hasTime = params.startTime || (params.appointmentDate && params.appointmentTime);
      if (!hasTime && (!params.children || !Array.isArray(params.children))) {
        throw new Error('BOOKING FAILED - Missing startTime or appointmentDate/appointmentTime');
      }
    },
    successLog: () => 'Appointment booked successfully',
  },
  cancel: {
    endpoint: `${BASE_URL}/cancelAppt`,
    method: 'POST',
    buildBody: (params, uui) => ({ uui, appointmentId: params.appointmentId || params.appointmentGUID }),
    validate: (params) => {
      if (!params.appointmentId && !params.appointmentGUID) throw new Error('appointmentId required');
    },
    successLog: () => 'Appointment cancelled successfully',
  },
};

// ============================================================================
// HTTP REQUEST EXECUTION
// ============================================================================

/**
 * Extract mock key from endpoint URL.
 * E.g. "https://.../chord/ortho-prd/getPatientByFilter" -> "getPatientByFilter"
 */
function extractMockKey(endpoint: string): string {
  const segments = endpoint.split('/');
  return segments[segments.length - 1] || endpoint;
}

async function executeHttpRequest(
  endpoint: string,
  method: string,
  body: Record<string, unknown>,
  logs: string[],
  mockMap?: Record<string, any>
): Promise<{ ok: boolean; status: number; statusText: string; data: unknown }> {
  // Mock mode: return captured response instead of hitting live endpoint
  if (mockMap) {
    const mockKey = extractMockKey(endpoint);
    logs.push(`[MOCK] ${method} ${endpoint} (key: ${mockKey})`);
    logs.push(`[MOCK] Body: ${JSON.stringify(body, null, 2)}`);

    if (mockKey in mockMap) {
      const mockData = mockMap[mockKey];
      logs.push(`[MOCK] Found captured response for key "${mockKey}"`);
      return {
        ok: true,
        status: 200,
        statusText: 'OK (Mock)',
        data: mockData,
      };
    }

    // No mock match - return error, don't fall through to live
    logs.push(`[MOCK] WARNING: No captured response for key "${mockKey}" - available keys: ${Object.keys(mockMap).join(', ')}`);
    return {
      ok: false,
      status: 404,
      statusText: 'Mock Not Found',
      data: { error: `No mock data for endpoint key "${mockKey}"` },
    };
  }

  // Live mode
  logs.push(`[HTTP] ${method} ${endpoint}`);
  logs.push(`[HTTP] Body: ${JSON.stringify(body, null, 2)}`);

  const response = await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = responseText;
  }

  logs.push(`[HTTP] Response: ${response.status} ${response.statusText}`);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
  };
}

// ============================================================================
// SLOT SEARCH WITH EXPANSION - From scheduling_tool_func.js
// ============================================================================

async function searchSlotsWithExpansion(
  action: 'slots' | 'grouped_slots',
  params: Record<string, unknown>,
  uui: string,
  logs: string[],
  mockMap?: Record<string, any>,
  useChordConfig?: boolean
): Promise<{ success: boolean; data: Record<string, unknown>; endpoint: string; statusCode: number }> {
  const actionsMap = useChordConfig ? CHORD_SCHEDULING_ACTIONS : SCHEDULING_ACTIONS;
  const tiers = useChordConfig ? CHORD_DATE_EXPANSION_TIERS : DATE_EXPANSION_TIERS;
  const config = actionsMap[action];
  let lastError: string | null = null;
  let searchExpanded = false;
  let finalExpansionDays = tiers[0];
  let lastEndpoint = config.endpoint;
  let lastStatusCode = 0;

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
    const expansionDays = tiers[tierIndex];
    const corrected = correctDateRange(
      params.startDate as string | undefined,
      params.endDate as string | undefined,
      expansionDays,
      logs
    );

    const searchParams = { ...params, startDate: corrected.startDate, endDate: corrected.endDate };
    const body = config.buildBody(searchParams, uui);

    logs.push(`[v50] Tier ${tierIndex} search: ${corrected.startDate} to ${corrected.endDate} (${expansionDays} days)`);

    try {
      const response = await executeHttpRequest(config.endpoint, config.method, body, logs, mockMap);
      lastEndpoint = config.endpoint;
      lastStatusCode = response.status;

      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        continue;
      }

      const errorMessage = checkForError(response.data);
      if (errorMessage) {
        lastError = errorMessage;
        continue;
      }

      // Chord NexHealth returns slots as a raw array, Ortho returns {slots: [...]}
      // Normalize: if response is a raw array, wrap it
      let data: Record<string, unknown>;
      if (Array.isArray(response.data)) {
        const arr = response.data as unknown[];
        data = action === 'slots'
          ? { slots: arr, count: arr.length }
          : { groups: arr, totalGroups: arr.length };
        logs.push(`[v50] Response is raw array (${arr.length} items), normalized to {${action === 'slots' ? 'slots' : 'groups'}: [...]}`);
      } else {
        data = response.data as Record<string, unknown>;
      }

      // Check if we got slots/groups
      const hasResults =
        (action === 'slots' && data.slots && Array.isArray(data.slots) && (data.slots as unknown[]).length > 0) ||
        (action === 'grouped_slots' && data.groups && Array.isArray(data.groups) && (data.groups as unknown[]).length > 0);

      if (hasResults) {
        // Add metadata about the search
        data._searchExpanded = tierIndex > 0;
        data._expansionTier = tierIndex;
        data._dateRange = { start: corrected.startDate, end: corrected.endDate, days: expansionDays };
        if (tierIndex > 0) {
          logs.push(`[v50] Found slots after expanding to tier ${tierIndex} (${expansionDays} days)`);
        }
        return { success: true, data, endpoint: lastEndpoint, statusCode: lastStatusCode };
      }

      // No results, try next tier
      searchExpanded = true;
      finalExpansionDays = expansionDays;
      logs.push(`[v50] No slots found at tier ${tierIndex}, expanding...`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Unknown error';
      logs.push(`[v50] Search error at tier ${tierIndex}: ${lastError}`);
    }
  }

  // All tiers exhausted, no slots found
  logs.push('[v50] All expansion tiers exhausted, no slots found');
  return {
    success: false,
    data: {
      slots: [],
      groups: [],
      count: 0,
      totalGroups: 0,
      _toolVersion: useChordConfig ? CHORD_SCHEDULING_TOOL_VERSION : SCHEDULING_TOOL_VERSION,
      _searchExpanded: searchExpanded,
      _expansionTier: tiers.length - 1,
      _dateRange: { days: finalExpansionDays },
      _debug_error: lastError || `No slots available after searching ${finalExpansionDays} days`,
      llm_guidance: {
        error_type: 'no_slots_after_expansion',
        voice_response: `I apologize, but I was not able to find any available appointments within the next ${Math.round(finalExpansionDays / 7)} weeks.`,
        action_required: 'transfer_to_agent',
        transfer_reason: 'no_availability_after_8_week_search',
        CRITICAL: 'All date expansion tiers exhausted. Transfer to agent for manual scheduling assistance.',
      },
    },
    endpoint: lastEndpoint,
    statusCode: lastStatusCode,
  };
}

// ============================================================================
// MAIN EXECUTION - Emulates full tool logic
// ============================================================================

async function executePatientTool(
  action: string,
  params: Record<string, unknown>,
  logs: string[],
  mockMap?: Record<string, any>
): Promise<{ success: boolean; data: unknown; endpoint: string; statusCode: number }> {
  const config = PATIENT_ACTIONS[action];
  if (!config) {
    throw new Error(`Invalid action '${action}'. Valid actions: ${Object.keys(PATIENT_ACTIONS).join(', ')}`);
  }

  const uui = (params.uui as string) || DEFAULT_UUI;
  logs.push(`[chord_ortho_patient] Action: ${action}`);
  logs.push(`[chord_ortho_patient] UUI: ${uui.substring(0, 20)}...`);

  // Validate parameters
  try {
    config.validate(params);
    logs.push(`[chord_ortho_patient] Validation passed`);
  } catch (e) {
    throw e;
  }

  // Build request body
  const body = config.buildBody(params, uui);
  logs.push(`[chord_ortho_patient] Endpoint: ${config.method} ${config.endpoint}`);

  // Execute request
  const response = await executeHttpRequest(config.endpoint, config.method, body, logs, mockMap);

  if (!response.ok) {
    const bodyError = checkForError(response.data);
    throw new Error(bodyError || `HTTP ${response.status}: ${response.statusText}`);
  }

  // Check for error patterns in response
  const errorMessage = checkForError(response.data);
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  let responseData = response.data as Record<string, unknown>;

  // Add booking auth token guidance for create action (v9)
  if (action === 'create' && responseData.success && responseData.patientGUID) {
    responseData.llm_guidance = {
      model: 'PARENT_AS_PATIENT',
      current_state: 'PATIENT_CREATED',
      next_action: 'call_book_child_for_each_child',
      critical_instruction: 'Patient (parent) created successfully. Now call schedule_appointment_ortho action=book_child for EACH child.',
      patientGUID_for_booking: responseData.patientGUID,
      bookingAuthToken_for_booking: responseData.bookingAuthToken,
    };
  }

  responseData._toolVersion = PATIENT_TOOL_VERSION;
  logs.push(`[chord_ortho_patient] ${config.successLog}`);

  return {
    success: true,
    data: responseData,
    endpoint: config.endpoint,
    statusCode: response.status,
  };
}

async function executeSchedulingTool(
  action: string,
  params: Record<string, unknown>,
  logs: string[],
  mockMap?: Record<string, any>
): Promise<{ success: boolean; data: unknown; endpoint: string; statusCode: number }> {
  const config = SCHEDULING_ACTIONS[action];
  if (!config) {
    throw new Error(`Invalid action '${action}'. Valid actions: ${Object.keys(SCHEDULING_ACTIONS).join(', ')}`);
  }

  const uui = (params.uui as string) || DEFAULT_UUI;
  logs.push(`[schedule_appointment_ortho] ${SCHEDULING_TOOL_VERSION} - Action: ${action}`);

  // Use progressive expansion for slots/grouped_slots
  if (config.usesDateExpansion) {
    const result = await searchSlotsWithExpansion(action as 'slots' | 'grouped_slots', params, uui, logs, mockMap);

    if (!result.success) {
      return result;
    }

    let data = result.data;
    logs.push(`[schedule_appointment_ortho] ${config.successLog(data)}`);

    // Format slots response
    data = formatSlotsResponse(data);

    // Truncate to MAX_SLOTS_RETURNED
    if (data.slots && Array.isArray(data.slots) && data.slots.length > MAX_SLOTS_RETURNED) {
      data.slots = data.slots.slice(0, MAX_SLOTS_RETURNED);
      data.count = MAX_SLOTS_RETURNED;
      data._truncated = true;
    }
    if (data.groups && Array.isArray(data.groups) && data.groups.length > MAX_SLOTS_RETURNED) {
      data.groups = data.groups.slice(0, MAX_SLOTS_RETURNED);
      data.totalGroups = MAX_SLOTS_RETURNED;
      data._truncated = true;
    }

    data._toolVersion = SCHEDULING_TOOL_VERSION;
    data.llm_guidance = {
      timestamp: new Date().toISOString(),
      model: 'PARENT_AS_PATIENT',
      BOOKING_SEQUENCE_MANDATORY: [
        'STEP 1: Offer the slot time(s) to the caller and wait for confirmation',
        'STEP 2: When caller confirms, call chord_ortho_patient action=create with PARENT firstName/lastName/phone',
        'STEP 3: Get the patientGUID from the chord_ortho_patient response - this is the PARENT GUID',
        'STEP 4: For EACH child, call schedule_appointment_ortho action=book_child',
      ],
      next_action: 'offer_time_to_caller_and_wait_for_confirmation',
    };

    return { success: true, data, endpoint: result.endpoint, statusCode: result.statusCode };
  }

  // Non-slot actions (book_child, cancel)
  try {
    config.validate(params);
    logs.push(`[schedule_appointment_ortho] Validation passed`);
  } catch (e) {
    // Return structured error for booking failures
    if (e instanceof Error && (e.message.includes('BOOKING FAILED') || e.message.includes('Missing'))) {
      return {
        success: false,
        data: {
          success: false,
          _toolVersion: SCHEDULING_TOOL_VERSION,
          _debug_error: e.message,
          llm_guidance: {
            error_type: 'missing_params',
            voice_response: 'Let me check those details again.',
            action_required: 'provide_required_params',
            CRITICAL: 'book_child requires: patientGUID, startTime, scheduleViewGUID.',
          },
        },
        endpoint: config.endpoint,
        statusCode: 400,
      };
    }
    throw e;
  }

  const body = config.buildBody(params, uui);
  const response = await executeHttpRequest(config.endpoint, config.method, body, logs, mockMap);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const errorMessage = checkForError(response.data);
  if (errorMessage) {
    // Check for slot no longer available
    if (errorMessage.includes('cannot be scheduled') || errorMessage.includes('time slot') || errorMessage.includes('not available')) {
      return {
        success: false,
        data: {
          success: false,
          _toolVersion: SCHEDULING_TOOL_VERSION,
          _debug_error: errorMessage,
          llm_guidance: {
            error_type: 'slot_no_longer_available',
            voice_response: 'That time is no longer available. Let me find another option.',
            action_required: 'call_slots_offer_new_time',
          },
        },
        endpoint: config.endpoint,
        statusCode: response.status,
      };
    }
    throw new Error(errorMessage);
  }

  const data = response.data as Record<string, unknown>;
  data._toolVersion = SCHEDULING_TOOL_VERSION;
  logs.push(`[schedule_appointment_ortho] ${config.successLog(data)}`);

  return {
    success: true,
    data,
    endpoint: config.endpoint,
    statusCode: response.status,
  };
}

// ============================================================================
// CHORD PATIENT TOOL EXECUTOR
// ============================================================================

async function executeChordPatientTool(
  action: string,
  params: Record<string, unknown>,
  logs: string[],
  mockMap?: Record<string, any>
): Promise<{ success: boolean; data: unknown; endpoint: string; statusCode: number }> {
  const config = CHORD_PATIENT_ACTIONS[action];
  if (!config) {
    throw new Error(`Invalid Chord action '${action}'. Valid actions: ${Object.keys(CHORD_PATIENT_ACTIONS).join(', ')}`);
  }

  const uui = (params.uui as string) || CHORD_DEFAULT_UUI;
  logs.push(`[chord_patient (NexHealth)] Action: ${action}`);
  logs.push(`[chord_patient (NexHealth)] UUI: ${uui.substring(0, 20)}...`);

  config.validate(params);
  logs.push(`[chord_patient (NexHealth)] Validation passed`);

  const body = config.buildBody(params, uui);
  const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;
  logs.push(`[chord_patient (NexHealth)] Endpoint: ${config.method} ${endpoint}`);

  const response = await executeHttpRequest(endpoint, config.method, body, logs, mockMap);

  if (!response.ok) {
    const bodyError = checkForError(response.data);
    throw new Error(bodyError || `HTTP ${response.status}: ${response.statusText}`);
  }

  const errorMessage = checkForError(response.data);
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const responseData = response.data as Record<string, unknown>;
  responseData._toolVersion = CHORD_PATIENT_TOOL_VERSION;
  logs.push(`[chord_patient (NexHealth)] ${config.successLog}`);

  return { success: true, data: responseData, endpoint, statusCode: response.status };
}

// ============================================================================
// CHORD SCHEDULING TOOL EXECUTOR
// ============================================================================

async function executeChordSchedulingTool(
  action: string,
  params: Record<string, unknown>,
  logs: string[],
  mockMap?: Record<string, any>
): Promise<{ success: boolean; data: unknown; endpoint: string; statusCode: number }> {
  // Normalize K8 parameter names to replay-expected names
  // K8 uses searchStartDate instead of startDate, operatoryId instead of scheduleViewGUID, etc.
  if (params.searchStartDate && !params.startDate) {
    params.startDate = params.searchStartDate;
    logs.push(`[chord_scheduling] Mapped searchStartDate -> startDate: ${params.startDate}`);
  }
  if (params.operatoryId && !params.scheduleViewGUID && !params.scheduleViewId) {
    params.scheduleViewId = params.operatoryId;
    logs.push(`[chord_scheduling] Mapped operatoryId -> scheduleViewId: ${params.operatoryId}`);
  }
  if (params.childFirstName && !params.childName) {
    const fullName = params.childLastName
      ? `${params.childFirstName} ${params.childLastName}`
      : params.childFirstName;
    params.childName = fullName;
  }

  const config = CHORD_SCHEDULING_ACTIONS[action];
  if (!config) {
    throw new Error(`Invalid Chord action '${action}'. Valid actions: ${Object.keys(CHORD_SCHEDULING_ACTIONS).join(', ')}`);
  }

  const uui = (params.uui as string) || CHORD_DEFAULT_UUI;
  logs.push(`[chord_scheduling (NexHealth)] ${CHORD_SCHEDULING_TOOL_VERSION} - Action: ${action}`);

  // Use progressive expansion for slots/grouped_slots (with Chord tiers)
  if (config.usesDateExpansion) {
    const result = await searchSlotsWithExpansion(action as 'slots' | 'grouped_slots', params, uui, logs, mockMap, true);

    if (!result.success) {
      return result;
    }

    let data = result.data;
    logs.push(`[chord_scheduling (NexHealth)] ${config.successLog(data)}`);
    data = formatSlotsResponse(data);

    if (data.slots && Array.isArray(data.slots) && data.slots.length > MAX_SLOTS_RETURNED) {
      data.slots = data.slots.slice(0, MAX_SLOTS_RETURNED);
      data.count = MAX_SLOTS_RETURNED;
      data._truncated = true;
    }
    if (data.groups && Array.isArray(data.groups) && data.groups.length > MAX_SLOTS_RETURNED) {
      data.groups = data.groups.slice(0, MAX_SLOTS_RETURNED);
      data.totalGroups = MAX_SLOTS_RETURNED;
      data._truncated = true;
    }

    data._toolVersion = CHORD_SCHEDULING_TOOL_VERSION;
    return { success: true, data, endpoint: result.endpoint, statusCode: result.statusCode };
  }

  // Non-slot actions (book_child, cancel)
  try {
    config.validate(params);
    logs.push(`[chord_scheduling (NexHealth)] Validation passed`);
  } catch (e) {
    if (e instanceof Error && (e.message.includes('BOOKING FAILED') || e.message.includes('Missing'))) {
      return {
        success: false,
        data: { success: false, _toolVersion: CHORD_SCHEDULING_TOOL_VERSION, _debug_error: e.message },
        endpoint: config.endpoint,
        statusCode: 400,
      };
    }
    throw e;
  }

  const body = config.buildBody(params, uui);
  const response = await executeHttpRequest(config.endpoint, config.method, body, logs, mockMap);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const errorMessage = checkForError(response.data);
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const data = response.data as Record<string, unknown>;
  data._toolVersion = CHORD_SCHEDULING_TOOL_VERSION;
  logs.push(`[chord_scheduling (NexHealth)] ${config.successLog(data)}`);

  return { success: true, data, endpoint: config.endpoint, statusCode: response.status };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function getAvailableEndpoints(): Record<string, string[]> {
  return {
    chord_ortho_patient: Object.keys(PATIENT_ACTIONS),
    schedule_appointment_ortho: Object.keys(SCHEDULING_ACTIONS),
    chord_patient_v07_stage: Object.keys(CHORD_PATIENT_ACTIONS),
    chord_scheduling_v08: Object.keys(CHORD_SCHEDULING_ACTIONS),
  };
}

export function getEndpointForAction(toolName: string, action: string): string | null {
  if (toolName === 'chord_ortho_patient') {
    return PATIENT_ACTIONS[action]?.endpoint || null;
  }
  if (toolName === 'schedule_appointment_ortho') {
    return SCHEDULING_ACTIONS[action]?.endpoint || null;
  }
  // Chord tools
  if (CHORD_PATIENT_TOOL_NAMES.includes(toolName)) {
    const config = CHORD_PATIENT_ACTIONS[action];
    if (!config) return null;
    return typeof config.endpoint === 'function' ? `${BASE_URL}/getPatientByPhoneNum` : config.endpoint;
  }
  if (CHORD_SCHEDULING_TOOL_NAMES.includes(toolName)) {
    return CHORD_SCHEDULING_ACTIONS[action]?.endpoint || null;
  }
  return null;
}

/**
 * Execute a replay request - emulates the full tool script logic
 */
export async function executeReplay(request: ReplayRequest): Promise<ReplayResponse> {
  const { toolName, action, input, tenantId } = request;
  const logs: string[] = [];
  const startTime = Date.now();

  // Determine if this is a Chord tenant request (tenantId=5 or Chord tool name)
  const isChord = tenantId === 5 || isChordTool(toolName);

  // Clean input params like the tools do
  const params = cleanParams(input);
  logs.push(`[Replay] Tool: ${toolName}, Action: ${action}, Tenant: ${isChord ? 'Chord (NexHealth)' : 'Ortho (Cloud9)'}`);
  logs.push(`[Replay] Input params: ${JSON.stringify(params, null, 2)}`);

  // Resolve tool version for response metadata
  const resolveToolVersion = (): string => {
    if (isChord) {
      return isChordPatientTool(toolName) || toolName === 'chord_ortho_patient'
        ? CHORD_PATIENT_TOOL_VERSION : CHORD_SCHEDULING_TOOL_VERSION;
    }
    return toolName === 'chord_ortho_patient' ? PATIENT_TOOL_VERSION : SCHEDULING_TOOL_VERSION;
  };

  try {
    let result: { success: boolean; data: unknown; endpoint: string; statusCode: number };

    if (isChord) {
      // Chord (NexHealth) tenant - determine if patient or scheduling
      const isPatient = isChordPatientTool(toolName) || toolName === 'chord_ortho_patient';
      if (isPatient) {
        logs.push(`[Replay] Routing to Chord NexHealth patient endpoints (no /ortho-prd/ prefix)`);
        result = await executeChordPatientTool(action, params, logs);
      } else {
        logs.push(`[Replay] Routing to Chord NexHealth scheduling endpoints (no /ortho-prd/ prefix)`);
        result = await executeChordSchedulingTool(action, params, logs);
      }
    } else if (toolName === 'chord_ortho_patient') {
      result = await executePatientTool(action, params, logs);
    } else if (toolName === 'schedule_appointment_ortho') {
      result = await executeSchedulingTool(action, params, logs);
    } else {
      return {
        success: false,
        error: `Unknown tool: ${toolName}. Available tools: chord_ortho_patient, schedule_appointment_ortho, chord_patient_v07_stage, chord_scheduling_v08`,
      };
    }

    const durationMs = Date.now() - startTime;

    return {
      success: result.success,
      data: {
        response: result.data,
        durationMs,
        endpoint: result.endpoint,
        statusCode: result.statusCode,
        timestamp: new Date().toISOString(),
        toolVersion: resolveToolVersion(),
        preCallLogs: logs,
      },
      error: result.success ? undefined : 'Tool execution returned error (see response for details)',
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`[Replay] ERROR: ${errorMessage}`);

    return {
      success: false,
      data: {
        response: {
          success: false,
          error: errorMessage,
          _debug_error: errorMessage,
        },
        durationMs,
        endpoint: getEndpointForAction(toolName, action) || 'unknown',
        statusCode: 0,
        timestamp: new Date().toISOString(),
        toolVersion: resolveToolVersion(),
        preCallLogs: logs,
      },
      error: `Tool execution failed: ${errorMessage}`,
    };
  }
}

// ============================================================================
// MOCK HARNESS - Generate mock data from captured Langfuse observations
// ============================================================================

const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

/**
 * Generate a mock harness from a trace's captured observations.
 * Extracts tool-call observations and builds a mock map keyed by endpoint action name.
 */
export function generateMockHarness(traceId: string): MockHarness {
  const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });

  try {
    const rows = db.prepare(`
      SELECT observation_id, name, type, input, output
      FROM production_trace_observations
      WHERE trace_id = ? AND output IS NOT NULL
    `).all(traceId) as Array<{ observation_id: string; name: string; type: string; input: string | null; output: string }>;

    if (!rows || rows.length === 0) {
      throw new Error(`No observations found for trace ${traceId}`);
    }

    const observations: MockHarness['observations'] = [];
    const mockMap: Record<string, any> = {};

    for (const row of rows) {
      let parsedInput: any = null;
      let parsedOutput: any = null;

      try { parsedInput = row.input ? JSON.parse(row.input) : null; } catch { parsedInput = row.input; }
      try { parsedOutput = JSON.parse(row.output); } catch { parsedOutput = row.output; }

      observations.push({
        observationId: row.observation_id,
        name: row.name,
        input: parsedInput,
        output: parsedOutput,
      });

      // Build mock map: key by observation name (tool/endpoint name)
      // For tool observations like "chord_ortho_patient" or "schedule_appointment_ortho",
      // extract the action endpoint from the input if available
      if (parsedInput && typeof parsedInput === 'object') {
        // Try to extract endpoint action from the input URL or action field
        const inputObj = parsedInput as Record<string, any>;
        if (inputObj.url) {
          const key = extractMockKey(inputObj.url);
          mockMap[key] = parsedOutput;
        }
        if (inputObj.endpoint) {
          const key = extractMockKey(inputObj.endpoint);
          mockMap[key] = parsedOutput;
        }
      }

      // Always also key by observation name for broader matching
      if (row.name && parsedOutput) {
        mockMap[row.name] = parsedOutput;
      }
    }

    return {
      traceId,
      observations,
      mockMap,
      createdAt: new Date().toISOString(),
    };
  } finally {
    db.close();
  }
}

/**
 * Execute a replay using mock data from captured observations instead of live endpoints.
 */
export async function executeMockReplay(
  request: ReplayRequest,
  mockMap: Record<string, any>
): Promise<ReplayResponse> {
  const { toolName, action, input } = request;
  const logs: string[] = [];
  const startTime = Date.now();

  const params = cleanParams(input);
  logs.push(`[MOCK Replay] Tool: ${toolName}, Action: ${action}`);
  logs.push(`[MOCK Replay] Mock map keys: ${Object.keys(mockMap).join(', ')}`);
  logs.push(`[MOCK Replay] Input params: ${JSON.stringify(params, null, 2)}`);

  try {
    let result: { success: boolean; data: unknown; endpoint: string; statusCode: number };

    const isChord = request.tenantId === 5 || isChordTool(toolName);
    if (isChord && (isChordPatientTool(toolName) || toolName === 'chord_ortho_patient')) {
      result = await executeChordPatientTool(action, params, logs, mockMap);
    } else if (isChord) {
      result = await executeChordSchedulingTool(action, params, logs, mockMap);
    } else if (toolName === 'chord_ortho_patient') {
      result = await executePatientTool(action, params, logs, mockMap);
    } else if (toolName === 'schedule_appointment_ortho') {
      result = await executeSchedulingTool(action, params, logs, mockMap);
    } else {
      return {
        success: false,
        error: `Unknown tool: ${toolName}. Available: chord_ortho_patient, schedule_appointment_ortho, chord_patient_v07_stage, chord_scheduling_v08`,
      };
    }

    const durationMs = Date.now() - startTime;
    const resolvedVersion = isChord
      ? (isChordPatientTool(toolName) || toolName === 'chord_ortho_patient' ? CHORD_PATIENT_TOOL_VERSION : CHORD_SCHEDULING_TOOL_VERSION)
      : (toolName === 'chord_ortho_patient' ? PATIENT_TOOL_VERSION : SCHEDULING_TOOL_VERSION);

    return {
      success: result.success,
      data: {
        response: result.data,
        durationMs,
        endpoint: result.endpoint,
        statusCode: result.statusCode,
        timestamp: new Date().toISOString(),
        toolVersion: resolvedVersion,
        preCallLogs: logs,
      },
      error: result.success ? undefined : 'Mock replay returned error (see response for details)',
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`[MOCK Replay] ERROR: ${errorMessage}`);
    const isChord2 = request.tenantId === 5 || isChordTool(toolName);
    const resolvedVersion2 = isChord2
      ? (isChordPatientTool(toolName) || toolName === 'chord_ortho_patient' ? CHORD_PATIENT_TOOL_VERSION : CHORD_SCHEDULING_TOOL_VERSION)
      : (toolName === 'chord_ortho_patient' ? PATIENT_TOOL_VERSION : SCHEDULING_TOOL_VERSION);

    return {
      success: false,
      data: {
        response: {
          success: false,
          error: errorMessage,
          _debug_error: errorMessage,
        },
        durationMs,
        endpoint: getEndpointForAction(toolName, action) || 'unknown',
        statusCode: 0,
        timestamp: new Date().toISOString(),
        toolVersion: resolvedVersion2,
        preCallLogs: logs,
      },
      error: `Mock replay failed: ${errorMessage}`,
    };
  }
}
