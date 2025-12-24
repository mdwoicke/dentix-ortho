/**
 * Reference Data API Service
 * API calls for locations, appointment types, and providers
 */

import { get, post } from './client';
import type { Location, AppointmentType, Provider, CacheStatsResponse } from '../../types';

/**
 * Get all practice locations
 */
export async function getLocations(): Promise<Location[]> {
  const response = await get<{ data: Location[] }>('/reference/locations');
  return response.data || [];
}

/**
 * Get all appointment types
 */
export async function getAppointmentTypes(): Promise<AppointmentType[]> {
  const response = await get<{ data: AppointmentType[] }>('/reference/appointment-types');
  return response.data || [];
}

/**
 * Get all providers (chair schedules)
 */
export async function getProviders(locationGuid?: string): Promise<Provider[]> {
  const url = locationGuid
    ? `/reference/providers?locationGuid=${locationGuid}`
    : '/reference/providers';

  const response = await get<{ data: Provider[] }>(url);
  return response.data || [];
}

/**
 * Refresh all cached reference data
 */
export async function refreshAllCaches(): Promise<void> {
  await post('/reference/refresh');
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStatsResponse> {
  return await get<CacheStatsResponse>('/reference/cache/stats');
}
