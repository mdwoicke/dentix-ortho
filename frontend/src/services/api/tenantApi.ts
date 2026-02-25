/**
 * Tenant API Service
 * Handles tenant management API calls (admin only)
 */

import { get, post, put, del } from './client';
import type { Tenant } from '../../types/auth.types';

export interface TenantFull extends Tenant {
  cloud9_prod_endpoint: string;
  cloud9_prod_client_id: string | null;
  cloud9_prod_username: string | null;
  cloud9_prod_password: string | null;
  cloud9_sandbox_endpoint: string;
  cloud9_sandbox_client_id: string | null;
  cloud9_sandbox_username: string | null;
  cloud9_sandbox_password: string | null;
  nodered_url: string | null;
  nodered_username: string | null;
  nodered_password: string | null;
  flowise_url: string | null;
  flowise_api_key: string | null;
  langfuse_host: string | null;
  langfuse_public_key: string | null;
  langfuse_secret_key: string | null;
  v1_files_dir: string;
  nodered_flows_dir: string;
  dominos_service_url: string | null;
  dominos_service_auth_token: string | null;
  dominos_default_store_id: string | null;
  dominos_data_source_url: string | null;
  fabric_workflow_url: string | null;
  fabric_workflow_username: string | null;
  fabric_workflow_password: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantUserRole {
  user_id: number;
  tenant_id: number;
  role: string;
  is_default: boolean;
  email?: string;
  display_name?: string;
}

export interface CreateTenantRequest {
  slug: string;
  name: string;
  short_name?: string;
  logo_url?: string;
  color_primary?: string;
  color_secondary?: string;
  cloud9_prod_endpoint?: string;
  cloud9_prod_client_id?: string;
  cloud9_prod_username?: string;
  cloud9_prod_password?: string;
  cloud9_sandbox_endpoint?: string;
  cloud9_sandbox_client_id?: string;
  cloud9_sandbox_username?: string;
  cloud9_sandbox_password?: string;
  nodered_url?: string;
  nodered_username?: string;
  nodered_password?: string;
  flowise_url?: string;
  flowise_api_key?: string;
  langfuse_host?: string;
  langfuse_public_key?: string;
  langfuse_secret_key?: string;
  users?: { userId: number; role: string }[];
  tabKeys?: string[];
}

// List all tenants
export async function getTenants(): Promise<{ status: string; data: { tenants: TenantFull[] } }> {
  return get('/admin/tenants');
}

// Get tenant by ID
export async function getTenant(id: number): Promise<{ status: string; data: { tenant: TenantFull } }> {
  return get(`/admin/tenants/${id}`);
}

// Create tenant
export async function createTenant(data: CreateTenantRequest): Promise<{ status: string; data: { tenant: TenantFull } }> {
  return post('/admin/tenants', data);
}

// Update tenant
export async function updateTenant(id: number, data: Partial<CreateTenantRequest>): Promise<{ status: string; data: { tenant: TenantFull } }> {
  return put(`/admin/tenants/${id}`, data);
}

// Soft-delete tenant
export async function deleteTenant(id: number): Promise<{ status: string; message: string }> {
  return del(`/admin/tenants/${id}`);
}

// Get users for a tenant
export async function getTenantUsers(id: number): Promise<{ status: string; data: { users: TenantUserRole[] } }> {
  return get(`/admin/tenants/${id}/users`);
}

// Add user to tenant
export async function addTenantUser(tenantId: number, userId: number, role: string = 'member'): Promise<{ status: string }> {
  return post(`/admin/tenants/${tenantId}/users`, { userId, role });
}

// Remove user from tenant
export async function removeTenantUser(tenantId: number, userId: number): Promise<{ status: string }> {
  return del(`/admin/tenants/${tenantId}/users/${userId}`);
}

// Get enabled tabs for a tenant
export async function getTenantTabs(id: number): Promise<{ status: string; data: { enabledTabs: string[] } }> {
  return get(`/admin/tenants/${id}/tabs`);
}

// Set enabled tabs for a tenant
export async function setTenantTabs(id: number, tabKeys: string[]): Promise<{ status: string; data: { enabledTabs: string[] } }> {
  return put(`/admin/tenants/${id}/tabs`, { tabKeys });
}

// Test Cloud9 connection
export async function testCloud9Connection(data: {
  endpoint: string;
  clientId: string;
  username: string;
  password: string;
}): Promise<{ status: string; data: { connected: boolean }; message: string }> {
  return post('/admin/tenants/test-cloud9', data);
}
