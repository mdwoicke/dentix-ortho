/**
 * Shared Patient types
 * Used by both frontend and backend
 */

export interface Patient {
  patient_guid: string;
  patient_id?: string;
  first_name: string;
  last_name: string;
  birthdate?: string;
  email?: string;
  phone?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  provider_guid?: string;
  location_guid?: string;
  environment?: string;
}

export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  providerGuid: string;
  locationGuid: string;
  birthdate: string;
  phoneNumber: string;
  email: string;
  note?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
}

export interface UpdatePatientRequest {
  guid: string;
  firstName?: string;
  lastName?: string;
  birthdate?: string;
  email?: string;
  phoneNumber?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
}

export interface PatientSearchResponse {
  status: string;
  data: Patient[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
  };
  environment: string;
}
