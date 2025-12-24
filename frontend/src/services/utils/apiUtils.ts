/**
 * API Utilities
 * Helper functions for API operations
 */

import type { ApiError } from '../../types';
import { ERROR_MESSAGES } from '../../utils/constants';

/**
 * Build query parameters string from object
 * @param params - Object with query parameters
 * @returns Query string (e.g., "?key1=value1&key2=value2")
 *
 * @example
 * buildQueryParams({ query: 'John', page: 1 }) // => "?query=John&page=1"
 */
export function buildQueryParams(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Check if error is an API error
 * @param error - Unknown error object
 * @returns True if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'status' in error
  );
}

/**
 * Get user-friendly error message from API error
 * @param error - Error object
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return ERROR_MESSAGES.SERVER_ERROR;
}

/**
 * Get HTTP status code from error
 * @param error - Error object
 * @returns HTTP status code or 0 if not available
 */
export function getErrorStatus(error: unknown): number {
  if (isApiError(error)) {
    return error.status;
  }
  return 0;
}

/**
 * Check if error is a network error
 * @param error - Error object
 * @returns True if network error
 */
export function isNetworkError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.code === 'NETWORK_ERROR' || error.status === 0;
  }
  return false;
}

/**
 * Check if error is a 404 Not Found error
 * @param error - Error object
 * @returns True if 404 error
 */
export function isNotFoundError(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/**
 * Check if error is an unauthorized (401) error
 * @param error - Error object
 * @returns True if 401 error
 */
export function isUnauthorizedError(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/**
 * Check if error is a server error (5xx)
 * @param error - Error object
 * @returns True if server error
 */
export function isServerError(error: unknown): boolean {
  return isApiError(error) && error.status >= 500 && error.status < 600;
}

/**
 * Retry function with exponential backoff
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries
 * @param delay - Initial delay in ms
 * @returns Result of function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx) except network errors
      if (isApiError(error) && error.status >= 400 && error.status < 500 && !isNetworkError(error)) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

/**
 * Format API endpoint path
 * @param path - API path with optional parameters
 * @param params - Path parameters
 * @returns Formatted path
 *
 * @example
 * formatPath('/patients/:patientGuid', { patientGuid: '123' }) // => '/patients/123'
 */
export function formatPath(path: string, params: Record<string, string>): string {
  let formattedPath = path;

  Object.entries(params).forEach(([key, value]) => {
    formattedPath = formattedPath.replace(`:${key}`, encodeURIComponent(value));
  });

  return formattedPath;
}
