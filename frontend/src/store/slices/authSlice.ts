/**
 * Auth Slice
 * Manages environment selection and user authentication state
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type { Environment } from '../../types';
import type { User, TabKey } from '../../types/auth.types';
import { API_CONFIG, STORAGE_KEYS } from '../../utils/constants';
import { setCurrentEnvironment, setAuthToken, removeAuthToken, getAuthToken } from '../../services/api/client';
import * as authApi from '../../services/api/authApi';

interface AuthState {
  environment: Environment;
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mustChangePassword: boolean;
  isInitialized: boolean;
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
  user: null,
  token: getAuthToken(),
  isAuthenticated: false,
  isLoading: false,
  error: null,
  mustChangePassword: false,
  isInitialized: false,
};

/**
 * Async thunk: Login
 */
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.login(credentials);
      // Store token
      setAuthToken(response.data.token);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Login failed');
    }
  }
);

/**
 * Async thunk: Change password
 */
export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (data: { currentPassword: string; newPassword: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.changePassword(data);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to change password');
    }
  }
);

/**
 * Async thunk: Initialize auth from stored token
 */
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    try {
      const token = getAuthToken();
      if (!token) {
        return null;
      }

      const response = await authApi.getCurrentUser();
      return { user: response.data.user, token };
    } catch (error: any) {
      // Token is invalid, remove it
      removeAuthToken();
      return rejectWithValue(error.message || 'Session expired');
    }
  }
);

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

    /**
     * Logout user
     */
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.mustChangePassword = false;
      state.error = null;
      removeAuthToken();
    },

    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Clear must change password flag
     */
    clearMustChangePassword: (state) => {
      state.mustChangePassword = false;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.mustChangePassword = action.payload.user.must_change_password;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Change password
    builder
      .addCase(changePassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.mustChangePassword = false;
        state.error = null;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Initialize auth
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isInitialized = true;
        if (action.payload) {
          state.user = action.payload.user;
          state.token = action.payload.token;
          state.isAuthenticated = true;
          state.mustChangePassword = action.payload.user.must_change_password;
        }
      })
      .addCase(initializeAuth.rejected, (state) => {
        state.isLoading = false;
        state.isInitialized = true;
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
      });
  },
});

// Export actions
export const {
  setEnvironment,
  toggleEnvironment,
  logout,
  clearError,
  clearMustChangePassword
} = authSlice.actions;

// Selectors
export const selectEnvironment = (state: RootState) => state.auth.environment;
export const selectIsSandbox = (state: RootState) => state.auth.environment === 'sandbox';
export const selectIsProduction = (state: RootState) => state.auth.environment === 'production';
export const selectUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectIsAdmin = (state: RootState) => state.auth.user?.is_admin ?? false;
export const selectMustChangePassword = (state: RootState) => state.auth.mustChangePassword;
export const selectAuthLoading = (state: RootState) => state.auth.isLoading;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectIsInitialized = (state: RootState) => state.auth.isInitialized;

/**
 * Check if user can access a specific tab
 * Admin users can access all tabs
 * Non-admin users check their permissions
 */
export const selectCanAccessTab = (tabKey: TabKey) => (state: RootState): boolean => {
  const user = state.auth.user;

  if (!user) {
    return false;
  }

  // Admin users can access all tabs
  if (user.is_admin) {
    return true;
  }

  // Check user permissions
  const permission = user.permissions.find(p => p.tab_key === tabKey);
  return permission?.can_access ?? false;
};

// Export reducer
export default authSlice.reducer;
