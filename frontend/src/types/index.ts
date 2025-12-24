/**
 * Central type exports
 * Re-exports shared types and defines frontend-specific types
 */

// Re-export shared types from backend
export type {
  Patient,
  CreatePatientRequest,
  UpdatePatientRequest,
  PatientSearchResponse,
} from '../../../shared/types/Patient';

export type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Provider,
  CreateAppointmentRequest,
  AppointmentListResponse,
  AvailableSlot,
  GetAvailableApptsParams,
  AvailableApptsResponse,
} from '../../../shared/types/Appointment';

export type {
  Location,
  LocationListResponse,
} from '../../../shared/types/Location';

// Export frontend-specific types
export * from './api.types';
export * from './ui.types';
export * from './form.types';
