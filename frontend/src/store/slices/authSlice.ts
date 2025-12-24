/**
 * Auth Slice
 * Manages environment selection and user authentication state
 */

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type { Environment } from '../../types';
import { API_CONFIG, STORAGE_KEYS } from '../../utils/constants';
import { setCurrentEnvironment } from '../../services/api/client';

interface AuthState {
  environment: Environment;
  // Future: Add user authentication state
  // user: User | null;
  // token: string | null;
}

/**
 * Load initial environment from localStorage or default
 */
function getInitialEnvironment(): Environment {
  const stored = localStorage.getItem(STORAGE_KEYS.ENVIRONMENT);
  if (stored === 'sandbox' || stored === 'production') {
    return stored;
  }
  return API_CONFIG.DEFAULT_ENVIRONMENT;
}

const initialState: AuthState = {
  environment: getInitialEnvironment(),
};

/**
 * Auth slice
 */
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Set the current environment (sandbox or production)
     */
    setEnvironment: (state, action: PayloadAction<Environment>) => {
      state.environment = action.payload;

      // Persist to localStorage
      localStorage.setItem(STORAGE_KEYS.ENVIRONMENT, action.payload);

      // Update API client
      setCurrentEnvironment(action.payload);
    },

    /**
     * Toggle between sandbox and production
     */
    toggleEnvironment: (state) => {
      const newEnvironment = state.environment === 'sandbox' ? 'production' : 'sandbox';
      state.environment = newEnvironment;

      // Persist to localStorage
      localStorage.setItem(STORAGE_KEYS.ENVIRONMENT, newEnvironment);

      // Update API client
      setCurrentEnvironment(newEnvironment);
    },

    // Future: Add authentication actions
    // setUser: (state, action: PayloadAction<User>) => {
    //   state.user = action.payload;
    // },
    // logout: (state) => {
    //   state.user = null;
    //   state.token = null;
    // },
  },
});

// Export actions
export const { setEnvironment, toggleEnvironment } = authSlice.actions;

// Selectors
export const selectEnvironment = (state: RootState) => state.auth.environment;
export const selectIsSandbox = (state: RootState) => state.auth.environment === 'sandbox';
export const selectIsProduction = (state: RootState) => state.auth.environment === 'production';

// Export reducer
export default authSlice.reducer;
