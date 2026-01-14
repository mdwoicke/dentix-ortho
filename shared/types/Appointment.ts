/**
 * Shared Appointment types
 * Used by both frontend and backend
 */

export interface Appointment {
  appointment_guid: string;
  patient_guid: string;
  patient_title?: string;
  patient_first_name?: string;
  patient_middle_name?: string;
  patient_last_name?: string;
  patient_suffix?: string;
  patient_greeting?: string;
  patient_gender?: string;
  patient_birth_date?: string;
  appointment_date_time: string;
  appointment_type_guid?: string;
  appointment_type_description?: string;
  status?: string;
  status_description?: string;
  appointment_note?: string;
  appointment_minutes?: number;
  appointment_confirmation?: string;
  orthodontist_guid?: string;
  orthodontist_code?: string;
  orthodontist_name?: string;
  location_guid?: string;
  location_code?: string;
  location_name?: string;
  location_city?: string;
  location_state?: string;
  location_address?: string;
  location_phone?: string;
  appointment_type_code?: string;
  chair?: string;
  schedule_view_guid?: string;
  schedule_view_description?: string;
  schedule_column_guid?: string;
  schedule_column_description?: string;
  environment?: string;
  scheduled_at?: string; // ISO timestamp of when the appointment was booked/created

  // Legacy fields for backward compatibility
  guid?: string;
  patientGuid?: string;
  patientName?: string;
  dateTime?: string;
  appointmentTypeGuid?: string;
  providerGuid?: string;
  providerName?: string;
  locationGuid?: string;
  locationName?: string;
  durationMinutes?: number;
  start_time?: string;
  duration?: number;
  appointment_type_name?: string;
  provider_name?: string;
  notes?: string;
}

export enum AppointmentStatus {
  SCHEDULED = 'Scheduled',
  CONFIRMED = 'Confirmed',
  CANCELED = 'Canceled',
  COMPLETED = 'Completed',
  NO_SHOW = 'No Show',
}

export interface AppointmentType {
  guid: string;
  code: string;
  description: string;
  durationMinutes: number;
  allowOnlineScheduling: boolean;
}

export interface Provider {
  guid: string;
  locationGuid: string;
  locationName: string;
  scheduleViewGuid: string;
  scheduleViewDescription: string;
  scheduleColumnGuid: string;
  scheduleColumnDescription: string;
}

export interface CreateAppointmentRequest {
  patientGuid: string;
  startTime: string; // ISO 8601 or MM/DD/YYYY HH:mm:ss AM/PM format
  scheduleViewGuid: string;
  scheduleColumnGuid: string;
  appointmentTypeGuid: string;
  durationMinutes: number;
}

export interface AppointmentListResponse {
  appointments: Appointment[];
  count: number;
}

// Available appointment slot types
export interface AvailableSlot {
  dateTime: string;
  scheduleViewGuid: string;
  scheduleColumnGuid: string;
  durationMinutes: number;
  locationGuid: string;
  providerGuid?: string;
  appointmentTypeGuid?: string;
}

export interface GetAvailableApptsParams {
  locationGuid: string;
  providerGuid?: string;
  appointmentTypeGuid?: string;
  startDate: string; // ISO format or MM/DD/YYYY
  endDate: string;
  durationMinutes?: number;
}

export interface AvailableApptsResponse {
  slots: AvailableSlot[];
  count: number;
}

export interface GetAppointmentsParams {
  startDate?: string;
  endDate?: string;
  status?: string;
  locationGuid?: string;
  providerGuid?: string;
}

export interface ConfirmAppointmentRequest {
  appointmentGuid: string;
}

export interface CancelAppointmentRequest {
  appointmentGuid: string;
}
