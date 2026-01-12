/**
 * Appointment Slice
 * Manages appointment data and appointment operations
 */

import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  Appointment,
  GetAppointmentsParams,
  CreateAppointmentRequest,
  ConfirmAppointmentRequest,
  CancelAppointmentRequest,
  AvailableSlot,
  GetAvailableApptsParams,
} from '../../types';
import * as appointmentApi from '../../services/api/appointmentApi';
import { handleError, logError } from '../../services/utils/errorHandler';

interface AppointmentState {
  appointments: Appointment[];
  selectedAppointment: Appointment | null;
  loading: boolean;
  error: string | null;
  lastFetchParams: GetAppointmentsParams | null;
  availableSlots: AvailableSlot[];
  slotsLoading: boolean;
  slotsError: string | null;
  slotFilters: GetAvailableApptsParams | null;
  fetchingForPatientGuid: string | null; // Track which patient appointments are being fetched (for deduplication)
}

const initialState: AppointmentState = {
  appointments: [],
  selectedAppointment: null,
  loading: false,
  error: null,
  lastFetchParams: null,
  availableSlots: [],
  slotsLoading: false,
  slotsError: null,
  slotFilters: null,
  fetchingForPatientGuid: null,
};

// Async Thunks

/**
 * Fetch appointments for a specific patient
 * Uses condition callback to prevent duplicate requests (React Strict Mode double-invoke protection)
 */
export const fetchPatientAppointments = createAsyncThunk(
  'appointments/fetchPatientAppointments',
  async (
    { patientGuid, params }: { patientGuid: string; params?: GetAppointmentsParams },
    { rejectWithValue }
  ) => {
    try {
      const appointments = await appointmentApi.getPatientAppointments(patientGuid, params);
      return { appointments, params, patientGuid };
    } catch (error) {
      logError(error, 'fetchPatientAppointments');
      const formattedError = handleError(error, 'Failed to fetch patient appointments');
      return rejectWithValue(formattedError.message);
    }
  },
  {
    // Prevent duplicate requests - skip if already fetching for this patient
    condition: ({ patientGuid }, { getState }) => {
      const state = getState() as RootState;
      // Skip if already fetching appointments for this patient
      if (state.appointments.fetchingForPatientGuid === patientGuid) {
        return false;
      }
      return true;
    },
  }
);

/**
 * Fetch all appointments (with optional filters)
 */
export const fetchAppointments = createAsyncThunk(
  'appointments/fetchAppointments',
  async (params: GetAppointmentsParams | undefined, { rejectWithValue }) => {
    try {
      const appointments = await appointmentApi.getAppointments(params);
      return { appointments, params };
    } catch (error) {
      logError(error, 'fetchAppointments');
      const formattedError = handleError(error, 'Failed to fetch appointments');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Create a new appointment
 */
export const createAppointment = createAsyncThunk(
  'appointments/create',
  async (appointmentData: CreateAppointmentRequest, { rejectWithValue }) => {
    try {
      const appointment = await appointmentApi.createAppointment(appointmentData);
      return appointment;
    } catch (error) {
      logError(error, 'createAppointment');
      const formattedError = handleError(error, 'Failed to create appointment');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Confirm an existing appointment
 */
export const confirmAppointment = createAsyncThunk(
  'appointments/confirm',
  async (confirmData: ConfirmAppointmentRequest, { rejectWithValue }) => {
    try {
      const appointment = await appointmentApi.confirmAppointment(confirmData);
      return appointment;
    } catch (error) {
      logError(error, 'confirmAppointment');
      const formattedError = handleError(error, 'Failed to confirm appointment');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Cancel an existing appointment
 */
export const cancelAppointment = createAsyncThunk(
  'appointments/cancel',
  async (cancelData: CancelAppointmentRequest, { rejectWithValue }) => {
    try {
      const appointment = await appointmentApi.cancelAppointment(cancelData);
      return appointment;
    } catch (error) {
      logError(error, 'cancelAppointment');
      const formattedError = handleError(error, 'Failed to cancel appointment');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch available appointment slots
 */
export const fetchAvailableSlots = createAsyncThunk(
  'appointments/fetchAvailableSlots',
  async (params: GetAvailableApptsParams, { rejectWithValue }) => {
    try {
      const response = await appointmentApi.getAvailableSlots(params);
      return { slots: response.slots, params };
    } catch (error) {
      logError(error, 'fetchAvailableSlots');
      const formattedError = handleError(error, 'Failed to fetch available appointment slots');
      return rejectWithValue(formattedError.message);
    }
  }
);

// Slice

export const appointmentSlice = createSlice({
  name: 'appointments',
  initialState,
  reducers: {
    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Clear all appointment data
     */
    clearAppointmentData: (state) => {
      state.appointments = [];
      state.selectedAppointment = null;
      state.error = null;
      state.lastFetchParams = null;
    },

    /**
     * Set selected appointment
     */
    setSelectedAppointment: (state, action: PayloadAction<Appointment | null>) => {
      state.selectedAppointment = action.payload;
    },

    /**
     * Clear available slots
     */
    clearAvailableSlots: (state) => {
      state.availableSlots = [];
      state.slotsError = null;
      state.slotFilters = null;
    },

    /**
     * Set slot filters
     */
    setSlotFilters: (state, action: PayloadAction<GetAvailableApptsParams>) => {
      state.slotFilters = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Fetch Patient Appointments
    builder
      .addCase(fetchPatientAppointments.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        state.fetchingForPatientGuid = action.meta.arg.patientGuid; // Track which patient we're fetching for
      })
      .addCase(fetchPatientAppointments.fulfilled, (state, action) => {
        state.loading = false;
        state.appointments = action.payload.appointments;
        state.fetchingForPatientGuid = null; // Clear tracking
        if (action.payload.params) {
          state.lastFetchParams = action.payload.params;
        }
      })
      .addCase(fetchPatientAppointments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.fetchingForPatientGuid = null; // Clear tracking
      });

    // Fetch Appointments
    builder
      .addCase(fetchAppointments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAppointments.fulfilled, (state, action) => {
        state.loading = false;
        state.appointments = action.payload.appointments;
        if (action.payload.params) {
          state.lastFetchParams = action.payload.params;
        }
      })
      .addCase(fetchAppointments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create Appointment
    builder
      .addCase(createAppointment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createAppointment.fulfilled, (state, action) => {
        state.loading = false;
        state.appointments.push(action.payload);
        state.selectedAppointment = action.payload;
      })
      .addCase(createAppointment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Confirm Appointment
    builder
      .addCase(confirmAppointment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(confirmAppointment.fulfilled, (state, action) => {
        state.loading = false;

        // Update appointment in appointments array
        const index = state.appointments.findIndex(
          (a) => a.appointment_guid === action.payload.appointment_guid
        );
        if (index !== -1) {
          state.appointments[index] = action.payload;
        }

        // Update selected appointment if it's the same one
        if (state.selectedAppointment?.appointment_guid === action.payload.appointment_guid) {
          state.selectedAppointment = action.payload;
        }
      })
      .addCase(confirmAppointment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Cancel Appointment
    builder
      .addCase(cancelAppointment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelAppointment.fulfilled, (state, action) => {
        state.loading = false;

        // Update appointment in appointments array
        const index = state.appointments.findIndex(
          (a) => a.appointment_guid === action.payload.appointment_guid
        );
        if (index !== -1) {
          state.appointments[index] = action.payload;
        }

        // Update selected appointment if it's the same one
        if (state.selectedAppointment?.appointment_guid === action.payload.appointment_guid) {
          state.selectedAppointment = action.payload;
        }
      })
      .addCase(cancelAppointment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Available Slots
    builder
      .addCase(fetchAvailableSlots.pending, (state) => {
        state.slotsLoading = true;
        state.slotsError = null;
      })
      .addCase(fetchAvailableSlots.fulfilled, (state, action) => {
        state.slotsLoading = false;
        state.availableSlots = action.payload.slots;
        state.slotFilters = action.payload.params;
      })
      .addCase(fetchAvailableSlots.rejected, (state, action) => {
        state.slotsLoading = false;
        state.slotsError = action.payload as string;
      });
  },
});

// Export actions
export const {
  clearError,
  clearAppointmentData,
  setSelectedAppointment,
  clearAvailableSlots,
  setSlotFilters,
} = appointmentSlice.actions;

// Selectors
export const selectAllAppointments = (state: RootState) => state.appointments.appointments;
export const selectSelectedAppointment = (state: RootState) => state.appointments.selectedAppointment;
export const selectAppointmentLoading = (state: RootState) => state.appointments.loading;
export const selectAppointmentError = (state: RootState) => state.appointments.error;
export const selectLastFetchParams = (state: RootState) => state.appointments.lastFetchParams;

export const selectAppointmentById = (appointmentGuid: string) => (state: RootState) =>
  state.appointments.appointments.find((a) => a.appointment_guid === appointmentGuid);

export const selectAppointmentsByPatient = (patientGuid: string) => (state: RootState) =>
  state.appointments.appointments.filter((a) => a.patient_guid === patientGuid);

export const selectAppointmentsByDate = (date: string) => (state: RootState) =>
  state.appointments.appointments.filter((a) => a.start_time?.startsWith(date));

export const selectUpcomingAppointments = createSelector(
  [selectAllAppointments],
  (appointments) => {
    const now = new Date();
    return appointments
      .filter((a) => {
        if (!a.start_time) return false;
        const apptDate = new Date(a.start_time);
        return apptDate >= now;
      })
      .sort((a, b) => {
        if (!a.start_time || !b.start_time) return 0;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });
  }
);

// Available Slots Selectors
export const selectAvailableSlots = (state: RootState) => state.appointments.availableSlots;
export const selectSlotsLoading = (state: RootState) => state.appointments.slotsLoading;
export const selectSlotsError = (state: RootState) => state.appointments.slotsError;
export const selectSlotFilters = (state: RootState) => state.appointments.slotFilters;

export const selectSlotsByDate = (date: string) => (state: RootState) =>
  state.appointments.availableSlots.filter((slot) => slot.dateTime.startsWith(date));

// Export reducer
export default appointmentSlice.reducer;
