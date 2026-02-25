/**
 * Fabric Workflow API Service
 * Proxied calls through the dentix-ortho backend.
 */

import axios from 'axios';
import { API_CONFIG } from '../../utils/constants';
import { getAuthToken, getCurrentTenantId } from './client';
import type {
  FabricWorkflowResponse,
  FabricWorkflowTestResult,
} from '../../types/fabricWorkflow.types';

const client = axios.create({
  baseURL: `${API_CONFIG.BASE_URL}/fabric-workflow`,
  timeout: API_CONFIG.TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth + tenant headers
client.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  const tenantId = getCurrentTenantId();
  if (tenantId) config.headers['X-Tenant-Id'] = String(tenantId);
  return config;
});

export async function getRecords(): Promise<FabricWorkflowResponse> {
  const { data } = await client.get('/records');
  return data;
}

export async function testConnection(params: {
  url: string;
  username: string;
  password: string;
}): Promise<FabricWorkflowTestResult> {
  const { data } = await client.post('/test-connection', params);
  return data.data;
}
