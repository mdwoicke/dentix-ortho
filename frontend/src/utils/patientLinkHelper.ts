/**
 * Patient Link Helper
 * Utilities for extracting patient data from API call payloads and creating links
 */

import type { ApiCall } from '../types/testMonitor.types';

export interface ExtractedPatient {
  patientGuid: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Safely parse a payload that might be a string or object
 * Handles double-encoded JSON strings
 */
function parsePayload(payload: any): any {
  if (!payload) return null;

  // If it's already an object, return it
  if (typeof payload === 'object') return payload;

  // If it's a string, try to parse it (possibly multiple times for double-encoding)
  if (typeof payload === 'string') {
    try {
      let parsed = JSON.parse(payload);
      // Check if the result is still a string (double-encoded)
      while (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          break;
        }
      }
      return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extract patient info from a single payload object (recursive)
 */
function extractPatientFromObject(obj: any): ExtractedPatient | null {
  if (!obj || typeof obj !== 'object') return null;

  // Check for patient GUID fields (various naming conventions)
  const guidFields = [
    'patientGuid', 'PatientGUID', 'patientGUID', 'patient_guid', 'guid', 'patGUID',
    'Child1_PatientGUID', 'Child2_PatientGUID', 'Child3_PatientGUID',
    'child1_patient_guid', 'child2_patient_guid', 'child3_patient_guid',
    'Caller_PatientGUID', 'caller_patient_guid',
  ];
  const nameFields = [
    'fullName', 'FullName', 'patientName', 'PatientName', 'name', 'Name',
    'Caller_Name', 'caller_name',
  ];
  const firstNameFields = [
    'firstName', 'FirstName', 'first_name', 'persFirstName',
    'patientFirstName', 'PatientFirstName', 'patient_first_name',
    'Child1_FirstName', 'Child2_FirstName', 'Child3_FirstName',
    'child1_firstname', 'child2_firstname', 'child3_firstname',
    'caller_first_name', 'Caller_First_Name',
  ];
  const lastNameFields = [
    'lastName', 'LastName', 'last_name', 'persLastName',
    'patientLastName', 'PatientLastName', 'patient_last_name',
    'Child1_LastName', 'Child2_LastName', 'Child3_LastName',
    'child1_lastname', 'child2_lastname', 'child3_lastname',
    'caller_last_name', 'Caller_Last_Name',
  ];

  let patientGuid: string | null = null;
  let fullName: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;

  // Look for GUID
  for (const field of guidFields) {
    if (obj[field] && typeof obj[field] === 'string' && isValidGuid(obj[field])) {
      patientGuid = obj[field];
      break;
    }
  }

  // Look for name fields
  for (const field of nameFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      fullName = obj[field];
      break;
    }
  }

  for (const field of firstNameFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      firstName = obj[field];
      break;
    }
  }

  for (const field of lastNameFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      lastName = obj[field];
      break;
    }
  }

  // If we have a GUID and at least some name info, return the patient
  if (patientGuid) {
    const name = fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Patient';
    return {
      patientGuid,
      fullName: name,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    };
  }

  return null;
}

/**
 * Check if a string is a valid GUID format
 */
function isValidGuid(str: string): boolean {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return guidRegex.test(str);
}

/**
 * Recursively search an object for patient data
 */
function searchForPatients(obj: any, patients: Map<string, ExtractedPatient>): void {
  if (!obj || typeof obj !== 'object') return;

  // Try to extract patient from this object
  const patient = extractPatientFromObject(obj);
  if (patient && !patients.has(patient.patientGuid)) {
    patients.set(patient.patientGuid, patient);
  }

  // Recursively search arrays and nested objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      searchForPatients(item, patients);
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        searchForPatients(obj[key], patients);
      }
    }
  }
}

/**
 * Extract name fields from an object (non-recursive, top-level only)
 */
function extractNamesFromObject(obj: any): { firstName?: string; lastName?: string; fullName?: string } {
  if (!obj || typeof obj !== 'object') return {};

  const firstNameFields = [
    'firstName', 'FirstName', 'first_name', 'persFirstName',
    'patientFirstName', 'PatientFirstName', 'patient_first_name',
    'Child1_FirstName', 'Child2_FirstName', 'Child3_FirstName',
  ];
  const lastNameFields = [
    'lastName', 'LastName', 'last_name', 'persLastName',
    'patientLastName', 'PatientLastName', 'patient_last_name',
    'Child1_LastName', 'Child2_LastName', 'Child3_LastName',
  ];
  const nameFields = ['fullName', 'FullName', 'patientName', 'PatientName', 'name', 'Name'];

  let firstName: string | undefined;
  let lastName: string | undefined;
  let fullName: string | undefined;

  for (const field of firstNameFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      firstName = obj[field];
      break;
    }
  }
  for (const field of lastNameFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      lastName = obj[field];
      break;
    }
  }
  for (const field of nameFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      fullName = obj[field];
      break;
    }
  }

  return { firstName, lastName, fullName };
}

/**
 * Extract all patients from an API call's request and response payloads
 * Special handling: if response has GUID but no name, check request for names
 */
export function extractPatientsFromApiCall(apiCall: ApiCall): ExtractedPatient[] {
  const patients = new Map<string, ExtractedPatient>();

  // Parse payloads (handles string/object/double-encoded)
  const requestData = parsePayload(apiCall.requestPayload);
  const responseData = parsePayload(apiCall.responsePayload);

  if (requestData) {
    searchForPatients(requestData, patients);
  }

  if (responseData) {
    searchForPatients(responseData, patients);
  }

  // If we found patients with "Unknown Patient" name, try to get names from request
  for (const [guid, patient] of patients.entries()) {
    if (patient.fullName === 'Unknown Patient' && requestData) {
      const names = extractNamesFromObject(requestData);
      if (names.fullName) {
        patient.fullName = names.fullName;
      } else if (names.firstName || names.lastName) {
        patient.fullName = [names.firstName, names.lastName].filter(Boolean).join(' ');
        patient.firstName = names.firstName;
        patient.lastName = names.lastName;
      }
    }
  }

  return Array.from(patients.values());
}

/**
 * Extract all patients from a list of API calls
 */
export function extractPatientsFromApiCalls(apiCalls: ApiCall[]): ExtractedPatient[] {
  const patients = new Map<string, ExtractedPatient>();

  for (const call of apiCalls) {
    const callPatients = extractPatientsFromApiCall(call);
    for (const patient of callPatients) {
      if (!patients.has(patient.patientGuid)) {
        patients.set(patient.patientGuid, patient);
      }
    }
  }

  return Array.from(patients.values());
}

/**
 * Build a map of patient names to GUIDs for quick lookup
 * Includes variations: full name, first name, last name, "FirstName LastName"
 */
export function buildPatientNameMap(patients: ExtractedPatient[]): Map<string, string> {
  const nameMap = new Map<string, string>();

  for (const patient of patients) {
    // Full name
    if (patient.fullName) {
      nameMap.set(patient.fullName.toLowerCase(), patient.patientGuid);
    }

    // First + Last name combination
    if (patient.firstName && patient.lastName) {
      const combined = `${patient.firstName} ${patient.lastName}`;
      nameMap.set(combined.toLowerCase(), patient.patientGuid);
    }

    // Last, First format
    if (patient.firstName && patient.lastName) {
      const lastFirst = `${patient.lastName}, ${patient.firstName}`;
      nameMap.set(lastFirst.toLowerCase(), patient.patientGuid);
    }
  }

  return nameMap;
}

/**
 * Find patient GUID from text that might contain a patient name
 */
export function findPatientGuidInText(text: string, nameMap: Map<string, string>): { name: string; guid: string } | null {
  const lowerText = text.toLowerCase();

  // Sort by name length (longest first) to match most specific names first
  const sortedNames = Array.from(nameMap.keys()).sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    if (lowerText.includes(name)) {
      return {
        name: name,
        guid: nameMap.get(name)!,
      };
    }
  }

  return null;
}

/**
 * Create the patient detail URL
 */
export function getPatientDetailUrl(patientGuid: string): string {
  return `/patients/${patientGuid}`;
}
