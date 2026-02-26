/**
 * TranscriptViewer Component
 * Displays conversation transcript in a chat-style format
 * Patient names are clickable and link to patient details
 * API calls are shown inline with the conversation flow
 */

import { useMemo, useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Spinner } from '../../ui';
import type { ConversationTurn, ApiCall } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';
import {
  extractPatientsFromApiCalls,
  extractPatientsFromApiCall,
  buildPatientNameMap,
  getPatientDetailUrl,
  type ExtractedPatient,
} from '../../../utils/patientLinkHelper';
import { copyToClipboard } from '../../../utils/clipboard';
import { ReplayPanel } from './CallFlowNavigator/ReplayPanel';

interface TranscriptViewerProps {
  transcript: ConversationTurn[];
  apiCalls?: ApiCall[];
  loading?: boolean;
  // Database IDs for troubleshooting
  testId?: string;
  runId?: string;
  dbId?: number;  // Database row ID from test_results table
  // Langfuse integration
  langfuseTraceId?: string;
  langfuseHost?: string;
  langfuseProjectId?: string;
  // Flowise session ID (UUID) - used for Langfuse session URL
  flowiseSessionId?: string;
  // Live session indicator - when true, auto-scrolls to bottom on new messages
  isLive?: boolean;
}

/**
 * Render text with patient names as clickable links
 */
function TextWithPatientLinks({
  text,
  patients,
  nameMap,
}: {
  text: string;
  patients: ExtractedPatient[];
  nameMap: Map<string, string>;
}) {
  if (patients.length === 0 || nameMap.size === 0) {
    return <>{text}</>;
  }

  // Create pattern from all patient names (sorted by length to match longest first)
  const names = Array.from(nameMap.keys()).sort((a, b) => b.length - a.length);

  // Build regex pattern - escape special chars and match case-insensitively
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Create a regex that matches any of the patient names (case insensitive)
  const patternString = names.map(n => escapeRegex(n)).join('|');
  if (!patternString) return <>{text}</>;

  const pattern = new RegExp(`(${patternString})`, 'gi');

  // Split text by pattern
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        const lowerPart = part.toLowerCase();
        const patientGuid = nameMap.get(lowerPart);

        if (patientGuid) {
          const patient = patients.find(p => p.patientGuid === patientGuid);
          return (
            <Link
              key={index}
              to={getPatientDetailUrl(patientGuid)}
              className="text-blue-400 hover:text-blue-300 underline decoration-dotted underline-offset-2 hover:decoration-solid font-medium"
              title={patient ? `View patient: ${patient.fullName}` : `View patient details`}
            >
              {part}
            </Link>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/**
 * Format ISO timestamp to readable time string (12hr format, CST)
 */
function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago', // CST/CDT
    });
  } catch {
    return '';
  }
}

// Format duration to readable string
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Get a display name for the tool call based on payload content
 */
function getToolDisplayName(call: ApiCall): string {
  // If it's a flowise_payload, try to get TC value
  if (call.toolName === 'flowise_payload' && call.responsePayload) {
    const tc = call.responsePayload.TC || call.responsePayload.tc;
    if (tc) {
      return `TC-${tc}`;
    }
  }
  return call.toolName;
}

/**
 * Check if an API call has an error based on status or response payload
 */
function hasApiCallError(call: ApiCall): { hasError: boolean; errorMessage?: string } {
  // Check status field first
  if (call.status === 'failed') {
    return { hasError: true, errorMessage: 'Call failed' };
  }

  // Check response payload for error indicators
  if (call.responsePayload) {
    const payload = call.responsePayload;

    // Check explicit success: false field (common in tool responses)
    if (payload.success === false) {
      // Try to extract error message from common fields
      const errorMsg = payload._debug_error || payload.error || payload.errorMessage || payload.message || 'Operation failed';
      return { hasError: true, errorMessage: typeof errorMsg === 'string' ? errorMsg : 'Operation failed' };
    }

    // Check for _debug_error field (contains HTTP errors like "HTTP 502: Bad Gateway")
    if (payload._debug_error) {
      return { hasError: true, errorMessage: payload._debug_error };
    }

    // Check common error fields
    if (payload.error) {
      return { hasError: true, errorMessage: typeof payload.error === 'string' ? payload.error : 'Error in response' };
    }
    if (payload.errorMessage) {
      return { hasError: true, errorMessage: payload.errorMessage };
    }
    if (payload.ErrorCode && payload.ErrorCode !== '0') {
      return { hasError: true, errorMessage: `Error code: ${payload.ErrorCode}` };
    }
    // Cloud 9 API specific error
    if (payload.ResponseStatus === 'Error' || payload.responseStatus === 'Error') {
      return { hasError: true, errorMessage: payload.ErrorMessage || payload.errorMessage || 'API returned error status' };
    }
    // HTTP status codes
    if (payload.statusCode && payload.statusCode >= 400) {
      return { hasError: true, errorMessage: `HTTP ${payload.statusCode}` };
    }
    if (payload.status && typeof payload.status === 'number' && payload.status >= 400) {
      return { hasError: true, errorMessage: `HTTP ${payload.status}` };
    }
  }

  // No response at all could indicate failure (but not always)
  if (call.status !== 'completed' && !call.responsePayload) {
    return { hasError: true, errorMessage: 'No response received' };
  }

  return { hasError: false };
}

/**
 * Render JSON with patient names as clickable links
 */
function JsonWithPatientLinks({
  data,
  patients
}: {
  data: Record<string, unknown>;
  patients: ExtractedPatient[];
}) {
  const jsonString = JSON.stringify(data, null, 2);

  if (patients.length === 0) {
    return (
      <code className="text-gray-800 dark:text-gray-200">
        {jsonString}
      </code>
    );
  }

  // Create a regex pattern to match patient names and GUIDs
  const patientPatterns = patients.flatMap(p => {
    const patterns = [p.patientGuid];
    if (p.fullName) patterns.push(p.fullName);
    if (p.firstName && p.lastName) {
      patterns.push(`${p.firstName} ${p.lastName}`);
    }
    return patterns;
  });

  // Escape special regex characters
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${patientPatterns.map(escapeRegex).join('|')})`, 'gi');

  // Split by pattern and render with links
  const parts = jsonString.split(pattern);

  return (
    <code className="text-gray-800 dark:text-gray-200">
      {parts.map((part, index) => {
        // Check if this part matches a patient
        const matchedPatient = patients.find(p =>
          p.patientGuid.toLowerCase() === part.toLowerCase() ||
          p.fullName?.toLowerCase() === part.toLowerCase() ||
          (p.firstName && p.lastName && `${p.firstName} ${p.lastName}`.toLowerCase() === part.toLowerCase())
        );

        if (matchedPatient) {
          return (
            <Link
              key={index}
              to={getPatientDetailUrl(matchedPatient.patientGuid)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              title={`View patient: ${matchedPatient.fullName}`}
            >
              {part}
            </Link>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </code>
  );
}

// Node-RED base URL for endpoint display
const NODERED_BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

// Endpoint mappings for display purposes
const TOOL_ENDPOINTS: Record<string, Record<string, string>> = {
  chord_ortho_patient: {
    lookup: `${NODERED_BASE_URL}/ortho-prd/getPatientByFilter`,
    get: `${NODERED_BASE_URL}/ortho-prd/getPatient`,
    create: `${NODERED_BASE_URL}/ortho-prd/createPatient`,
    appointments: `${NODERED_BASE_URL}/ortho-prd/getPatientAppts`,
    clinic_info: `${NODERED_BASE_URL}/ortho-prd/getLocation`,
    edit_insurance: `${NODERED_BASE_URL}/ortho-prd/editInsurance`,
    confirm_appointment: `${NODERED_BASE_URL}/ortho-prd/confirmAppt`,
  },
  schedule_appointment_ortho: {
    slots: `${NODERED_BASE_URL}/ortho-prd/getApptSlots`,
    grouped_slots: `${NODERED_BASE_URL}/ortho-prd/getGroupedApptSlots`,
    book_child: `${NODERED_BASE_URL}/ortho-prd/createAppt`,
    cancel: `${NODERED_BASE_URL}/ortho-prd/cancelAppt`,
  },
};

/**
 * Extract tool name and action from an API call for replay
 */
function extractToolInfoFromApiCall(call: ApiCall): { toolName: string; action: string; endpoint: string; input: Record<string, unknown> } | null {
  // Skip flowise_payload and other non-tool calls
  if (!call.toolName || call.toolName === 'flowise_payload') {
    return null;
  }

  // Supported tools for replay
  const SUPPORTED_TOOLS = ['chord_ortho_patient', 'schedule_appointment_ortho'];
  if (!SUPPORTED_TOOLS.includes(call.toolName)) {
    return null;
  }

  // Extract action from request payload
  const requestPayload = call.requestPayload || {};
  const action = (requestPayload.action as string) || '';

  if (!action) {
    return null;
  }

  // Determine endpoint for display
  const endpoint = TOOL_ENDPOINTS[call.toolName]?.[action] || `${NODERED_BASE_URL}/ortho-prd/${action}`;

  return {
    toolName: call.toolName,
    action,
    endpoint,
    input: requestPayload as Record<string, unknown>,
  };
}

/**
 * Pretty format JSON with syntax highlighting
 */
function PrettyJson({ data }: { data: Record<string, unknown> | string | null | undefined }) {
  if (!data) return null;

  // Parse if it's a string (double-encoded JSON)
  let parsed = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      // If it fails to parse, just show as-is
      return <span className="text-gray-800 dark:text-gray-200">{data}</span>;
    }
  }

  const jsonString = JSON.stringify(parsed, null, 2);

  // Add syntax highlighting
  const highlighted = jsonString
    .replace(/"([^"]+)":/g, '<span class="text-purple-600 dark:text-purple-400">"$1"</span>:') // keys
    .replace(/: "([^"]*)"/g, ': <span class="text-green-600 dark:text-green-400">"$1"</span>') // string values
    .replace(/: (\d+\.?\d*)/g, ': <span class="text-blue-600 dark:text-blue-400">$1</span>') // numbers
    .replace(/: (true|false)/g, ': <span class="text-orange-600 dark:text-orange-400">$1</span>') // booleans
    .replace(/: (null)/g, ': <span class="text-red-600 dark:text-red-400">$1</span>'); // null

  return (
    <code
      className="text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

/**
 * API Call Modal - Full screen popout for viewing API call details
 */
function ApiCallModal({
  call,
  onClose,
}: {
  call: ApiCall;
  onClose: () => void;
}) {
  const [showReplayPanel, setShowReplayPanel] = useState(false);

  const patients = extractPatientsFromApiCall(call);
  const displayName = getToolDisplayName(call);
  const errorInfo = hasApiCallError(call);

  // Extract tool info for replay functionality
  const toolInfo = extractToolInfoFromApiCall(call);
  const canReplay = toolInfo !== null;

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Status color - check for payload errors even if status is "completed"
  const statusColor = errorInfo.hasError
    ? 'text-red-500'
    : call.status === 'completed'
    ? 'text-green-500'
    : call.status === 'failed'
    ? 'text-red-500'
    : 'text-gray-500';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 font-mono">
              {displayName}
            </h2>
            <span className={cn('text-sm font-medium', statusColor)}>
              [{call.status || 'unknown'}]
            </span>
            {/* Error badge in modal */}
            {errorInfo.hasError && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded text-sm font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {errorInfo.errorMessage || 'Error'}
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {call.durationMs !== undefined && call.durationMs !== null
                ? `${call.durationMs}ms`
                : 'N/A'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Timestamp and patients row */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium">Timestamp:</span>{' '}
              <span className="font-mono">{new Date(call.timestamp).toLocaleString()}</span>
            </div>
            {patients.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Patients:</span>
                {patients.map((patient) => (
                  <Link
                    key={patient.patientGuid}
                    to={getPatientDetailUrl(patient.patientGuid)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {patient.fullName}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Request Section */}
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden">
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
              <h3 className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                </svg>
                Request (Input)
              </h3>
            </div>
            <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 overflow-auto max-h-[40vh]">
              {call.requestPayload ? (
                <pre className="font-mono whitespace-pre">
                  <PrettyJson data={call.requestPayload} />
                </pre>
              ) : (
                <div className="text-sm text-amber-600 dark:text-amber-400 italic">
                  No request data available
                </div>
              )}
            </div>
          </div>

          {/* Response Section */}
          <div className="rounded-lg border border-green-200 dark:border-green-800 overflow-hidden">
            <div className="px-4 py-2 bg-green-50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800">
              <h3 className="font-medium text-green-800 dark:text-green-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                Response (Output)
              </h3>
            </div>
            <div className="p-4 bg-green-50/50 dark:bg-green-900/10 overflow-auto max-h-[40vh]">
              {call.responsePayload ? (
                <pre className="font-mono whitespace-pre">
                  <PrettyJson data={call.responsePayload} />
                </pre>
              ) : (
                <div className="text-sm text-green-600 dark:text-green-400 italic">
                  No response data available
                </div>
              )}
            </div>
          </div>

          {/* Error Details Section - show when tool has error info */}
          {(call.errorMessage || call.level === 'ERROR') && (
            <div className="rounded-lg border border-red-300 dark:border-red-700 overflow-hidden">
              <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 border-b border-red-300 dark:border-red-700">
                <h3 className="font-medium text-red-800 dark:text-red-300 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  Error Details
                </h3>
              </div>
              <div className="p-4 bg-red-50/50 dark:bg-red-900/10">
                <pre className="font-mono text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap break-words">
                  {call.errorMessage || 'Tool execution failed (no error message available)'}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* Replay button - only show for supported tools */}
            {canReplay && toolInfo && (
              <button
                onClick={() => setShowReplayPanel(true)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
                title="Re-execute this API call with editable input"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Replay
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Replay Panel Modal */}
      {toolInfo && (
        <ReplayPanel
          isOpen={showReplayPanel}
          onClose={() => setShowReplayPanel(false)}
          toolName={toolInfo.toolName}
          action={toolInfo.action}
          endpoint={toolInfo.endpoint}
          initialInput={toolInfo.input}
        />
      )}
    </div>,
    document.body
  );
}

/**
 * Get a brief preview of the request payload for collapsed view
 */
function getRequestPreview(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';

  // Try to extract meaningful preview from common fields
  const keys = Object.keys(payload);
  if (keys.length === 0) return '';

  // Show first few key-value pairs
  const previewParts: string[] = [];
  for (const key of keys.slice(0, 3)) {
    const value = payload[key];
    if (typeof value === 'string' && value.length < 30) {
      previewParts.push(`${key}: ${value}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      previewParts.push(`${key}: ${value}`);
    } else if (value !== null && value !== undefined) {
      previewParts.push(`${key}: ...`);
    }
  }

  const preview = previewParts.join(', ');
  return preview.length > 60 ? preview.substring(0, 57) + '...' : preview;
}

/**
 * Inline API Call component - compact expandable card for showing API calls in conversation
 * Uses forwardRef to allow parent components to scroll to this element
 */
interface InlineApiCallProps {
  call: ApiCall;
  isExpanded: boolean;
  onToggle: () => void;
}

const InlineApiCall = forwardRef<HTMLDivElement, InlineApiCallProps>(
  function InlineApiCall({ call, isExpanded, onToggle }, ref) {
  const [showModal, setShowModal] = useState(false);

  const patients = extractPatientsFromApiCall(call);
  const displayName = getToolDisplayName(call);
  const errorInfo = hasApiCallError(call);
  const requestPreview = getRequestPreview(call.requestPayload);

  // Status dot color - check for payload errors even if status is "completed"
  // This catches cases like success:false or HTTP 502 errors in the response
  const statusColor = errorInfo.hasError
    ? 'bg-red-500'
    : call.status === 'completed'
    ? 'bg-green-500'
    : call.status === 'failed'
    ? 'bg-red-500'
    : 'bg-gray-500';

  const handlePopout = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowModal(true);
  }, []);

  return (
    <>
      <div ref={ref} className="my-2 ml-4 border-l-2 border-purple-400 dark:border-purple-600 transition-all duration-200">
        {/* Collapsed header */}
        <div
          onClick={onToggle}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors rounded-r',
            'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30'
          )}
        >
          {/* Expand/collapse icon */}
          <svg
            className={cn('w-3.5 h-3.5 text-purple-500 transition-transform flex-shrink-0', isExpanded && 'rotate-90')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* API icon */}
          <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>

          {/* Tool name */}
          <span className="font-mono text-xs font-medium text-purple-700 dark:text-purple-300 flex-shrink-0">
            {displayName}
          </span>

          {/* Status dot */}
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', statusColor)} title={call.status || 'unknown'} />

          {/* Error badge */}
          {errorInfo.hasError && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded text-xs font-medium flex-shrink-0"
              title={errorInfo.errorMessage || 'Error'}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Error
            </span>
          )}

          {/* Request preview (in collapsed view) */}
          {!isExpanded && requestPreview && (
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={requestPreview}>
              ({requestPreview})
            </span>
          )}

          {/* Duration */}
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
            {call.durationMs !== undefined && call.durationMs !== null
              ? `${call.durationMs}ms`
              : 'N/A'}
          </span>

          {/* Patient badges (compact) */}
          {patients.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {patients.slice(0, 1).map((patient) => (
                <Link
                  key={patient.patientGuid}
                  to={getPatientDetailUrl(patient.patientGuid)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  title={`View patient: ${patient.fullName}`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {patient.fullName}
                </Link>
              ))}
              {patients.length > 1 && (
                <span className="text-xs text-gray-500">+{patients.length - 1}</span>
              )}
            </div>
          )}

          {/* Popout button */}
          <button
            onClick={handlePopout}
            className="p-1 hover:bg-purple-200 dark:hover:bg-purple-800 rounded transition-colors flex-shrink-0"
            title="Open in larger window"
          >
            <svg className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

          {/* Timestamp */}
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 font-mono flex-shrink-0">
            {formatTimestamp(call.timestamp)}
          </span>
        </div>

      {/* Expanded content - Request and Response */}
      {isExpanded && (
        <div className="px-3 py-2 bg-white dark:bg-gray-900 border-t border-purple-200 dark:border-purple-800 space-y-3">
          {/* All patients */}
          {patients.length > 0 && (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
              <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase mb-1">
                Patients
              </h4>
              <div className="flex flex-wrap gap-1">
                {patients.map((patient) => (
                  <Link
                    key={patient.patientGuid}
                    to={getPatientDetailUrl(patient.patientGuid)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-900/60"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {patient.fullName}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Request payload - INPUT */}
          <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
            <h4 className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase mb-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
              Request (Input)
            </h4>
            {call.requestPayload ? (
              <pre className="text-xs bg-amber-100/50 dark:bg-amber-900/30 p-2 rounded overflow-x-auto max-h-48 scrollbar-thin">
                <JsonWithPatientLinks data={call.requestPayload} patients={patients} />
              </pre>
            ) : (
              <div className="text-xs text-amber-600 dark:text-amber-400 italic">
                No request data
              </div>
            )}
          </div>

          {/* Response payload - OUTPUT */}
          <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
            <h4 className="text-xs font-medium text-green-700 dark:text-green-300 uppercase mb-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              Response (Output)
            </h4>
            {call.responsePayload ? (
              <pre className="text-xs bg-green-100/50 dark:bg-green-900/30 p-2 rounded overflow-x-auto max-h-48 scrollbar-thin">
                <JsonWithPatientLinks data={call.responsePayload} patients={patients} />
              </pre>
            ) : (
              <div className="text-xs text-green-600 dark:text-green-400 italic">
                No response data
              </div>
            )}
          </div>

          {/* Error Details - inline view */}
          {(call.errorMessage || call.level === 'ERROR') && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-300 dark:border-red-700">
              <h4 className="text-xs font-medium text-red-700 dark:text-red-300 uppercase mb-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Error Details
              </h4>
              <pre className="text-xs text-red-600 dark:text-red-400 bg-red-100/50 dark:bg-red-900/30 p-2 rounded overflow-x-auto max-h-48 scrollbar-thin whitespace-pre-wrap break-words">
                {call.errorMessage || 'Tool execution failed (no error message available)'}
              </pre>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Modal for full-screen view */}
      {showModal && (
        <ApiCallModal call={call} onClose={() => setShowModal(false)} />
      )}
    </>
  );
});

/**
 * Group API calls by the conversation turn they belong to
 * API calls are associated with assistant turns - shown BEFORE the assistant's response
 * Window: from the previous user message until the next user message (or assistant + buffer)
 */
function groupApiCallsByTurn(
  transcript: ConversationTurn[],
  apiCalls: ApiCall[]
): Map<number, ApiCall[]> {
  const grouped = new Map<number, ApiCall[]>();

  if (apiCalls.length === 0 || transcript.length === 0) {
    return grouped;
  }

  // Sort API calls by timestamp
  const sortedApiCalls = [...apiCalls].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Track which API calls have been assigned to prevent duplicates
  const assignedCallIds = new Set<number>();

  // For each assistant turn, find API calls that occurred during its processing
  for (let i = 0; i < transcript.length; i++) {
    const turn = transcript[i];

    // We associate API calls with assistant turns
    if (turn.role === 'assistant') {
      const assistantTime = new Date(turn.timestamp).getTime();

      // Find the previous user turn (window start)
      let windowStart = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (transcript[j].role === 'user') {
          windowStart = new Date(transcript[j].timestamp).getTime();
          break;
        }
      }

      // Find the NEXT user turn (window end boundary) to prevent overlap
      let nextUserTime: number | null = null;
      for (let j = i + 1; j < transcript.length; j++) {
        if (transcript[j].role === 'user') {
          nextUserTime = new Date(transcript[j].timestamp).getTime();
          break;
        }
      }

      // Window end: use the next user message time if available,
      // otherwise use assistant time + small buffer (500ms for concurrent calls)
      // This prevents API calls from the next turn being assigned to this one
      const windowEnd = nextUserTime !== null
        ? nextUserTime
        : assistantTime + 500;

      // Find API calls in this window that haven't been assigned yet
      const turnApiCalls = sortedApiCalls.filter((call) => {
        if (assignedCallIds.has(call.id)) return false;
        const callTime = new Date(call.timestamp).getTime();
        return callTime >= windowStart && callTime < windowEnd;
      });

      if (turnApiCalls.length > 0) {
        grouped.set(i, turnApiCalls);
        // Mark these calls as assigned
        turnApiCalls.forEach(call => assignedCallIds.add(call.id));
      }
    }
  }

  return grouped;
}

/**
 * Represents an API call error with its details
 */
interface ApiCallError {
  callId: number;
  toolName: string;
  errorMessage: string;
  timestamp: string;
}

/**
 * Collect all errors from API calls
 */
function collectApiCallErrors(apiCalls: ApiCall[]): ApiCallError[] {
  const errors: ApiCallError[] = [];

  for (const call of apiCalls) {
    const errorInfo = hasApiCallError(call);
    if (errorInfo.hasError) {
      errors.push({
        callId: call.id,
        toolName: getToolDisplayName(call),
        errorMessage: errorInfo.errorMessage || 'Error',
        timestamp: call.timestamp,
      });
    }
  }

  // Sort by timestamp
  return errors.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function TranscriptViewer({
  transcript,
  apiCalls = [],
  loading,
  testId,
  runId,
  dbId,
  langfuseTraceId,
  langfuseHost,
  langfuseProjectId,
  flowiseSessionId,
  isLive = false,
}: TranscriptViewerProps) {
  // Track which API calls are expanded
  const [expandedApiCalls, setExpandedApiCalls] = useState<Record<number, boolean>>({});
  // Track if IDs are copied
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyErrorField, setCopyErrorField] = useState<string | null>(null);
  // Agent Executor observation ID from Langfuse (for peek parameter in URL)
  const [agentExecutorId, setAgentExecutorId] = useState<string | null>(null);

  // Ref for auto-scrolling during live sessions
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Refs for each API call element (for scrolling to errors)
  const apiCallRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Collect all API call errors
  const apiCallErrors = useMemo(() => collectApiCallErrors(apiCalls), [apiCalls]);

  // Scroll to a specific API call by ID
  const scrollToApiCall = useCallback((callId: number) => {
    const element = apiCallRefs.current.get(callId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Expand the API call so user can see details
      setExpandedApiCalls(prev => ({ ...prev, [callId]: true }));
      // Flash highlight effect
      element.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2');
      }, 2000);
    }
  }, []);

  // Fetch Agent Executor ID from Langfuse when we have a flowiseSessionId
  useEffect(() => {
    if (!flowiseSessionId) {
      setAgentExecutorId(null);
      return;
    }

    const fetchAgentExecutorId = async () => {
      try {
        const response = await fetch(
          `/api/test-monitor/langfuse/session/${encodeURIComponent(flowiseSessionId)}/agent-executor`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.agentExecutorId) {
            setAgentExecutorId(data.data.agentExecutorId);
          }
        }
      } catch (err) {
        console.warn('[TranscriptViewer] Failed to fetch agent executor ID:', err);
      }
    };

    fetchAgentExecutorId();
  }, [flowiseSessionId]);

  // Auto-scroll to bottom when new messages arrive during live sessions
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isLive, transcript.length, apiCalls.length]);

  // Copy to clipboard helper (uses utility with fallback for non-secure contexts)
  const handleCopyToClipboard = useCallback(async (text: string, field: string) => {
    try {
      await copyToClipboard(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      setCopyErrorField(field);
      setTimeout(() => setCopyErrorField(null), 3000);
    }
  }, []);

  // Toggle API call expansion
  const toggleApiCall = (callId: number) => {
    setExpandedApiCalls(prev => ({ ...prev, [callId]: !prev[callId] }));
  };

  // Extract patients from API calls
  const { patients, nameMap } = useMemo(() => {
    const extractedPatients = extractPatientsFromApiCalls(apiCalls);
    const map = buildPatientNameMap(extractedPatients);
    return { patients: extractedPatients, nameMap: map };
  }, [apiCalls]);

  // Group API calls by the conversation turn they belong to
  const apiCallsByTurn = useMemo(() => {
    return groupApiCallsByTurn(transcript, apiCalls);
  }, [transcript, apiCalls]);

  // Calculate start and end times from transcript
  // NOTE: All hooks must be called before any early returns
  const { startTime, endTime, durationMs } = useMemo(() => {
    if (transcript.length === 0) {
      return { startTime: null, endTime: null, durationMs: null };
    }
    const firstTurn = transcript[0];
    const lastTurn = transcript[transcript.length - 1];
    const start = firstTurn?.timestamp ? new Date(firstTurn.timestamp) : null;
    const end = lastTurn?.timestamp ? new Date(lastTurn.timestamp) : null;
    const duration = start && end ? end.getTime() - start.getTime() : null;
    return { startTime: start, endTime: end, durationMs: duration };
  }, [transcript]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No transcript available. Select a test to view its conversation.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-4 p-2">
      {/* Langfuse Session Link - displayed prominently at top */}
      {/* Use flowiseSessionId if available, otherwise fall back to runId */}
      {/* Include peek parameter with agentExecutorId to open the trace directly */}
      {(flowiseSessionId || runId) && langfuseProjectId && (
        <div className="flex items-center gap-2 pb-2 border-b border-orange-200 dark:border-orange-800">
          <a
            href={`${langfuseHost}/project/${langfuseProjectId}/sessions/${flowiseSessionId || runId}${agentExecutorId ? `?peek=${agentExecutorId}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 border border-orange-200 dark:border-orange-700 rounded-lg font-mono text-sm text-orange-700 dark:text-orange-300 transition-colors"
            title={agentExecutorId ? "View Agent Executor trace in Langfuse" : "View session in Langfuse"}
          >
            {/* Langfuse-style icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span className="text-orange-500 dark:text-orange-400">Langfuse:</span>
            <span className="font-semibold">{flowiseSessionId || runId}</span>
            {/* External link icon */}
            <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={() => handleCopyToClipboard(flowiseSessionId || runId || '', 'langfuseSessionId')}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Copy session ID"
          >
            {copiedField === 'langfuseSessionId' ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Database IDs for troubleshooting */}
      {(testId || runId || dbId) && (
        <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-gray-200 dark:border-gray-700 text-sm">
          <span className="text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            DB IDs:
          </span>
          {dbId !== undefined && (
            <button
              onClick={() => handleCopyToClipboard(String(dbId), 'dbId')}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-mono text-gray-600 dark:text-gray-300 transition-colors"
              title="Click to copy DB ID"
            >
              <span className="text-gray-400">id:</span>
              <span>{dbId}</span>
              {copiedField === 'dbId' && <span className="text-green-500 ml-1">✓</span>}
              {copyErrorField === 'dbId' && <span className="text-red-500 ml-1">✗</span>}
            </button>
          )}
          {runId && (
            <button
              onClick={() => handleCopyToClipboard(runId, 'runId')}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-mono text-gray-600 dark:text-gray-300 transition-colors truncate max-w-[200px]"
              title={`Click to copy Run ID: ${runId}`}
            >
              <span className="text-gray-400">run:</span>
              <span className="truncate">{runId.substring(0, 8)}...</span>
              {copiedField === 'runId' && <span className="text-green-500 ml-1">✓</span>}
              {copyErrorField === 'runId' && <span className="text-red-500 ml-1">✗</span>}
            </button>
          )}
          {testId && (
            <button
              onClick={() => handleCopyToClipboard(testId, 'testId')}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-mono text-gray-600 dark:text-gray-300 transition-colors"
              title={`Click to copy Test ID: ${testId}`}
            >
              <span className="text-gray-400">test:</span>
              <span>{testId}</span>
              {copiedField === 'testId' && <span className="text-green-500 ml-1">✓</span>}
              {copyErrorField === 'testId' && <span className="text-red-500 ml-1">✗</span>}
            </button>
          )}
        </div>
      )}

      {/* Execution time summary */}
      {startTime && endTime && (
        <div className="flex items-center gap-4 pb-2 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Start:</span>
            <span className="font-mono text-gray-700 dark:text-gray-300">{formatTimestamp(startTime.toISOString())}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>End:</span>
            <span className="font-mono text-gray-700 dark:text-gray-300">{formatTimestamp(endTime.toISOString())}</span>
          </div>
          {durationMs !== null && (
            <div className="flex items-center gap-1.5">
              <span>Duration:</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">{formatDuration(durationMs)}</span>
            </div>
          )}
        </div>
      )}

      {/* Patient legend if any patients found */}
      {patients.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
            Patients mentioned:
          </span>
          {patients.map((patient) => (
            <Link
              key={patient.patientGuid}
              to={getPatientDetailUrl(patient.patientGuid)}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {patient.fullName}
            </Link>
          ))}
        </div>
      )}

      {/* Error Summary - clickable pills that scroll to the error location */}
      {apiCallErrors.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium text-red-700 dark:text-red-300">
              {apiCallErrors.length} Error{apiCallErrors.length !== 1 ? 's' : ''} Detected
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {apiCallErrors.map((error, idx) => (
              <button
                key={`${error.callId}-${idx}`}
                onClick={() => scrollToApiCall(error.callId)}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded text-xs font-medium transition-colors cursor-pointer"
                title={`Click to scroll to error: ${error.errorMessage}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-mono">{error.toolName}</span>
                <span className="text-red-500 dark:text-red-400">-</span>
                <span className="max-w-[200px] truncate">{error.errorMessage}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {transcript.map((turn, index) => {
        const isUser = turn.role === 'user';
        const turnApiCalls = apiCallsByTurn.get(index) || [];

        // Calculate time since previous message (for user: time since assistant reply)
        let timeSincePreviousMs: number | null = null;
        if (index > 0 && turn.timestamp) {
          const prevTurn = transcript[index - 1];
          if (prevTurn?.timestamp) {
            const currentTime = new Date(turn.timestamp).getTime();
            const prevTime = new Date(prevTurn.timestamp).getTime();
            timeSincePreviousMs = currentTime - prevTime;
          }
        }

        return (
          <div key={index} className="space-y-2">
            {/* Show API calls before assistant message (they happen during processing) */}
            {!isUser && turnApiCalls.length > 0 && (
              <div className="space-y-1">
                {turnApiCalls.map((apiCall) => (
                  <InlineApiCall
                    key={apiCall.id}
                    ref={(el) => {
                      if (el) {
                        apiCallRefs.current.set(apiCall.id, el);
                      } else {
                        apiCallRefs.current.delete(apiCall.id);
                      }
                    }}
                    call={apiCall}
                    isExpanded={expandedApiCalls[apiCall.id] || false}
                    onToggle={() => toggleApiCall(apiCall.id)}
                  />
                ))}
              </div>
            )}

            <div
              className={cn(
                'flex flex-col',
                isUser ? 'items-end' : 'items-start'
              )}
            >
              <div className={cn(
                'max-w-[85%] rounded-lg px-4 py-2',
                isUser
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
              )}>
                <div className="text-sm whitespace-pre-wrap break-words">
                  <TextWithPatientLinks
                    text={turn.content}
                    patients={patients}
                    nameMap={nameMap}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                <span>{isUser ? 'User' : 'Assistant'}</span>
                {turn.timestamp && (
                  <span className="font-mono">{formatTimestamp(turn.timestamp)}</span>
                )}
                {/* Show responseTimeMs for assistant, timeSincePreviousMs for user */}
                {isUser && timeSincePreviousMs !== null && timeSincePreviousMs > 0 && (
                  <span className="text-green-500 dark:text-green-400">({timeSincePreviousMs}ms)</span>
                )}
                {!isUser && turn.responseTimeMs && (
                  <span className="text-blue-500 dark:text-blue-400">({turn.responseTimeMs}ms)</span>
                )}
                {/* Show API call count badge for assistant turns */}
                {!isUser && turnApiCalls.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    {turnApiCalls.length} API call{turnApiCalls.length !== 1 ? 's' : ''}
                  </span>
                )}
                {turn.validationPassed !== undefined && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded',
                    turn.validationPassed
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  )}>
                    {turn.validationPassed ? 'Passed' : 'Failed'}
                  </span>
                )}
              </div>

              {turn.validationMessage && !turn.validationPassed && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-[85%]">
                  {turn.validationMessage}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {/* Invisible element at bottom for auto-scroll targeting */}
      <div ref={bottomRef} />
    </div>
  );
}
