/**
 * ReplayPanel Component
 * Modal for replaying API tool calls with editable input
 * Supports two modes:
 *   - Direct Replay: existing TypeScript emulator (replayService)
 *   - Harness Mode: VM-based execution of actual tool JavaScript with A/B variant support
 */

import { useState, useCallback, useEffect } from 'react';
import { cn } from '../../../../utils/cn';
import { copyToClipboard } from '../../../../utils/clipboard';
import { executeReplay, executeHarnessReplay, compareHarnessVariants } from '../../../../services/api/testMonitorApi';
import type { ReplayResponse, HarnessResponse, HarnessDebugCall, HarnessCompareResponse } from '../../../../types/testMonitor.types';

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
  Globe: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  ),
  Columns: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

type ReplayMode = 'direct' | 'harness';
type VariantOption = 'production' | 'sandbox_a' | 'sandbox_b';

interface ReplayPanelProps {
  isOpen: boolean;
  onClose: () => void;
  toolName: string;
  action: string;
  endpoint: string;
  initialInput: Record<string, unknown>;
  observationId?: string;
  tenantId?: number; // 1 = Ortho (Cloud9), 5 = Chord (NexHealth)
}

// ============================================================================
// ENDPOINT MAPPING (mirrors backend replayService.ts)
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
  chord_patient_v07_stage: {
    lookup: `${BASE_URL}/getPatientByPhoneNum`,
    get: `${BASE_URL}/getPatient`,
    create: `${BASE_URL}/createPatient`,
    appointments: `${BASE_URL}/getPatientAppts`,
    clinic_info: `${BASE_URL}/getLocation`,
    edit_insurance: `${BASE_URL}/editPatientInsurance`,
    confirm_appointment: `${BASE_URL}/confirmAppt`,
  },
  chord_scheduling_v08: {
    slots: `${BASE_URL}/getApptSlots`,
    grouped_slots: `${BASE_URL}/getGroupedApptSlots`,
    book_child: `${BASE_URL}/createAppt`,
    cancel: `${BASE_URL}/cancelAppt`,
  },
};

function getEndpointForAction(toolName: string, action: string): string {
  const toolEndpoints = ENDPOINT_MAP[toolName];
  if (!toolEndpoints) return `${BASE_URL}/ortho-prd/${action}`;
  return toolEndpoints[action] || `${BASE_URL}/ortho-prd/${action}`;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** HTTP Calls Waterfall - shows each HTTP call from harness debugCalls */
function HttpCallsWaterfall({ calls, onCopy }: { calls: HarnessDebugCall[]; onCopy: (text: string, field: string) => void }) {
  const [expandedCall, setExpandedCall] = useState<number | null>(null);

  if (calls.length === 0) return null;

  return (
    <div className="space-y-1">
      {calls.map((call) => {
        const isExpanded = expandedCall === call.id;
        const statusColor = !call.status ? 'text-gray-400'
          : call.status >= 200 && call.status < 300 ? 'text-green-600 dark:text-green-400'
          : call.status >= 400 ? 'text-red-600 dark:text-red-400'
          : 'text-yellow-600 dark:text-yellow-400';

        // Extract just the path from the full URL for compact display
        let shortPath = call.endpoint;
        try {
          const url = new URL(call.endpoint);
          shortPath = url.pathname.split('/').slice(-2).join('/');
        } catch { /* use full endpoint */ }

        return (
          <div key={call.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedCall(isExpanded ? null : call.id)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-xs text-gray-400 font-mono w-5">#{call.id}</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 w-12">{call.method}</span>
              <span className="text-xs font-mono text-gray-600 dark:text-gray-300 flex-1 truncate">
                {shortPath}
              </span>
              <span className={cn('text-xs font-bold w-8 text-right', statusColor)}>
                {call.status || '---'}
              </span>
              <span className="text-xs text-gray-400 w-16 text-right">
                {call.durationMs != null ? `${call.durationMs}ms` : '---'}
              </span>
              {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
            </button>
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 p-3 space-y-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
                  {call.endpoint}
                </div>
                {call.requestBody && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Request Body</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCopy(JSON.stringify(call.requestBody, null, 2), `req-${call.id}`); }}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-900 rounded p-2 max-h-32 overflow-auto text-gray-700 dark:text-gray-300">
                      {JSON.stringify(call.requestBody, null, 2)}
                    </pre>
                  </div>
                )}
                {call.response && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Response</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCopy(JSON.stringify(call.response, null, 2), `res-${call.id}`); }}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-900 rounded p-2 max-h-32 overflow-auto text-gray-700 dark:text-gray-300">
                      {JSON.stringify(call.response, null, 2)}
                    </pre>
                  </div>
                )}
                {call.error && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    Error: {call.error}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Compare View - side by side diff of two harness results */
function CompareView({ data, onClose }: { data: HarnessCompareResponse; onClose: () => void }) {
  const [resultA, resultB] = data.results;
  if (!resultA || !resultB) return null;

  const responseA = resultA.response.data?.response;
  const responseB = resultB.response.data?.response;
  const jsonA = responseA ? JSON.stringify(responseA, null, 2) : 'No response';
  const jsonB = responseB ? JSON.stringify(responseB, null, 2) : 'No response';

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Icons.Columns />
          COMPARE RESULTS
        </h4>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          Close
        </button>
      </div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {[resultA, resultB].map((r, i) => (
          <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'px-2 py-0.5 rounded text-xs font-bold',
                r.variant === 'production'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              )}>
                {r.variant}
              </span>
              {r.response.data?.toolVersion && (
                <span className="text-xs text-gray-500">{r.response.data.toolVersion}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
              <div>Duration: {r.response.data?.durationMs ?? '---'}ms</div>
              <div>HTTP Calls: {r.response.data?.debugCalls?.length ?? 0}</div>
              <div>Status: {r.response.success ? 'Success' : 'Error'}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Side by side JSON */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{resultA.variant}</div>
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-60 overflow-auto border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
            {jsonA}
          </pre>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{resultB.variant}</div>
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-60 overflow-auto border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
            {jsonB}
          </pre>
        </div>
      </div>
    </div>
  );
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
  tenantId,
}: ReplayPanelProps) {
  const [inputText, setInputText] = useState(() => JSON.stringify(initialInput, null, 2));
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  // Mode & variant state
  const [mode, setMode] = useState<ReplayMode>('direct');
  const [variant, setVariant] = useState<VariantOption>('production');

  // Response state — separate for each mode to preserve both
  const [directResponse, setDirectResponse] = useState<ReplayResponse | null>(null);
  const [harnessResponse, setHarnessResponse] = useState<HarnessResponse | null>(null);
  const [showHttpCalls, setShowHttpCalls] = useState(true);

  // Compare state
  const [isComparing, setIsComparing] = useState(false);
  const [compareData, setCompareData] = useState<HarnessCompareResponse | null>(null);
  const [compareVariant, setCompareVariant] = useState<VariantOption>('sandbox_b');

  // Get the resolved endpoint
  const resolvedEndpoint = endpoint || getEndpointForAction(toolName, action);

  // Clear responses when mode or variant changes
  useEffect(() => {
    // Don't clear — let the user see the last response while switching
  }, [mode, variant]);

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
    } catch {
      setParseError('Invalid JSON format');
    }
  }, [inputText]);

  const handleExecute = useCallback(async () => {
    let parsedInput: Record<string, unknown>;
    try {
      parsedInput = JSON.parse(inputText);
      setParseError(null);
    } catch {
      setParseError('Invalid JSON format - cannot execute');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'direct') {
        const result = await executeReplay({
          toolName,
          action,
          input: parsedInput,
          originalObservationId: observationId,
          tenantId,
        });
        setDirectResponse(result);
      } else {
        const result = await executeHarnessReplay({
          toolName,
          action,
          input: parsedInput,
          variant,
          tenantId,
          observationId,
        });
        setHarnessResponse(result);
      }
    } catch (error: unknown) {
      const errObj = error as Record<string, unknown>;
      const message = error instanceof Error
        ? error.message
        : (errObj?.message as string) || (errObj?.error as string) || JSON.stringify(error);

      if (mode === 'direct') {
        setDirectResponse({ success: false, error: message });
      } else {
        setHarnessResponse({ success: false, error: message });
      }
    } finally {
      setIsLoading(false);
    }
  }, [inputText, toolName, action, observationId, tenantId, mode, variant]);

  const handleCompare = useCallback(async () => {
    let parsedInput: Record<string, unknown>;
    try {
      parsedInput = JSON.parse(inputText);
    } catch {
      setParseError('Invalid JSON format');
      return;
    }

    setIsComparing(true);
    setCompareData(null);

    try {
      const result = await compareHarnessVariants({
        toolName,
        action,
        input: parsedInput,
        variantA: 'production',
        variantB: compareVariant,
        tenantId,
        observationId,
      });
      setCompareData(result);
    } catch (error: unknown) {
      const errObj = error as Record<string, unknown>;
      const message = error instanceof Error
        ? error.message
        : (errObj?.message as string) || (errObj?.error as string) || 'Compare failed';
      setCompareData({ success: false, results: [] });
      setHarnessResponse({ success: false, error: `Compare failed: ${message}` });
    } finally {
      setIsComparing(false);
    }
  }, [inputText, toolName, action, tenantId, observationId, compareVariant]);

  if (!isOpen) return null;

  // Get the active response based on current mode
  const response = mode === 'direct' ? directResponse : harnessResponse;
  const responseJson = response?.data?.response
    ? JSON.stringify(response.data.response, null, 2)
    : null;

  // Harness-specific data
  const harnessData = mode === 'harness' ? harnessResponse?.data : null;

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
                {tenantId === 5 && (
                  <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded text-xs font-medium">
                    Chord (NexHealth)
                  </span>
                )}
                {(!tenantId || tenantId === 1) && (
                  <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs font-medium">
                    Ortho (Cloud9)
                  </span>
                )}
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
            <span className="font-mono">{response?.data?.endpoint || resolvedEndpoint}</span>
          </div>

          {/* Mode Toggle + Variant Selector */}
          <div className="mt-3 flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setMode('direct')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                  mode === 'direct'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Direct Replay
              </button>
              <button
                onClick={() => setMode('harness')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                  mode === 'harness'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Harness Mode
              </button>
            </div>

            {/* Variant selector (harness mode only) */}
            {mode === 'harness' && (
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value as VariantOption)}
                className="text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="production">Production</option>
                <option value="sandbox_a">Sandbox A</option>
                <option value="sandbox_b">Sandbox B</option>
              </select>
            )}

            {/* Variant badge (harness mode with response) */}
            {mode === 'harness' && harnessData && (
              <span className={cn(
                'px-2 py-0.5 rounded text-xs font-medium',
                harnessData.variant === 'production'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              )}>
                {harnessData.variant} {harnessData.toolVersion || ''}
              </span>
            )}
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

          {/* Execute + Compare Buttons */}
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
              {isLoading ? 'Executing...' : mode === 'direct' ? 'Execute Replay' : 'Execute Harness'}
            </button>

            {/* Compare button (harness mode only) */}
            {mode === 'harness' && (
              <>
                <select
                  value={compareVariant}
                  onChange={(e) => setCompareVariant(e.target.value as VariantOption)}
                  className="text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="sandbox_a">vs Sandbox A</option>
                  <option value="sandbox_b">vs Sandbox B</option>
                </select>
                <button
                  onClick={handleCompare}
                  disabled={isComparing || isLoading}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all border',
                    isComparing
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed border-gray-200 dark:border-gray-700'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  )}
                >
                  {isComparing ? <Icons.Loader /> : <Icons.Columns />}
                  {isComparing ? 'Comparing...' : 'Compare'}
                </button>
              </>
            )}

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
                    {mode === 'direct' ? 'REPLAY RESPONSE' : 'HARNESS RESPONSE'}
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

              {/* HTTP Calls Waterfall (Harness mode only) */}
              {harnessData?.debugCalls && harnessData.debugCalls.length > 0 && (
                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <button
                    onClick={() => setShowHttpCalls(!showHttpCalls)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                  >
                    {showHttpCalls ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                    <Icons.Globe />
                    HTTP Calls ({harnessData.debugCalls.length})
                    <span className="text-xs text-gray-400 font-normal ml-1">
                      Total: {harnessData.debugCalls.reduce((sum, c) => sum + (c.durationMs || 0), 0)}ms
                    </span>
                  </button>
                  {showHttpCalls && (
                    <div className="mt-2">
                      <HttpCallsWaterfall calls={harnessData.debugCalls} onCopy={handleCopy} />
                    </div>
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

              {/* Compare View */}
              {compareData && compareData.success && (
                <CompareView data={compareData} onClose={() => setCompareData(null)} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReplayPanel;
