/**
 * UI Slice
 * Manages UI state: loading indicators, toasts, modals, sidebar
 */

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type { Toast, ToastType, LoadingState } from '../../types';
import { TOAST_DURATION, STORAGE_KEYS } from '../../utils/constants';

interface UIState {
  loading: boolean;
  globalLoading: LoadingState;
  toasts: Toast[];
  modals: Record<string, boolean>;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
}

/**
 * Load initial sidebar state from localStorage
 */
function getInitialSidebarState(): boolean {
  const stored = localStorage.getItem(STORAGE_KEYS.SIDEBAR_STATE);
  return stored ? JSON.parse(stored) : true;
}

/**
 * Load initial sidebar collapsed state from localStorage
 */
function getInitialSidebarCollapsed(): boolean {
  const stored = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
  return stored ? JSON.parse(stored) : false;
}

const initialState: UIState = {
  loading: false,
  globalLoading: {},
  toasts: [],
  modals: {},
  sidebarOpen: getInitialSidebarState(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
};

/**
 * Generate unique toast ID
 */
let toastIdCounter = 0;
function generateToastId(): string {
  return `toast-${Date.now()}-${toastIdCounter++}`;
}

/**
 * UI slice
 */
export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    /**
     * Set global loading state
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },

    /**
     * Set loading state for a specific operation
     */
    setOperationLoading: (
      state,
      action: PayloadAction<{ operation: string; loading: boolean }>
    ) => {
      const { operation, loading } = action.payload;
      if (loading) {
        state.globalLoading[operation] = true;
      } else {
        delete state.globalLoading[operation];
      }
    },

    /**
     * Show a toast notification
     */
    showToast: (
      state,
      action: PayloadAction<{ type: ToastType; message: string; duration?: number }>
    ) => {
      const { type, message, duration } = action.payload;
      const toast: Toast = {
        id: generateToastId(),
        type,
        message,
        duration: duration || TOAST_DURATION[type.toUpperCase() as keyof typeof TOAST_DURATION],
      };
      state.toasts.push(toast);
    },

    /**
     * Hide a specific toast by ID
     */
    hideToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },

    /**
     * Clear all toasts
     */
    clearToasts: (state) => {
      state.toasts = [];
    },

    /**
     * Open a modal by ID
     */
    openModal: (state, action: PayloadAction<string>) => {
      state.modals[action.payload] = true;
    },

    /**
     * Close a modal by ID
     */
    closeModal: (state, action: PayloadAction<string>) => {
      state.modals[action.payload] = false;
    },

    /**
     * Close all modals
     */
    closeAllModals: (state) => {
      state.modals = {};
    },

    /**
     * Toggle sidebar open/closed
     */
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_STATE, JSON.stringify(state.sidebarOpen));
    },

    /**
     * Set sidebar state
     */
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_STATE, JSON.stringify(action.payload));
    },

    /**
     * Toggle sidebar collapsed state (for desktop)
     */
    toggleSidebarCollapsed: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, JSON.stringify(state.sidebarCollapsed));
    },

    /**
     * Set sidebar collapsed state
     */
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, JSON.stringify(action.payload));
    },
  },
});

// Export actions
export const {
  setLoading,
  setOperationLoading,
  showToast,
  hideToast,
  clearToasts,
  openModal,
  closeModal,
  closeAllModals,
  toggleSidebar,
  setSidebarOpen,
  toggleSidebarCollapsed,
  setSidebarCollapsed,
} = uiSlice.actions;

// Selectors
export const selectLoading = (state: RootState) => state.ui.loading;
export const selectOperationLoading = (operation: string) => (state: RootState) =>
  state.ui.globalLoading[operation] || false;
export const selectAnyLoading = (state: RootState) =>
  state.ui.loading || Object.keys(state.ui.globalLoading).length > 0;
export const selectToasts = (state: RootState) => state.ui.toasts;
export const selectModalOpen = (modalId: string) => (state: RootState) =>
  state.ui.modals[modalId] || false;
export const selectSidebarOpen = (state: RootState) => state.ui.sidebarOpen;
export const selectSidebarCollapsed = (state: RootState) => state.ui.sidebarCollapsed;

// Export reducer
export default uiSlice.reducer;
