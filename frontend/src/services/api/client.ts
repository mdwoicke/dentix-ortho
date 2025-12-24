/**
 * API Client
 * Axios instance configured with interceptors for Cloud 9 Ortho backend
 */

import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { API_CONFIG } from '../../utils/constants';
import type { ApiError, ApiResponse, Environment } from '../../types';

/**
 * Environment storage key
 */
const ENVIRONMENT_KEY = 'dentix_environment';

/**
 * Get current environment from localStorage
 */
export function getCurrentEnvironment(): Environment {
  const stored = localStorage.getItem(ENVIRONMENT_KEY);
  return (stored === 'production' ? 'production' : 'sandbox') as Environment;
}

/**
 * Set current environment in localStorage
 */
export function setCurrentEnvironment(environment: Environment): void {
  localStorage.setItem(ENVIRONMENT_KEY, environment);
}

/**
 * Create configured Axios instance
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: API_CONFIG.TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: Add environment header
  client.interceptors.request.use(
    (config) => {
      const environment = getCurrentEnvironment();
      config.headers['X-Environment'] = environment;
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor: Extract data and handle errors
  client.interceptors.response.use(
    (response) => {
      // Extract data from ApiResponse wrapper
      const apiResponse = response.data as ApiResponse;

      if (apiResponse.status === 'error') {
        // Backend returned error status
        throw new Error(apiResponse.error || apiResponse.message || 'API request failed');
      }

      // Return the full API response (status, data, pagination, environment)
      return {
        ...response,
        data: apiResponse,
      };
    },
    (error: AxiosError) => {
      // Handle network and HTTP errors
      const apiError = handleApiError(error);
      return Promise.reject(apiError);
    }
  );

  return client;
}

/**
 * Handle and format API errors
 */
function handleApiError(error: AxiosError): ApiError {
  if (error.response) {
    // Server responded with error status
    const data = error.response.data as any;

    return {
      message: data?.message || data?.error || 'Server error occurred',
      status: error.response.status,
      code: data?.code,
      details: data?.details,
    };
  }

  if (error.request) {
    // Request made but no response received
    return {
      message: 'Network error. Please check your connection.',
      status: 0,
      code: 'NETWORK_ERROR',
    };
  }

  // Error in request configuration
  return {
    message: error.message || 'An unexpected error occurred',
    status: 0,
    code: 'UNKNOWN_ERROR',
  };
}

/**
 * Singleton API client instance
 */
export const apiClient = createApiClient();

/**
 * Helper function to make GET requests
 */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

/**
 * Helper function to make POST requests
 */
export async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
}

/**
 * Helper function to make PUT requests
 */
export async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.put<T>(url, data, config);
  return response.data;
}

/**
 * Helper function to make DELETE requests
 */
export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<T>(url, config);
  return response.data;
}

/**
 * Export default client
 */
export default apiClient;
