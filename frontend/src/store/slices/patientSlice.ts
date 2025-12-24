/**
 * Patient Slice
 * Manages patient data, search results, and patient operations
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  Patient,
  CreatePatientRequest,
  UpdatePatientRequest,
  PatientSearchParams,
  PatientSearchResponse,
} from '../../types';
import * as patientApi from '../../services/api/patientApi';
import { handleError, logError } from '../../services/utils/errorHandler';

interface PatientState {
  patients: Patient[];
  selectedPatient: Patient | null;
  searchResults: PatientSearchResponse | null;
  loading: boolean;
  error: string | null;
  lastSearchParams: PatientSearchParams | null;
  patientDetailsCache: Record<string, Patient>;    // Cache fetched details by patient_guid
  patientDetailsLoading: Record<string, boolean>;  // Loading state per patient
}

const initialState: PatientState = {
  patients: [],
  selectedPatient: null,
  searchResults: null,
  loading: false,
  error: null,
  lastSearchParams: null,
  patientDetailsCache: {},
  patientDetailsLoading: {},
};

// Async Thunks

/**
 * Search for patients
 */
export const searchPatients = createAsyncThunk(
  'patients/search',
  async (params: PatientSearchParams, { rejectWithValue }) => {
    try {
      const results = await patientApi.searchPatients(params);
      return { results, params };
    } catch (error) {
      logError(error, 'searchPatients');
      const formattedError = handleError(error, 'Failed to search patients');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch a specific patient by GUID
 */
export const fetchPatient = createAsyncThunk(
  'patients/fetchPatient',
  async (patientGuid: string, { rejectWithValue }) => {
    try {
      const patient = await patientApi.getPatient(patientGuid);
      return patient;
    } catch (error) {
      logError(error, 'fetchPatient');
      const formattedError = handleError(error, 'Failed to fetch patient');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch patient details with caching (for card expansion)
 */
export const fetchPatientDetails = createAsyncThunk(
  'patients/fetchDetails',
  async (patientGuid: string, { getState, rejectWithValue }) => {
    const state = getState() as RootState;

    // Check cache first - return cached if exists
    if (state.patients.patientDetailsCache[patientGuid]) {
      return state.patients.patientDetailsCache[patientGuid];
    }

    try {
      const patient = await patientApi.getPatient(patientGuid);
      return patient;
    } catch (error) {
      logError(error, 'fetchPatientDetails');
      const formattedError = handleError(error, 'Failed to fetch patient details');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Create a new patient
 */
export const createPatient = createAsyncThunk(
  'patients/create',
  async (patientData: CreatePatientRequest, { rejectWithValue }) => {
    try {
      const patient = await patientApi.createPatient(patientData);
      return patient;
    } catch (error) {
      logError(error, 'createPatient');
      const formattedError = handleError(error, 'Failed to create patient');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Update an existing patient
 */
export const updatePatient = createAsyncThunk(
  'patients/update',
  async (
    { patientGuid, patientData }: { patientGuid: string; patientData: UpdatePatientRequest },
    { rejectWithValue }
  ) => {
    try {
      const patient = await patientApi.updatePatient(patientGuid, patientData);
      return patient;
    } catch (error) {
      logError(error, 'updatePatient');
      const formattedError = handleError(error, 'Failed to update patient');
      return rejectWithValue(formattedError.message);
    }
  }
);

// Slice

export const patientSlice = createSlice({
  name: 'patients',
  initialState,
  reducers: {
    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Clear search results
     */
    clearSearchResults: (state) => {
      state.searchResults = null;
      state.lastSearchParams = null;
    },

    /**
     * Clear all patient data
     */
    clearPatientData: (state) => {
      state.patients = [];
      state.selectedPatient = null;
      state.searchResults = null;
      state.error = null;
      state.lastSearchParams = null;
    },

    /**
     * Set selected patient
     */
    setSelectedPatient: (state, action: PayloadAction<Patient | null>) => {
      state.selectedPatient = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Search Patients
    builder
      .addCase(searchPatients.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(searchPatients.fulfilled, (state, action) => {
        state.loading = false;
        state.searchResults = action.payload.results;
        state.lastSearchParams = action.payload.params;
      })
      .addCase(searchPatients.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Patient
    builder
      .addCase(fetchPatient.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPatient.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedPatient = action.payload;

        // Update patient in patients array if it exists
        const index = state.patients.findIndex(
          (p) => p.patient_guid === action.payload.patient_guid
        );
        if (index !== -1) {
          state.patients[index] = action.payload;
        } else {
          state.patients.push(action.payload);
        }
      })
      .addCase(fetchPatient.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create Patient
    builder
      .addCase(createPatient.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createPatient.fulfilled, (state, action) => {
        state.loading = false;
        state.patients.push(action.payload);
        state.selectedPatient = action.payload;
      })
      .addCase(createPatient.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Update Patient
    builder
      .addCase(updatePatient.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updatePatient.fulfilled, (state, action) => {
        state.loading = false;

        // Update patient in patients array
        const index = state.patients.findIndex(
          (p) => p.patient_guid === action.payload.patient_guid
        );
        if (index !== -1) {
          state.patients[index] = action.payload;
        }

        // Update selected patient if it's the same one
        if (state.selectedPatient?.patient_guid === action.payload.patient_guid) {
          state.selectedPatient = action.payload;
        }
      })
      .addCase(updatePatient.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Patient Details (for card expansion)
    builder
      .addCase(fetchPatientDetails.pending, (state, action) => {
        state.patientDetailsLoading[action.meta.arg] = true;
      })
      .addCase(fetchPatientDetails.fulfilled, (state, action) => {
        state.patientDetailsLoading[action.payload.patient_guid] = false;
        state.patientDetailsCache[action.payload.patient_guid] = action.payload;
      })
      .addCase(fetchPatientDetails.rejected, (state, action) => {
        state.patientDetailsLoading[action.meta.arg] = false;
      });
  },
});

// Export actions
export const {
  clearError,
  clearSearchResults,
  clearPatientData,
  setSelectedPatient,
} = patientSlice.actions;

// Selectors
export const selectAllPatients = (state: RootState) => state.patients.patients;
export const selectSelectedPatient = (state: RootState) => state.patients.selectedPatient;
export const selectSearchResults = (state: RootState) => state.patients.searchResults;
export const selectPatientLoading = (state: RootState) => state.patients.loading;
export const selectPatientError = (state: RootState) => state.patients.error;
export const selectLastSearchParams = (state: RootState) => state.patients.lastSearchParams;

export const selectPatientById = (patientGuid: string) => (state: RootState) =>
  state.patients.patients.find((p) => p.patient_guid === patientGuid);

export const selectHasSearchResults = (state: RootState) =>
  state.patients.searchResults !== null &&
  state.patients.searchResults.data &&
  state.patients.searchResults.data.length > 0;

export const selectPatientDetails = (patientGuid: string) => (state: RootState) =>
  state.patients.patientDetailsCache[patientGuid];

export const selectPatientDetailsLoading = (patientGuid: string) => (state: RootState) =>
  state.patients.patientDetailsLoading[patientGuid] || false;

// Export reducer
export default patientSlice.reducer;
