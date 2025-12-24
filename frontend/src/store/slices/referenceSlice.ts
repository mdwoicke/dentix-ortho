/**
 * Reference Data Slice
 * Manages locations, appointment types, and providers
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type { Location, AppointmentType, Provider } from '../../types';
import * as referenceApi from '../../services/api/referenceApi';
import { handleError, logError } from '../../services/utils/errorHandler';

interface ReferenceState {
  locations: Location[];
  appointmentTypes: AppointmentType[];
  providers: Provider[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

const initialState: ReferenceState = {
  locations: [],
  appointmentTypes: [],
  providers: [],
  loading: false,
  error: null,
  lastFetched: null,
};

// Async Thunks

/**
 * Fetch all locations
 */
export const fetchLocations = createAsyncThunk(
  'reference/fetchLocations',
  async (_, { rejectWithValue }) => {
    try {
      const locations = await referenceApi.getLocations();
      return locations;
    } catch (error) {
      logError(error, 'fetchLocations');
      const formattedError = handleError(error, 'Failed to fetch locations');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch all appointment types
 */
export const fetchAppointmentTypes = createAsyncThunk(
  'reference/fetchAppointmentTypes',
  async (_, { rejectWithValue }) => {
    try {
      const appointmentTypes = await referenceApi.getAppointmentTypes();
      return appointmentTypes;
    } catch (error) {
      logError(error, 'fetchAppointmentTypes');
      const formattedError = handleError(error, 'Failed to fetch appointment types');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch all providers
 */
export const fetchProviders = createAsyncThunk(
  'reference/fetchProviders',
  async (locationGuid: string | undefined, { rejectWithValue }) => {
    try {
      const providers = await referenceApi.getProviders(locationGuid);
      return providers;
    } catch (error) {
      logError(error, 'fetchProviders');
      const formattedError = handleError(error, 'Failed to fetch providers');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch all reference data (locations, appointment types, providers)
 */
export const fetchAllReferenceData = createAsyncThunk(
  'reference/fetchAllReferenceData',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      await Promise.all([
        dispatch(fetchLocations()),
        dispatch(fetchAppointmentTypes()),
        dispatch(fetchProviders(undefined)),
      ]);
      return true;
    } catch (error) {
      logError(error, 'fetchAllReferenceData');
      const formattedError = handleError(error, 'Failed to fetch reference data');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Refresh all cached reference data
 */
export const refreshAllCaches = createAsyncThunk(
  'reference/refreshAllCaches',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      await referenceApi.refreshAllCaches();
      // Re-fetch all data after refresh
      await dispatch(fetchAllReferenceData());
      return true;
    } catch (error) {
      logError(error, 'refreshAllCaches');
      const formattedError = handleError(error, 'Failed to refresh caches');
      return rejectWithValue(formattedError.message);
    }
  }
);

// Slice

export const referenceSlice = createSlice({
  name: 'reference',
  initialState,
  reducers: {
    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Clear all reference data
     */
    clearReferenceData: (state) => {
      state.locations = [];
      state.appointmentTypes = [];
      state.providers = [];
      state.error = null;
      state.lastFetched = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch Locations
    builder
      .addCase(fetchLocations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLocations.fulfilled, (state, action) => {
        state.loading = false;
        state.locations = action.payload;
        state.lastFetched = Date.now();
      })
      .addCase(fetchLocations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Appointment Types
    builder
      .addCase(fetchAppointmentTypes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAppointmentTypes.fulfilled, (state, action) => {
        state.loading = false;
        state.appointmentTypes = action.payload;
        state.lastFetched = Date.now();
      })
      .addCase(fetchAppointmentTypes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Providers
    builder
      .addCase(fetchProviders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProviders.fulfilled, (state, action) => {
        state.loading = false;
        state.providers = action.payload;
        state.lastFetched = Date.now();
      })
      .addCase(fetchProviders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch All Reference Data
    builder
      .addCase(fetchAllReferenceData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAllReferenceData.fulfilled, (state) => {
        state.loading = false;
        state.lastFetched = Date.now();
      })
      .addCase(fetchAllReferenceData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Refresh All Caches
    builder
      .addCase(refreshAllCaches.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(refreshAllCaches.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(refreshAllCaches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

// Export actions
export const { clearError, clearReferenceData } = referenceSlice.actions;

// Selectors
export const selectLocations = (state: RootState) => state.reference.locations;
export const selectLocationById = (locationGuid: string) => (state: RootState) =>
  state.reference.locations.find((loc) => loc.location_guid === locationGuid);

export const selectAppointmentTypes = (state: RootState) => state.reference.appointmentTypes;
export const selectAppointmentTypeById = (appointmentTypeGuid: string) => (state: RootState) =>
  state.reference.appointmentTypes.find((type) => type.appointment_type_guid === appointmentTypeGuid);

export const selectProviders = (state: RootState) => state.reference.providers;
export const selectProviderById = (providerGuid: string) => (state: RootState) =>
  state.reference.providers.find((prov) => prov.provider_guid === providerGuid);
export const selectProvidersByLocation = (locationGuid: string) => (state: RootState) =>
  state.reference.providers.filter((prov) => prov.location_guid === locationGuid);

export const selectReferenceLoading = (state: RootState) => state.reference.loading;
export const selectReferenceError = (state: RootState) => state.reference.error;
export const selectReferenceLastFetched = (state: RootState) => state.reference.lastFetched;

// Export reducer
export default referenceSlice.reducer;
