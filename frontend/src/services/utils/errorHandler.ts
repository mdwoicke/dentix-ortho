/**
 * Error Handler
 * Centralized error handling and logging
 */

import type { ApiError } from '../../types';
import { ERROR_MESSAGES } from '../../utils/constants';
import { getErrorMessage, isApiError, isNetworkError, isServerError } from './apiUtils';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Formatted error for display
 */
export interface FormattedError {
  title: string;
  message: string;
  severity: ErrorSeverity;
  code?: string;
  retry?: boolean;
}

/**
 * Handle and format API errors for user display
 * @param error - Error object
 * @param context - Optional context for error
 * @returns Formatted error object
 */
export function handleError(error: unknown, context?: string): FormattedError {
  // Log error for debugging
  console.error('[Error Handler]', context || 'Unknown context', error);

  // Handle network errors
  if (isNetworkError(error)) {
    return {
      title: 'Network Error',
      message: ERROR_MESSAGES.NETWORK_ERROR,
      severity: ErrorSeverity.ERROR,
      code: 'NETWORK_ERROR',
      retry: true,
    };
  }

  // Handle server errors (5xx)
  if (isServerError(error)) {
    return {
      title: 'Server Error',
      message: ERROR_MESSAGES.SERVER_ERROR,
      severity: ErrorSeverity.ERROR,
      code: isApiError(error) ? error.code : undefined,
      retry: true,
    };
  }

  // Handle API errors
  if (isApiError(error)) {
    return formatApiError(error);
  }

  // Handle generic errors
  return {
    title: 'Error',
    message: getErrorMessage(error),
    severity: ErrorSeverity.ERROR,
    retry: false,
  };
}

/**
 * Format API error for display
 * @param error - API error object
 * @returns Formatted error
 */
function formatApiError(error: ApiError): FormattedError {
  const { status, message, code } = error;

  // Map status codes to formatted errors
  switch (status) {
    case 400:
      return {
        title: 'Invalid Request',
        message: message || ERROR_MESSAGES.VALIDATION_ERROR,
        severity: ErrorSeverity.WARNING,
        code,
        retry: false,
      };

    case 401:
      return {
        title: 'Unauthorized',
        message: message || ERROR_MESSAGES.UNAUTHORIZED,
        severity: ErrorSeverity.WARNING,
        code,
        retry: false,
      };

    case 404:
      return {
        title: 'Not Found',
        message: message || ERROR_MESSAGES.NOT_FOUND,
        severity: ErrorSeverity.WARNING,
        code,
        retry: false,
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        title: 'Server Error',
        message: message || ERROR_MESSAGES.SERVER_ERROR,
        severity: ErrorSeverity.ERROR,
        code,
        retry: true,
      };

    default:
      return {
        title: 'Error',
        message: message || 'An error occurred',
        severity: ErrorSeverity.ERROR,
        code,
        retry: false,
      };
  }
}

/**
 * Log error to console (and potentially to error tracking service)
 * @param error - Error object
 * @param context - Error context
 * @param metadata - Additional metadata
 */
export function logError(error: unknown, context: string, metadata?: Record<string, unknown>): void {
  const formattedError = handleError(error, context);

  // Log to console
  console.error('[Error]', {
    context,
    error: formattedError,
    original: error,
    metadata,
    timestamp: new Date().toISOString(),
  });

  // TODO: Send to error tracking service (Sentry, LogRocket, etc.)
  // Example: Sentry.captureException(error, { contexts: { metadata } });
}

/**
 * Create user-friendly error message for common scenarios
 * @param operation - Operation being performed
 * @param entityType - Type of entity (patient, appointment, etc.)
 * @returns Error message
 */
export function createErrorMessage(operation: string, entityType: string): string {
  const article = /^[aeiou]/i.test(entityType) ? 'an' : 'a';

  switch (operation) {
    case 'fetch':
    case 'get':
      return `Failed to load ${entityType}. Please try again.`;
    case 'create':
      return `Failed to create ${article} ${entityType}. Please check your input and try again.`;
    case 'update':
      return `Failed to update ${entityType}. Please try again.`;
    case 'delete':
      return `Failed to delete ${entityType}. Please try again.`;
    case 'search':
      return `Failed to search for ${entityType}s. Please try again.`;
    default:
      return `Failed to ${operation} ${entityType}. Please try again.`;
  }
}
