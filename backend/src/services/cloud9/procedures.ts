/**
 * Cloud 9 API Procedure Definitions
 *
 * This file contains all available Cloud 9 API procedures and their metadata.
 * Based on the Cloud 9 Partner API documentation.
 */

export enum Cloud9Procedure {
  // Reference Data
  GET_LOCATIONS = 'GetLocations',
  GET_LOCATION_INFO = 'GetLocationInfo',
  GET_DOCTORS = 'GetDoctors',
  GET_PROVIDERS = 'GetProviders',
  GET_CHAIR_SCHEDULES = 'GetChairSchedules',
  GET_APPOINTMENT_TYPES = 'GetAppointmentTypes',

  // Patient Management
  GET_RECORDS = 'GetRecords',
  GET_ALL_RECORDS = 'GetAllRecords',
  GET_PORTAL_PATIENT_LOOKUP = 'GetPortalPatientLookup',
  GET_PATIENT_LIST = 'GetPatientList',
  GET_PATIENT_INFORMATION = 'GetPatientInformation',
  GET_EMAIL = 'GetEmail',
  SET_PATIENT = 'SetPatient',
  SET_PATIENT_DEMOGRAPHIC_INFO = 'SetPatientDemographicInfo',

  // Appointment Management
  GET_AVAILABLE_APPTS = 'GetOnlineReservations',
  GET_EXISTING_APPTS = 'GetExistingAppts',
  GET_APPOINTMENT_LIST_BY_PATIENT = 'GetAppointmentListByPatient',
  GET_APPOINTMENTS_BY_DATE = 'GetAppointmentsByDate',
  SET_APPOINTMENT = 'SetAppointment',
  SET_APPOINTMENT_STATUS_CONFIRMED = 'SetAppointmentStatusConfirmed',
  SET_APPOINTMENT_STATUS_CANCELED = 'SetAppointmentStatusCanceled',
}

export interface ProcedureMetadata {
  name: string;
  category: 'reference' | 'patient' | 'appointment';
  description: string;
  requiresParameters: boolean;
  cacheable: boolean;
  cacheTTL?: number; // in seconds
}

export const PROCEDURE_METADATA: Record<Cloud9Procedure, ProcedureMetadata> = {
  // Reference Data - Cacheable
  [Cloud9Procedure.GET_LOCATIONS]: {
    name: 'GetLocations',
    category: 'reference',
    description: 'Retrieve practice locations',
    requiresParameters: false,
    cacheable: true,
    cacheTTL: 3600, // 1 hour
  },
  [Cloud9Procedure.GET_LOCATION_INFO]: {
    name: 'GetLocationInfo',
    category: 'reference',
    description: 'Get detailed location information',
    requiresParameters: true,
    cacheable: true,
    cacheTTL: 3600,
  },
  [Cloud9Procedure.GET_DOCTORS]: {
    name: 'GetDoctors',
    category: 'reference',
    description: 'Retrieve doctor information',
    requiresParameters: false,
    cacheable: true,
    cacheTTL: 3600,
  },
  [Cloud9Procedure.GET_PROVIDERS]: {
    name: 'GetProviders',
    category: 'reference',
    description: 'Retrieve provider information',
    requiresParameters: false,
    cacheable: true,
    cacheTTL: 3600,
  },
  [Cloud9Procedure.GET_CHAIR_SCHEDULES]: {
    name: 'GetChairSchedules',
    category: 'reference',
    description: 'Retrieve chair schedules for locations',
    requiresParameters: false,
    cacheable: true,
    cacheTTL: 3600,
  },
  [Cloud9Procedure.GET_APPOINTMENT_TYPES]: {
    name: 'GetAppointmentTypes',
    category: 'reference',
    description: 'Retrieve available appointment types',
    requiresParameters: false,
    cacheable: true,
    cacheTTL: 3600,
  },

  // Patient Management - Not cacheable (dynamic data)
  [Cloud9Procedure.GET_RECORDS]: {
    name: 'GetRecords',
    category: 'patient',
    description: 'Retrieve filtered patient records',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.GET_ALL_RECORDS]: {
    name: 'GetAllRecords',
    category: 'patient',
    description: 'Retrieve all patient records',
    requiresParameters: false,
    cacheable: false,
  },
  [Cloud9Procedure.GET_PORTAL_PATIENT_LOOKUP]: {
    name: 'GetPortalPatientLookup',
    category: 'patient',
    description: 'Search for patients by name',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.GET_PATIENT_LIST]: {
    name: 'GetPatientList',
    category: 'patient',
    description: 'Get patient list by location',
    requiresParameters: false,
    cacheable: false,
  },
  [Cloud9Procedure.GET_PATIENT_INFORMATION]: {
    name: 'GetPatientInformation',
    category: 'patient',
    description: 'Get detailed patient information',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.GET_EMAIL]: {
    name: 'GetEmail',
    category: 'patient',
    description: 'Retrieve patient email information',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.SET_PATIENT]: {
    name: 'SetPatient',
    category: 'patient',
    description: 'Create new patient record',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.SET_PATIENT_DEMOGRAPHIC_INFO]: {
    name: 'SetPatientDemographicInfo',
    category: 'patient',
    description: 'Update patient demographic information',
    requiresParameters: true,
    cacheable: false,
  },

  // Appointment Management - Not cacheable
  [Cloud9Procedure.GET_AVAILABLE_APPTS]: {
    name: 'GetAvailableAppts',
    category: 'appointment',
    description: 'Check appointment availability',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.GET_EXISTING_APPTS]: {
    name: 'GetExistingAppts',
    category: 'appointment',
    description: 'Retrieve scheduled appointments',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.GET_APPOINTMENT_LIST_BY_PATIENT]: {
    name: 'GetAppointmentListByPatient',
    category: 'appointment',
    description: 'Retrieve all appointments for a patient',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.GET_APPOINTMENTS_BY_DATE]: {
    name: 'GetAppointmentsByDate',
    category: 'appointment',
    description: 'Retrieve appointments for a specific date and schedule view (includes Chair)',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.SET_APPOINTMENT]: {
    name: 'SetAppointment',
    category: 'appointment',
    description: 'Schedule a new appointment',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.SET_APPOINTMENT_STATUS_CONFIRMED]: {
    name: 'SetAppointmentStatusConfirmed',
    category: 'appointment',
    description: 'Confirm an existing appointment',
    requiresParameters: true,
    cacheable: false,
  },
  [Cloud9Procedure.SET_APPOINTMENT_STATUS_CANCELED]: {
    name: 'SetAppointmentStatusCanceled',
    category: 'appointment',
    description: 'Cancel an existing appointment',
    requiresParameters: true,
    cacheable: false,
  },
};

/**
 * Check if a procedure is cacheable
 */
export function isProcedureCacheable(procedure: Cloud9Procedure): boolean {
  return PROCEDURE_METADATA[procedure]?.cacheable || false;
}

/**
 * Get cache TTL for a procedure
 */
export function getProcedureCacheTTL(procedure: Cloud9Procedure): number {
  return PROCEDURE_METADATA[procedure]?.cacheTTL || 0;
}

/**
 * Get procedure category
 */
export function getProcedureCategory(
  procedure: Cloud9Procedure
): 'reference' | 'patient' | 'appointment' | undefined {
  return PROCEDURE_METADATA[procedure]?.category;
}
