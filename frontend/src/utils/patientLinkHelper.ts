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
    'Child1_FirstName', 'Child2_FirstName', 'Child3_FirstName',
    'child1_firstname', 'child2_firstname', 'child3_firstname',
    'caller_first_name', 'Caller_First_Name',
  ];
  const lastNameFields = [
    'lastName', 'LastName', 'last_name', 'persLastName',
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
 * Extract all patients from an API call's request and response payloads
 */
export function extractPatientsFromApiCall(apiCall: ApiCall): ExtractedPatient[] {
  const patients = new Map<string, ExtractedPatient>();

  if (apiCall.requestPayload) {
    searchForPatients(apiCall.requestPayload, patients);
  }

  if (apiCall.responsePayload) {
    searchForPatients(apiCall.responsePayload, patients);
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
