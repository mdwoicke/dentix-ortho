/**
 * ReplayPanel Component
 * Modal for replaying API tool calls with editable input
 */

import { useState, useCallback } from 'react';
import { cn } from '../../../../utils/cn';
import { copyToClipboard } from '../../../../utils/clipboard';
import { executeReplay } from '../../../../services/api/testMonitorApi';
import type { ReplayResponse } from '../../../../types/testMonitor.types';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  X: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Play: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  AlertCircle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Format: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
    </svg>
  ),
  Loader: () => (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  Terminal: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface ReplayPanelProps {
  isOpen: boolean;
  onClose: () => void;
  toolName: string;
  action: string;
  endpoint: string;
  initialInput: Record<string, unknown>;
  observationId?: string;
}

// ============================================================================
// ENDPOINT MAPPING (mirrors backend replayService.ts)
// Base URL: https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord
// ============================================================================

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

const ENDPOINT_MAP: Record<string, Record<string, string>> = {
  chord_ortho_patient: {
    lookup: `${BASE_URL}/ortho-prd/getPatientByFilter`,
    get: `${BASE_URL}/ortho-prd/getPatient`,
    create: `${BASE_URL}/ortho-prd/createPatient`,
    appointments: `${BASE_URL}/ortho-prd/getPatientAppts`,
    clinic_info: `${BASE_URL}/ortho-prd/getLocation`,
    edit_insurance: `${BASE_URL}/ortho-prd/editInsurance`,
    confirm_appointment: `${BASE_URL}/ortho-prd/confirmAppt`,
  },
  schedule_appointment_ortho: {
    slots: `${BASE_URL}/ortho-prd/getApptSlots`,
    grouped_slots: `${BASE_URL}/ortho-prd/getGroupedApptSlots`,
    book_child: `${BASE_URL}/ortho-prd/createAppt`,
    cancel: `${BASE_URL}/ortho-prd/cancelAppt`,
  },
};

/**
 * Get the endpoint for a tool/action combination
 */
function getEndpointForAction(toolName: string, action: string): string {
  const toolEndpoints = ENDPOINT_MAP[toolName];
  if (!toolEndpoints) {
    return `${BASE_URL}/ortho-prd/${action}`;
  }
  return toolEndpoints[action] || `${BASE_URL}/ortho-prd/${action}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ReplayPanel({
  isOpen,
  onClose,
  toolName,
  action,
  endpoint,
  initialInput,
  observationId,
}: ReplayPanelProps) {
  const [inputText, setInputText] = useState(() => JSON.stringify(initialInput, null, 2));
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ReplayResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  // Get the resolved endpoint
  const resolvedEndpoint = endpoint || getEndpointForAction(toolName, action);

  const handleCopy = useCallback(async (text: string, field: string) => {
    try {
      await copyToClipboard(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const formatInput = useCallback(() => {
    try {
      const parsed = JSON.parse(inputText);
      setInputText(JSON.stringify(parsed, null, 2));
      setParseError(null);
    } catch (e) {
      setParseError('Invalid JSON format');
    }
  }, [inputText]);

  const handleExecute = useCallback(async () => {
    // Parse input
    let parsedInput: Record<string, unknown>;
    try {
      parsedInput = JSON.parse(inputText);
      setParseError(null);
    } catch (e) {
      setParseError('Invalid JSON format - cannot execute');
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const result = await executeReplay({
        toolName,
        action,
        input: parsedInput,
        originalObservationId: observationId,
      });
      setResponse(result);
    } catch (error) {
      setResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputText, toolName, action, observationId]);

  if (!isOpen) return null;

  const responseJson = response?.data?.response
    ? JSON.stringify(response.data.response, null, 2)
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Replay Tool Call
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-xs font-medium">
                  {toolName}
                </span>
                <span className="text-gray-400 dark:text-gray-500">/</span>
                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                  {action}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Icons.X />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-mono">{resolvedEndpoint}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Input Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                INPUT (editable)
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={formatInput}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Format JSON"
                >
                  <Icons.Format />
                  Format
                </button>
                <button
                  onClick={() => handleCopy(inputText, 'input')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  {copiedField === 'input' ? <Icons.CheckCircle /> : <Icons.Copy />}
                  {copiedField === 'input' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setParseError(null);
              }}
              className={cn(
                'w-full h-48 font-mono text-sm p-4 rounded-lg border bg-gray-50 dark:bg-gray-800',
                'text-gray-800 dark:text-gray-200',
                'focus:outline-none focus:ring-2',
                parseError
                  ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                  : 'border-gray-200 dark:border-gray-700 focus:ring-indigo-500'
              )}
              placeholder="Enter JSON input..."
              spellCheck={false}
            />
            {parseError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <Icons.AlertCircle />
                {parseError}
              </p>
            )}
          </div>

          {/* Execute Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleExecute}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all',
                isLoading
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg'
              )}
            >
              {isLoading ? <Icons.Loader /> : <Icons.Play />}
              {isLoading ? 'Executing...' : 'Execute Replay'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Response Section */}
          {response && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    REPLAY RESPONSE
                  </h4>
                  {response.success && response.data && (
                    <>
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        response.data.statusCode >= 200 && response.data.statusCode < 300
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : response.data.statusCode >= 400
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                      )}>
                        {response.data.statusCode}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Duration: {response.data.durationMs}ms
                      </span>
                    </>
                  )}
                </div>
                {responseJson && (
                  <button
                    onClick={() => handleCopy(responseJson, 'response')}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    {copiedField === 'response' ? <Icons.CheckCircle /> : <Icons.Copy />}
                    {copiedField === 'response' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>

              {response.error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <Icons.AlertCircle />
                    <div>
                      <p className="font-medium text-red-700 dark:text-red-300">Error</p>
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">{response.error}</p>
                    </div>
                  </div>
                </div>
              )}

              {responseJson && (
                <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm font-mono text-gray-700 dark:text-gray-300 max-h-80 overflow-auto border border-gray-200 dark:border-gray-700">
                  {responseJson}
                </pre>
              )}

              {response.data && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>Endpoint: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{response.data.endpoint}</code></span>
                  <span>Timestamp: {new Date(response.data.timestamp).toLocaleString()}</span>
                  {response.data.toolVersion && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                      Tool {response.data.toolVersion}
                    </span>
                  )}
                </div>
              )}

              {/* Pre-Call Logs Section */}
              {response.data?.preCallLogs && response.data.preCallLogs.length > 0 && (
                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                  >
                    {showLogs ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                    <Icons.Terminal />
                    Tool Execution Logs ({response.data.preCallLogs.length} entries)
                  </button>
                  {showLogs && (
                    <div className="mt-2 bg-gray-900 dark:bg-black rounded-lg p-3 max-h-48 overflow-auto">
                      <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                        {response.data.preCallLogs.map((log, i) => (
                          <div key={i} className="hover:bg-gray-800/50 py-0.5">
                            {log}
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReplayPanel;
