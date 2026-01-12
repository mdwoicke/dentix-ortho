/**
 * Cloud 9 API TypeScript type definitions
 * Based on XML response structures from the Cloud 9 Partner API
 */

// Location types
export interface Cloud9Location {
  LocationGUID: string;
  LocationName: string;
  LocationCode: string;
  TimeZone?: string;
  AddressStreet?: string;
  AddressCity?: string;
  AddressState?: string;
  AddressPostalCode?: string;
  PhoneNumber?: string;
  // Alternative field names returned by some API endpoints
  LocationCity?: string;
  LocationState?: string;
  LocationPostalCode?: string;
}

// Provider/Chair Schedule types
export interface Cloud9Provider {
  locGUID: string;
  locName: string;
  schdvwGUID: string;
  schdvwDescription: string;
  schdcolGUID: string;
  schdcolDescription: string;
}

// Appointment Type types
export interface Cloud9AppointmentType {
  AppointmentTypeGUID: string;
  AppointmentTypeCode: string;
  AppointmentTypeDescription: string;
  AppointmentTypeMinutes: number;
  AppointmentTypeAllowOnlineScheduling: boolean | string;
}

// Patient types
export interface Cloud9Patient {
  PatientGUID: string;
  PatientID?: string;
  PatientFirstName: string;
  PatientLastName: string;
  PatientBirthDate?: string;
  PatientEmail?: string;
  PatientPhone?: string;
  AddressStreet?: string;
  AddressCity?: string;
  AddressState?: string;
  AddressPostalCode?: string;
  ProviderGUID?: string;
  LocationGUID?: string;
}

// Appointment types
export interface Cloud9Appointment {
  AppointmentGUID: string;
  PatientGUID: string;
  PatientTitle?: string;
  PatientFirstName?: string;
  PatientMiddleName?: string;
  PatientLastName?: string;
  PatientSuffix?: string;
  PatientGreeting?: string;
  PatientGender?: string;
  PatientBirthDate?: string;
  AppointmentDateTime: string;
  AppointmentTypeGUID?: string;
  AppointmentTypeCode?: string;
  AppointmentTypeDescription?: string;
  AppointmentStatus?: string;
  AppointmentStatusDescription?: string;
  AppointmentNote?: string;
  AppointmentMinutes?: number;
  AppointmentConfirmation?: string;
  OrthodontistGUID?: string;
  OrthodontistCode?: string;
  OrthodontistName?: string;
  LocationGUID?: string;
  LocationCode?: string;
  LocationName?: string;
  DurationMinutes?: number;
  Chair?: string;
}

// Available Appointment Slot types (GetOnlineReservations response)
export interface Cloud9AvailableSlot {
  StartTime: string;
  EndTime: string;
  ScheduleColumnDescription: string;
  ScheduleTemplateName: string;
  AppointmentClassDescription: string;
  AppointmentClassGUID: string;
  AppointmentTypeDescription?: string;
  AppointmentTypeGUID?: string;
  ScheduleViewDescription: string;
  ScheduleColumnGUID: string;
  ScheduleViewGUID: string;
  Minutes: number;
  LocationGUID: string;
}

// Request parameter types
export interface GetAvailableApptsRequest {
  locationGuid: string;
  providerGuid?: string;
  appointmentTypeGuid?: string;
  startDate: string; // Format: MM/DD/YYYY
  endDate: string; // Format: MM/DD/YYYY
  durationMinutes?: number;
}

// Generic API Response wrapper
export interface Cloud9ApiResponse<T = any> {
  status: 'Success' | 'Error';
  records: T[];
  errorMessage?: string;
}
