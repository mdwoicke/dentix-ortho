/**
 * useAppointments Hook
 * Appointment operations and state management
 */

import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchPatientAppointments,
  fetchAppointments,
  createAppointment,
  confirmAppointment,
  cancelAppointment,
  selectAllAppointments,
  selectSelectedAppointment,
  selectAppointmentLoading,
  selectAppointmentError,
} from '../store/slices/appointmentSlice';
import type {
  GetAppointmentsParams,
  CreateAppointmentRequest,
  ConfirmAppointmentRequest,
  CancelAppointmentRequest,
} from '../types';
import { useToast } from './useToast';

export function useAppointments() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  const appointments = useAppSelector(selectAllAppointments);
  const selectedAppointment = useAppSelector(selectSelectedAppointment);
  const loading = useAppSelector(selectAppointmentLoading);
  const error = useAppSelector(selectAppointmentError);

  const handleFetchPatientAppointments = async (
    patientGuid: string,
    params?: GetAppointmentsParams
  ) => {
    try {
      await dispatch(fetchPatientAppointments({ patientGuid, params })).unwrap();
    } catch (err: unknown) {
      // Skip showing error for cancelled requests (from condition callback)
      if (err && typeof err === 'object' && 'name' in err && (err as Error).name === 'ConditionError') {
        return; // Silently ignore - request was deduplicated
      }
      const message = typeof err === 'string' ? err : (err as Error)?.message || 'Failed to fetch appointments';
      toast.showError(message);
    }
  };

  const handleFetchAppointments = async (params?: GetAppointmentsParams) => {
    try {
      await dispatch(fetchAppointments(params)).unwrap();
    } catch (err) {
      toast.showError(err as string);
    }
  };

  const handleCreateAppointment = async (appointmentData: CreateAppointmentRequest) => {
    try {
      const appointment = await dispatch(createAppointment(appointmentData)).unwrap();
      toast.showSuccess('Appointment created successfully');
      return appointment;
    } catch (err) {
      toast.showError(err as string);
      throw err;
    }
  };

  const handleConfirmAppointment = async (confirmData: ConfirmAppointmentRequest) => {
    try {
      const appointment = await dispatch(confirmAppointment(confirmData)).unwrap();
      toast.showSuccess('Appointment confirmed successfully');
      return appointment;
    } catch (err) {
      toast.showError(err as string);
      throw err;
    }
  };

  const handleCancelAppointment = async (cancelData: CancelAppointmentRequest) => {
    try {
      const response = await dispatch(cancelAppointment(cancelData)).unwrap();
      // Show different message based on whether it was already cancelled
      if (response.alreadyCancelled) {
        toast.showInfo('Appointment was already cancelled - status updated');
      } else {
        toast.showSuccess('Appointment cancelled successfully');
      }
      return response;
    } catch (err) {
      toast.showError(err as string);
      throw err;
    }
  };

  return {
    appointments,
    selectedAppointment,
    loading,
    error,
    fetchPatientAppointments: handleFetchPatientAppointments,
    fetchAppointments: handleFetchAppointments,
    createAppointment: handleCreateAppointment,
    confirmAppointment: handleConfirmAppointment,
    cancelAppointment: handleCancelAppointment,
  };
}
