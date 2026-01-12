import { Request, Response } from 'express';
import { createCloud9Client } from '../services/cloud9/client';
import { Environment, isValidEnvironment } from '../config/cloud9';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import {
  Cloud9Location,
  Cloud9AppointmentType,
  Cloud9Provider,
} from '../types/cloud9';
import logger from '../utils/logger';

/**
 * Reference Data Controller
 * Handles endpoints for locations, appointment types, and providers
 */

/**
 * Get environment from request header or query
 */
function getEnvironment(req: Request): Environment {
  const env =
    (req.header('X-Environment') as string) ||
    (req.query.environment as string) ||
    'sandbox';

  if (!isValidEnvironment(env)) {
    throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
  }

  return env;
}

/**
 * GET /api/reference/locations
 * Get all practice locations (always fetches from Cloud 9 API in real-time)
 */
export const getLocations = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const client = createCloud9Client(environment);

  // Fetch from Cloud 9 API
  const response = await client.getLocations(false);

  if (response.status === 'Error' || response.errorMessage) {
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(response.errorMessage || 'Failed to fetch locations', statusCode);
  }

  // Transform field names for frontend
  // Note: Cloud9 API may return city as LocationCity or AddressCity depending on endpoint
  const transformedLocations = response.records.map((loc: Cloud9Location) => ({
    guid: loc.LocationGUID,
    name: loc.LocationName,
    code: loc.LocationCode,
    timeZone: loc.TimeZone,
    address: {
      street: loc.AddressStreet,
      city: loc.LocationCity || loc.AddressCity,
      state: loc.LocationState || loc.AddressState,
      postalCode: loc.LocationPostalCode || loc.AddressPostalCode,
    },
    phoneNumber: loc.PhoneNumber,
  }));

  return res.json({
    status: 'success',
    data: transformedLocations,
    cached: false,
    environment,
  });
});

/**
 * GET /api/reference/appointment-types
 * Get all appointment types (always fetches from Cloud 9 API in real-time)
 */
export const getAppointmentTypes = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const client = createCloud9Client(environment);

  // Fetch from Cloud 9 API
  const response = await client.getAppointmentTypes(false);

  if (response.status === 'Error' || response.errorMessage) {
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(
      response.errorMessage || 'Failed to fetch appointment types',
      statusCode
    );
  }

  // Transform field names for frontend
  const transformedTypes = response.records.map((type: Cloud9AppointmentType) => ({
    guid: type.AppointmentTypeGUID,
    code: type.AppointmentTypeCode,
    description: type.AppointmentTypeDescription,
    durationMinutes: Number(type.AppointmentTypeMinutes),
    allowOnlineScheduling: Boolean(
      type.AppointmentTypeAllowOnlineScheduling === true ||
        type.AppointmentTypeAllowOnlineScheduling === 'True'
    ),
  }));

  return res.json({
    status: 'success',
    data: transformedTypes,
    cached: false,
    environment,
  });
});

/**
 * GET /api/reference/providers
 * Get all providers/chair schedules (always fetches from Cloud 9 API in real-time)
 */
export const getProviders = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const locationGuid = req.query.locationGuid as string | undefined;

  const client = createCloud9Client(environment);

  // Fetch from Cloud 9 API
  const response = await client.getChairSchedules();

  if (response.status === 'Error' || response.errorMessage) {
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(response.errorMessage || 'Failed to fetch providers', statusCode);
  }

  // Transform field names for frontend
  let transformedProviders = response.records.map((prov: Cloud9Provider) => ({
    guid: prov.schdcolGUID,
    locationGuid: prov.locGUID,
    locationName: '', // Not available in API response, will be populated by frontend if needed
    scheduleViewGuid: prov.schdvwGUID,
    scheduleViewDescription: prov.schdvwDescription || '',
    scheduleColumnGuid: prov.schdcolGUID,
    scheduleColumnDescription: prov.schdcolDescription || '',
  }));

  // Filter by location if requested
  if (locationGuid) {
    transformedProviders = transformedProviders.filter((p) => p.locationGuid === locationGuid);
  }

  return res.json({
    status: 'success',
    data: transformedProviders,
    cached: false,
    environment,
  });
});

/**
 * POST /api/reference/refresh
 * No-op endpoint for backward compatibility (caching is disabled)
 */
export const refreshAllCaches = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);

  // Caching is disabled, so this is a no-op
  logger.info('Cache refresh requested but caching is disabled', { environment });

  res.json({
    status: 'success',
    message: 'Caching is disabled - all data is fetched in real-time from Cloud 9 API',
    environment,
  });
});

/**
 * GET /api/reference/cache/stats
 * Returns empty stats (caching is disabled)
 */
export const getCacheStats = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);

  // Caching is disabled, return empty stats
  const stats = {
    total: 0,
    fresh: 0,
    expired: 0,
    oldestEntry: null,
    newestEntry: null,
    cachingEnabled: false,
    message: 'Caching is disabled - all data is fetched in real-time from Cloud 9 API',
  };

  res.json({
    status: 'success',
    data: stats,
    environment,
  });
});
