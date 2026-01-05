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
import testExecutionReducer from './slices/testExecutionSlice';
import testCasesReducer from './slices/testCasesSlice';
import goalTestCasesReducer from './slices/goalTestCasesSlice';
import createGoalTestReducer from './slices/createGoalTestSlice';
import sandboxReducer from './slices/sandboxSlice';
import workflowReducer from './slices/workflowSlice';

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
    testExecution: testExecutionReducer,
    testCases: testCasesReducer,
    goalTestCases: goalTestCasesReducer,
    createGoalTest: createGoalTestReducer,
    sandbox: sandboxReducer,
    workflow: workflowReducer,
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
  devTools: import.meta.env.MODE !== 'production',
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
