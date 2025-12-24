/**
 * Redux Store Configuration
 * Central store for application state management
 */

import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import referenceReducer from './slices/referenceSlice';
import patientReducer from './slices/patientSlice';
import appointmentReducer from './slices/appointmentSlice';
import testMonitorReducer from './slices/testMonitorSlice';

/**
 * Configure and create the Redux store
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    reference: referenceReducer,
    patients: patientReducer,
    appointments: appointmentReducer,
    testMonitor: testMonitorReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for serialization check
        ignoredActions: ['ui/showToast'],
        // Ignore these field paths in state
        ignoredActionPaths: ['payload.timestamp'],
        ignoredPaths: ['ui.toasts'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
