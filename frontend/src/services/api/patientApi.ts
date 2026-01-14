/**
 * Patient API Service
 * API calls for patient search, retrieval, creation, and updates
 */

import { get, post, put } from './client';
import type {
  Patient,
  CreatePatientRequest,
  UpdatePatientRequest,
  PatientSearchParams,
  PatientSearchResponse,
} from '../../types';

/**
 * Search for patients
 */
export async function searchPatients(
  params: PatientSearchParams
): Promise<PatientSearchResponse> {
  let query = '';

  // If a direct query string is provided, use it
  if (params.query) {
    query = params.query.trim();
  } else {
    // Otherwise, build search query from individual fields in "LastName, FirstName" format for Cloud 9 API
    const queryParts: string[] = [];

    // Cloud 9 expects "LastName, FirstName" format
    if (params.lastName && params.firstName) {
      queryParts.push(`${params.lastName}, ${params.firstName}`);
    } else if (params.lastName) {
      queryParts.push(params.lastName);
    } else if (params.firstName) {
      queryParts.push(params.firstName);
    }

    if (params.email) queryParts.push(params.email);
    if (params.phoneNumber) queryParts.push(params.phoneNumber);
    if (params.patientNumber) queryParts.push(params.patientNumber);
    if (params.birthdate) queryParts.push(params.birthdate);

    query = queryParts.join(' ').trim();
  }

  if (!query) {
    throw new Error('At least one search parameter is required');
  }

  const queryParams = new URLSearchParams();
  queryParams.append('query', query);

  if (params.pageIndex) queryParams.append('pageIndex', String(params.pageIndex));
  if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));

  const url = `/patients/search?${queryParams.toString()}`;

  return await get<PatientSearchResponse>(url);
}

/**
 * Get a specific patient by GUID
 */
export async function getPatient(patientGuid: string): Promise<Patient> {
  const response = await get<{ data: Patient }>(`/patients/${patientGuid}`);
  return response.data;
}

/**
 * Create a new patient
 */
export async function createPatient(
  patientData: CreatePatientRequest
): Promise<Patient> {
  const response = await post<{ data: Patient }>('/patients', patientData);
  return response.data;
}

/**
 * Update an existing patient
 */
export async function updatePatient(
  patientGuid: string,
  patientData: UpdatePatientRequest
): Promise<Patient> {
  const response = await put<{ data: Patient }>(
    `/patients/${patientGuid}`,
    patientData
  );
  return response.data;
}

