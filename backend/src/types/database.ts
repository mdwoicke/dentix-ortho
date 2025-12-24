/**
 * Database TypeScript type definitions
 * Matches the SQLite schema defined in backend/src/database/schema.sql
 */

export interface DbLocation {
  id?: number;
  location_guid: string;
  location_name: string;
  location_code: string;
  time_zone?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  phone_number?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbAppointmentType {
  id?: number;
  appointment_type_guid: string;
  appointment_type_code: string;
  appointment_type_description: string;
  appointment_type_minutes: number;
  allow_online_scheduling: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DbProvider {
  id?: number;
  provider_guid: string;
  location_guid: string;
  schedule_view_guid: string;
  schedule_view_description: string;
  schedule_column_guid: string;
  schedule_column_description: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbPatient {
  id?: number;
  patient_guid: string;
  patient_id?: string;
  first_name: string;
  last_name: string;
  birthdate?: string;
  email?: string;
  phone_number?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  provider_guid?: string;
  location_guid?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbAppointment {
  id?: number;
  appointment_guid: string;
  patient_guid: string;
  appointment_date_time: string;
  appointment_type_guid: string;
  appointment_status: string;
  provider_guid?: string;
  location_guid?: string;
  duration_minutes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DbCacheMetadata {
  id?: number;
  cache_key: string;
  last_updated: string;
  ttl_seconds: number;
  environment: 'sandbox' | 'production';
}
