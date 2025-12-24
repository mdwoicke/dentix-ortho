/**
 * usePatients Hook
 * Patient operations and state management
 */

import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  searchPatients,
  fetchPatient,
  createPatient,
  updatePatient,
  selectAllPatients,
  selectSelectedPatient,
  selectSearchResults,
  selectPatientLoading,
  selectPatientError,
  clearSearchResults,
} from '../store/slices/patientSlice';
import type {
  PatientSearchParams,
  CreatePatientRequest,
  UpdatePatientRequest,
} from '../types';
import { useToast } from './useToast';

export function usePatients() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  const patients = useAppSelector(selectAllPatients);
  const selectedPatient = useAppSelector(selectSelectedPatient);
  const searchResults = useAppSelector(selectSearchResults);
  const loading = useAppSelector(selectPatientLoading);
  const error = useAppSelector(selectPatientError);

  const handleSearch = async (params: PatientSearchParams) => {
    try {
      await dispatch(searchPatients(params)).unwrap();
    } catch (err) {
      toast.showError(err as string);
    }
  };

  const handleFetchPatient = async (patientGuid: string) => {
    try {
      await dispatch(fetchPatient(patientGuid)).unwrap();
    } catch (err) {
      toast.showError(err as string);
    }
  };

  const handleCreatePatient = async (patientData: CreatePatientRequest) => {
    try {
      const patient = await dispatch(createPatient(patientData)).unwrap();
      toast.showSuccess('Patient created successfully');
      return patient;
    } catch (err) {
      toast.showError(err as string);
      throw err;
    }
  };

  const handleUpdatePatient = async (
    patientGuid: string,
    patientData: UpdatePatientRequest
  ) => {
    try {
      const patient = await dispatch(
        updatePatient({ patientGuid, patientData })
      ).unwrap();
      toast.showSuccess('Patient updated successfully');
      return patient;
    } catch (err) {
      toast.showError(err as string);
      throw err;
    }
  };

  const handleClearSearch = () => {
    dispatch(clearSearchResults());
  };

  return {
    patients,
    selectedPatient,
    searchResults,
    loading,
    error,
    search: handleSearch,
    fetchPatient: handleFetchPatient,
    createPatient: handleCreatePatient,
    updatePatient: handleUpdatePatient,
    clearSearch: handleClearSearch,
  };
}
