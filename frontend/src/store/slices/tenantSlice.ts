/**
 * Tenant Slice
 * Manages multi-tenant state: current tenant, available tenants, switching
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type { Tenant } from '../../types/auth.types';
import { STORAGE_KEYS } from '../../utils/constants';
import { get, post, setCurrentTenantId, getCurrentTenantId } from '../../services/api/client';

interface TenantState {
  currentTenant: Tenant | null;
  availableTenants: Tenant[];
  enabledTabs: string[];
  isLoading: boolean;
}

function getStoredTenantId(): number | null {
  return getCurrentTenantId();
}

const initialState: TenantState = {
  currentTenant: null,
  availableTenants: [],
  enabledTabs: [],
  isLoading: false,
};

/**
 * Load tenants for the current user
 */
export const loadTenants = createAsyncThunk(
  'tenant/loadTenants',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get<{
        status: string;
        data: { tenants: Tenant[]; defaultTenantId: number | null };
      }>('/auth/tenants');
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to load tenants');
    }
  }
);

/**
 * Switch to a different tenant
 */
export const switchTenant = createAsyncThunk(
  'tenant/switchTenant',
  async (tenantId: number, { rejectWithValue }) => {
    try {
      const response = await post<{
        status: string;
        data: { tenantId: number; tenantName: string; enabledTabs?: string[] };
      }>(`/auth/tenants/${tenantId}/switch`);
      return { tenantId, enabledTabs: response.data.enabledTabs || [] };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to switch tenant');
    }
  }
);

export const tenantSlice = createSlice({
  name: 'tenant',
  initialState,
  reducers: {
    /**
     * Set tenants from login/init response (avoids extra API call)
     */
    setTenantsFromAuth: (
      state,
      action: PayloadAction<{ tenants: Tenant[]; defaultTenantId: number | null; enabledTabs?: string[] }>
    ) => {
      const { tenants, defaultTenantId, enabledTabs } = action.payload;
      state.availableTenants = tenants;
      state.enabledTabs = enabledTabs || [];

      // Resolve current tenant: stored > default > first
      const storedId = getStoredTenantId();
      const targetId = storedId || defaultTenantId;
      const current = tenants.find(t => t.id === targetId) || tenants[0] || null;

      state.currentTenant = current;
      if (current) {
        setCurrentTenantId(current.id);
      }
    },

    /**
     * Clear tenant state (on logout)
     */
    clearTenantState: (state) => {
      state.currentTenant = null;
      state.availableTenants = [];
      state.enabledTabs = [];
      state.isLoading = false;
      localStorage.removeItem(STORAGE_KEYS.TENANT_ID);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTenants.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadTenants.fulfilled, (state, action) => {
        state.isLoading = false;
        const { tenants, defaultTenantId } = action.payload;
        state.availableTenants = tenants;

        const storedId = getStoredTenantId();
        const targetId = storedId || defaultTenantId;
        const current = tenants.find(t => t.id === targetId) || tenants[0] || null;

        state.currentTenant = current;
        if (current) {
          setCurrentTenantId(current.id);
        }
      })
      .addCase(loadTenants.rejected, (state) => {
        state.isLoading = false;
      });

    builder
      .addCase(switchTenant.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(switchTenant.fulfilled, (state, action) => {
        state.isLoading = false;
        const { tenantId, enabledTabs } = action.payload;
        const tenant = state.availableTenants.find(t => t.id === tenantId) || null;
        state.currentTenant = tenant;
        state.enabledTabs = enabledTabs;
        if (tenant) {
          setCurrentTenantId(tenant.id);
        }
      })
      .addCase(switchTenant.rejected, (state) => {
        state.isLoading = false;
      });
  },
});

export const { setTenantsFromAuth, clearTenantState } = tenantSlice.actions;

// Selectors
export const selectCurrentTenant = (state: RootState) => state.tenant.currentTenant;
export const selectAvailableTenants = (state: RootState) => state.tenant.availableTenants;
export const selectCurrentTenantId = (state: RootState) => state.tenant.currentTenant?.id ?? null;
export const selectHasMultipleTenants = (state: RootState) => state.tenant.availableTenants.length > 1;
export const selectTenantLoading = (state: RootState) => state.tenant.isLoading;
export const selectEnabledTabs = (state: RootState) => state.tenant.enabledTabs;

export default tenantSlice.reducer;
