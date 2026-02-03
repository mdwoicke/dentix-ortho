/**
 * Alert Detail Types
 * Defines interfaces for enhanced error details and resolution suggestions
 */

// ============================================================================
// ERROR DETAIL TYPES
// ============================================================================

export interface AlertErrorDetail {
  traceId: string;
  sessionId: string;
  timestamp: string;
  errorType: string;
  action?: string;
  errorMessage?: string;
  context?: Record<string, any>;
}

export interface AlertResolution {
  suggestion: string;
  steps: string[];
  docLink?: string;
}

export interface EnhancedAdditionalInfo {
  sessionIds?: string[];
  errorDetails?: AlertErrorDetail[];
  resolution?: AlertResolution;
  [key: string]: any; // Allow additional fields
}

// ============================================================================
// RESOLUTION PATTERNS
// ============================================================================

export const API_FAILURE_RESOLUTIONS: Record<string, AlertResolution> = {
  patient_not_found: {
    suggestion: 'Patient GUID not found in Cloud9',
    steps: [
      'Check if patient creation succeeded earlier in session',
      'Verify patientGUID is from current session, not stale',
      'Review Cloud9 patient sync status',
    ],
  },
  slot_unavailable: {
    suggestion: 'Requested slot is no longer available',
    steps: [
      'Slot was likely taken by another booking',
      'Retry with fresh slot fetch',
      'Consider implementing slot reservation',
    ],
  },
  invalid_appointment_type: {
    suggestion: 'Appointment type GUID is invalid for location',
    steps: [
      'Verify appointmentTypeGUID matches location',
      'Check if appointment type is active in Cloud9',
      'Review location-to-appointment-type mappings',
    ],
  },
  provider_unavailable: {
    suggestion: 'Provider may be out of office or unavailable',
    steps: [
      'Check provider schedule in Cloud9',
      'Use different provider if available',
      'Verify provider GUID is valid',
    ],
  },
  default: {
    suggestion: 'Cloud9 API returned an error',
    steps: [
      'Check trace details in Langfuse',
      'Review Cloud9 API status',
      'Check request payload validity',
    ],
  },
};

export const GATEWAY_ERROR_RESOLUTIONS: Record<string, AlertResolution> = {
  '502': {
    suggestion: 'Cloud9 API server issue (502 Bad Gateway)',
    steps: [
      'Usually transient, will auto-recover',
      'Check Cloud9 status page if persistent',
      'Retry requests may succeed',
    ],
  },
  '500': {
    suggestion: 'Cloud9 internal server error',
    steps: [
      'Check if request payload is malformed',
      'Review Cloud9 API logs if accessible',
      'May indicate Cloud9 maintenance window',
    ],
  },
  timeout: {
    suggestion: 'Cloud9 API slow to respond',
    steps: [
      'Consider retry with backoff',
      'Check Cloud9 status for degraded performance',
      'Review request complexity',
    ],
  },
  default: {
    suggestion: 'Cloud9 API connectivity issue',
    steps: [
      'Check network connectivity to Cloud9',
      'Verify Cloud9 API is accessible',
      'Review firewall and proxy settings',
    ],
  },
};

export const PAYLOAD_LEAK_RESOLUTION: AlertResolution = {
  suggestion: 'Raw JSON exposed to caller - check Node-RED error handling',
  steps: [
    'Check schedule_appointment_ortho function node for error handling',
    'Verify catch nodes exist for all error paths',
    'Ensure msg.payload transformations return user-friendly messages',
    'Review Node-RED flow for any paths that bypass error formatting',
  ],
};

export const EMPTY_GUID_RESOLUTION: AlertResolution = {
  suggestion: 'Empty patientGUID indicates data collection failure',
  steps: [
    'Review conversation flow for skipped patient creation',
    'Check if patient tool was called before scheduling',
    'Verify GUID was stored in session context',
    'Look for context loss between tool calls',
  ],
};

export const SLOT_FAILURE_RESOLUTION: AlertResolution = {
  suggestion: 'Slot fetch failed - may indicate no availability or API issue',
  steps: [
    'Check Cloud9 schedule for the date range',
    'Verify location GUID is valid',
    'Check if date is in allowed booking window',
    'Review tier configuration for requested dates',
  ],
};

export const ESCALATION_RESOLUTION: AlertResolution = {
  suggestion: 'User requested human transfer - review conversation friction points',
  steps: [
    'Analyze conversation for repeated failures',
    'Check if slots were unavailable',
    'Look for complex requests outside bot capability',
    'Review user satisfaction signals',
  ],
};

export const CACHE_STALENESS_RESOLUTION: AlertResolution = {
  suggestion: 'Slot cache is stale - auto-refresh may have stopped',
  steps: [
    'Check Node-RED cache refresh timer is running (look for "Cache Refresh" tab in Node-RED)',
    'Manually trigger cache refresh: curl -X POST https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd/cache-refresh',
    'Check Node-RED logs for errors in the cache refresh flow',
    'Verify Redis is accessible from Node-RED (connection issues can stop refresh)',
    'Restart the Node-RED cache refresh inject node if timer drifted',
  ],
};

export const CONVERSATION_LOOP_RESOLUTION: AlertResolution = {
  suggestion: 'Session has 19+ turns indicating potential loop',
  steps: [
    'Check if LLM is losing context',
    'Verify session state management',
    'Look for repeated tool calls with same parameters',
    'Review conversation for bot asking same questions repeatedly',
  ],
};
