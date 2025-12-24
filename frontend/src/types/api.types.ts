/**
 * API Response Types
 * Types for API responses and request/response wrappers
 */

export type Environment = 'sandbox' | 'production';

/**
 * Standard API response wrapper from backend
 */
export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  data: T;
  environment?: Environment;
  message?: string;
  error?: string;
}

/**
 * API Error response
 */
export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: unknown;
}

/**
 * Pagination parameters for API requests
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Pagination metadata in API responses
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages?: number;
}

/**
 * Patient search parameters
 */
export interface PatientSearchParams extends PaginationParams {
  query?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  patientNumber?: string;
  birthdate?: string;
  pageIndex?: number;
}

/**
 * Appointment date range parameters
 */
export interface AppointmentDateRangeParams {
  startDate: string;
  endDate: string;
}

/**
 * Cache statistics response
 */
export interface CacheStatsResponse {
  [key: string]: {
    count: number;
    lastUpdated?: string;
  };
}
