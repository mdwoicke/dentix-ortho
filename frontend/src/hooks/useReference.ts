/**
 * useReference Hook
 * Access reference data with auto-fetching
 */

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchLocations,
  fetchAppointmentTypes,
  fetchProviders,
  selectLocations,
  selectAppointmentTypes,
  selectProviders,
  selectReferenceLoading,
  selectReferenceError,
} from '../store/slices/referenceSlice';

export interface UseReferenceOptions {
  autoFetch?: boolean;
  fetchProviders?: boolean;
  locationGuid?: string;
}

export function useReference(options: UseReferenceOptions = {}) {
  const { autoFetch = true, fetchProviders: shouldFetchProviders = true, locationGuid } = options;

  const dispatch = useAppDispatch();
  const locations = useAppSelector(selectLocations);
  const appointmentTypes = useAppSelector(selectAppointmentTypes);
  const providers = useAppSelector(selectProviders);
  const loading = useAppSelector(selectReferenceLoading);
  const error = useAppSelector(selectReferenceError);

  useEffect(() => {
    if (autoFetch) {
      // Fetch locations if not already loaded
      if (locations.length === 0) {
        dispatch(fetchLocations());
      }

      // Fetch appointment types if not already loaded
      if (appointmentTypes.length === 0) {
        dispatch(fetchAppointmentTypes());
      }

      // Fetch providers if enabled and not already loaded
      if (shouldFetchProviders && providers.length === 0) {
        dispatch(fetchProviders(locationGuid));
      }
    }
  }, [autoFetch, shouldFetchProviders, locationGuid, dispatch, locations.length, appointmentTypes.length, providers.length]);

  return {
    locations,
    appointmentTypes,
    providers,
    loading,
    error,
    refetch: () => {
      dispatch(fetchLocations());
      dispatch(fetchAppointmentTypes());
      if (shouldFetchProviders) {
        dispatch(fetchProviders(locationGuid));
      }
    },
  };
}
