/**
 * Application Constants
 * Centralized constants for routes, API configuration, and app settings
 */

/**
 * Application routes
 */
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/',
  LOGIN: '/login',
  ADMIN: '/admin',
  PATIENTS: '/patients',
  PATIENT_DETAIL: '/patients/:patientGuid',
  PATIENT_NEW: '/patients/new',
  APPOINTMENTS: '/appointments',
  APPOINTMENT_NEW: '/appointments/new',
  CALENDAR: '/calendar',
  SETTINGS: '/settings',
  TEST_MONITOR: '/test-monitor',
  TEST_MONITOR_DASHBOARD: '/test-monitor',
  TEST_MONITOR_CASES: '/test-monitor/cases',
  TEST_MONITOR_GOAL_CASES: '/test-monitor/goal-cases',
  TEST_MONITOR_CREATE: '/test-monitor/create',
  TEST_MONITOR_HISTORY: '/test-monitor/history',
  TEST_MONITOR_TUNING: '/test-monitor/tuning',
  TEST_MONITOR_AB_TESTING: '/test-monitor/ab-testing',
  TEST_MONITOR_SANDBOX: '/test-monitor/sandbox',
  TEST_MONITOR_AI_PROMPTING: '/test-monitor/ai-prompting',
  TEST_MONITOR_API_TESTING: '/test-monitor/api-testing',
  TEST_MONITOR_RUN_DETAIL: '/test-monitor/run/:runId',
  // New unified routes (Sprint 2+)
  TEST_MONITOR_TESTS: '/test-monitor/tests',
  TEST_MONITOR_ANALYSIS: '/test-monitor/analysis',
  TEST_MONITOR_SANDBOX_LAB: '/test-monitor/sandbox-lab',
  TEST_MONITOR_EXPERIMENTS: '/test-monitor/experiments',
  TEST_MONITOR_CALL_TRACE: '/test-monitor/call-trace',
  TEST_MONITOR_SKILLS_RUNNER: '/test-monitor/skills-runner',
  TEST_MONITOR_PROD_TRACKER: '/test-monitor/prod-tracker',
  TEST_MONITOR_ALERTS: '/test-monitor/alerts',
  TEST_MONITOR_QUEUE_ACTIVITY: '/test-monitor/queue-activity',
  TEST_MONITOR_CACHE_HEALTH: '/test-monitor/cache-health',
  TEST_MONITOR_TRACE_ANALYSIS: '/test-monitor/trace-analysis',
  DOMINOS: '/dominos',
  DOMINOS_DASHBOARD: '/dominos/dashboard',
  DOMINOS_ORDERS: '/dominos/orders',
  DOMINOS_HEALTH: '/dominos/health',
  DOMINOS_MENU: '/dominos/menu',
  DOMINOS_SESSIONS: '/dominos/sessions',
  DOMINOS_ERRORS: '/dominos/errors',
  DOMINOS_CALL_TRACING: '/dominos/call-tracing',
} as const;

/**
 * API configuration
 */
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3002/api',
  DEFAULT_ENVIRONMENT: (import.meta.env.VITE_DEFAULT_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
  TIMEOUT: 30000, // 30 seconds
  AI_TIMEOUT: 600000, // 10 minutes for AI enhancement operations (large prompts need more time)
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
} as const;

/**
 * Toast notification duration (ms)
 */
export const TOAST_DURATION = {
  SUCCESS: 5000,
  ERROR: 7000,
  WARNING: 6000,
  INFO: 5000,
} as const;

/**
 * Debounce delay for search (ms)
 */
export const DEBOUNCE_DELAY = 300;

/**
 * Date format strings
 */
export const DATE_FORMATS = {
  DISPLAY: 'MM/dd/yyyy',
  DISPLAY_WITH_TIME: 'MM/dd/yyyy h:mm a',
  INPUT: 'yyyy-MM-dd',
  ISO: "yyyy-MM-dd'T'HH:mm:ss",
  MONTH_YEAR: 'MMMM yyyy',
  SHORT: 'MMM d, yyyy',
} as const;

/**
 * Appointment status values
 */
export const APPOINTMENT_STATUSES = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  CANCELED: 'Canceled',
  COMPLETED: 'Completed',
  NO_SHOW: 'No Show',
} as const;

/**
 * Appointment status colors (Tailwind classes)
 */
export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  Scheduled: 'bg-blue-100 text-blue-800',
  Confirmed: 'bg-green-100 text-green-800',
  Canceled: 'bg-red-100 text-red-800',
  Completed: 'bg-gray-100 text-gray-800',
  'No Show': 'bg-yellow-100 text-yellow-800',
};

/**
 * Environment colors (Tailwind classes)
 */
export const ENVIRONMENT_COLORS = {
  sandbox: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  production: 'bg-green-100 text-green-800 border-green-300',
} as const;

/**
 * Default appointment duration (minutes)
 */
export const DEFAULT_APPOINTMENT_DURATION = 45;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  ENVIRONMENT: 'dentix_environment',
  THEME: 'dentix_theme',
  SIDEBAR_STATE: 'dentix_sidebar_open',
  SIDEBAR_COLLAPSED: 'dentix_sidebar_collapsed',
  AUTH_TOKEN: 'dentix_auth_token',
  TENANT_ID: 'dentix_tenant_id',
} as const;

/**
 * Validation error messages
 */
export const ERROR_MESSAGES = {
  REQUIRED_FIELD: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_PHONE: 'Please enter a valid phone number',
  INVALID_DATE: 'Please enter a valid date',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  NOT_FOUND: 'The requested resource was not found.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  VALIDATION_ERROR: 'Please check the form for errors.',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  PATIENT_CREATED: 'Patient created successfully',
  PATIENT_UPDATED: 'Patient updated successfully',
  APPOINTMENT_CREATED: 'Appointment created successfully',
  APPOINTMENT_CONFIRMED: 'Appointment confirmed successfully',
  APPOINTMENT_CANCELED: 'Appointment canceled successfully',
  SETTINGS_SAVED: 'Settings saved successfully',
} as const;
