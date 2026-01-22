/**
 * Appointment API Service
 * API calls for appointment retrieval, creation, confirmation, and cancellation
 */

import { get, post, put } from './client';
import type {
  Appointment,
  GetAppointmentsParams,
  CreateAppointmentRequest,
  ConfirmAppointmentRequest,
  CancelAppointmentRequest,
  GetAvailableApptsParams,
  AvailableApptsResponse,
} from '../../types';

/**
 * Get appointments for a patient
 */
export async function getPatientAppointments(
  patientGuid: string,
  params?: GetAppointmentsParams
): Promise<Appointment[]> {
  const queryParams = new URLSearchParams();

  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);
  if (params?.status) queryParams.append('status', params.status);

  const queryString = queryParams.toString();
  const url = `/appointments/patient/${patientGuid}${queryString ? `?${queryString}` : ''}`;

  const response = await get<{ data: Appointment[] }>(url);
  return response.data || [];
}

/**
 * Get all appointments by date range (with optional filters)
 */
export async function getAppointments(
  params?: GetAppointmentsParams
): Promise<Appointment[]> {
  const queryParams = new URLSearchParams();

  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.locationGuid) queryParams.append('locationGuid', params.locationGuid);
  if (params?.providerGuid) queryParams.append('providerGuid', params.providerGuid);

  const queryString = queryParams.toString();
  const url = `/appointments/date-range${queryString ? `?${queryString}` : ''}`;

  const response = await get<{ data: Appointment[] }>(url);
  return response.data || [];
}

/**
 * Create a new appointment
 */
export async function createAppointment(
  appointmentData: CreateAppointmentRequest
): Promise<Appointment> {
  const response = await post<{ data: Appointment }>('/appointments', appointmentData);
  return response.data;
}

/**
 * Confirm an existing appointment
 */
export async function confirmAppointment(
  confirmData: ConfirmAppointmentRequest
): Promise<Appointment> {
  const response = await put<{ data: Appointment }>(
    `/appointments/${confirmData.appointmentGuid}/confirm`
  );
  return response.data;
}

/**
 * Cancel appointment response with status info
 */
export interface CancelAppointmentResponse {
  appointment: Appointment;
  message: string;
  alreadyCancelled: boolean;
}

/**
 * Cancel an existing appointment
 */
export async function cancelAppointment(
  cancelData: CancelAppointmentRequest
): Promise<CancelAppointmentResponse> {
  const response = await put<{ data: Appointment & { alreadyCancelled?: boolean }; message: string }>(
    `/appointments/${cancelData.appointmentGuid}/cancel`
  );
  return {
    appointment: response.data,
    message: response.message,
    alreadyCancelled: response.data?.alreadyCancelled ?? false,
  };
}

/**
 * Get available appointment slots
 */
export async function getAvailableSlots(
  params: GetAvailableApptsParams
): Promise<AvailableApptsResponse> {
  const queryParams = new URLSearchParams({
    locationGuid: params.locationGuid,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  // Add optional parameters only if provided
  if (params.providerGuid) {
    queryParams.append('providerGuid', params.providerGuid);
  }
  if (params.appointmentTypeGuid) {
    queryParams.append('appointmentTypeGuid', params.appointmentTypeGuid);
  }
  if (params.durationMinutes) {
    queryParams.append('durationMinutes', params.durationMinutes.toString());
  }

  const response = await get<{ data: any[]; count: number }>(
    `/appointments/available?${queryParams.toString()}`
  );

  return {
    slots: response.data || [],
    count: response.count || 0,
  };
}
