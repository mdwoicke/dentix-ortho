/**
 * Trace Analysis Page
 * Interactive session investigation UI with trace tree, transcript, intent classification, and tool sequence.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Button, Card, Spinner } from '../../components/ui';
import {
  getTraceAnalysis,
  diagnoseProductionTrace,
  type TraceAnalysisResponse,
  type TraceAnalysisTranscriptTurn,
  type TraceAnalysisToolStep,
  type DiagnosisResult,
} from '../../services/api/testMonitorApi';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  AlertCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function getIntentBadgeColor(type: string): string {
  switch (type) {
    case 'schedule_appointment':
      return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300';
    case 'reschedule':
      return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
    case 'cancel':
      return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
    case 'inquiry':
      return 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300';
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  }
}

function getStepStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return <span className="text-green-500"><Icons.Check /></span>;
    case 'failure':
      return <span className="text-red-500"><Icons.X /></span>;
    case 'skipped':
      return <span className="text-gray-400"><Icons.Clock /></span>;
    default:
      return <span className="text-gray-300"><Icons.Clock /></span>;
  }
}

function getStepStatusBadge(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
    case 'failure':
      return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
    case 'skipped':
      return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
    default:
      return 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500';
  }
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
  if (confidence >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getVerificationBadge(status: string): { color: string; label: string } {
  switch (status) {
    case 'fulfilled':
      return { color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300', label: 'Fulfilled' };
    case 'partially_fulfilled':
      return { color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300', label: 'Partially Fulfilled' };
    case 'not_fulfilled':
      return { color: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300', label: 'Not Fulfilled' };
    default:
      return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', label: 'Unknown' };
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TraceList({ traces }: { traces: TraceAnalysisResponse['traces'] }) {
  if (traces.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No traces found.</p>;
  }

  return (
    <div className="space-y-2">
      {traces.map((trace, idx) => (
        <div
          key={trace.traceId}
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
        >
          <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {trace.name || 'Unnamed trace'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {trace.traceId}
            </div>
          </div>
          <div className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {formatTimestamp(trace.timestamp)}
          </div>
        </div>
      ))}
    </div>
  );
}

function IntentCard({ intent }: { intent: TraceAnalysisResponse['intent'] }) {
  if (!intent) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Icons.AlertCircle />
        <span>Intent classification unavailable (LLM may not have been reachable)</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`px-3 py-1 text-sm font-medium rounded-full ${getIntentBadgeColor(intent.type)}`}>
          {intent.type.replace(/_/g, ' ')}
        </span>
        <span className={`text-sm font-medium ${getConfidenceColor(intent.confidence)}`}>
          {(intent.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">{intent.summary}</p>
      {intent.bookingDetails && (
        <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Booking Details
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {intent.bookingDetails.patientName && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Patient:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.patientName}</span>
              </div>
            )}
            {intent.bookingDetails.appointmentType && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Type:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.appointmentType}</span>
              </div>
            )}
            {intent.bookingDetails.requestedDate && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Date:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.requestedDate}</span>
              </div>
            )}
            {intent.bookingDetails.requestedTime && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Time:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.requestedTime}</span>
              </div>
            )}
            {intent.bookingDetails.location && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Location:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.location}</span>
              </div>
            )}
            {intent.bookingDetails.isNewPatient !== undefined && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">New Patient:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.isNewPatient ? 'Yes' : 'No'}</span>
              </div>
            )}
            {intent.bookingDetails.childName && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Child:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.childName}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TranscriptView({ transcript }: { transcript: TraceAnalysisTranscriptTurn[] }) {
  if (transcript.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No transcript available.</p>;
  }

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
      {transcript.map((turn, idx) => {
        const isUser = turn.role === 'user';
        const isTool = turn.role === 'tool';

        return (
          <div
            key={idx}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                isUser
                  ? 'bg-blue-500 text-white'
                  : isTool
                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              <div className={`text-xs font-medium mb-1 ${
                isUser ? 'text-blue-100' : isTool ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
              }`}>
                {turn.role === 'user' ? 'Caller' : turn.role === 'tool' ? 'Tool' : 'Assistant'}
                {turn.timestamp && (
                  <span className="ml-2 font-normal opacity-75">{formatTimestamp(turn.timestamp)}</span>
                )}
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">{turn.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToolSequenceView({ toolSequence }: { toolSequence: TraceAnalysisResponse['toolSequence'] }) {
  if (!toolSequence) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Icons.AlertCircle />
        <span>Tool sequence unavailable (requires intent classification)</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Completion rate bar */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">Completion:</span>
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              toolSequence.completionRate >= 0.8
                ? 'bg-green-500'
                : toolSequence.completionRate >= 0.5
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${toolSequence.completionRate * 100}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {(toolSequence.completionRate * 100).toFixed(0)}%
        </span>
      </div>

      {toolSequence.summary && (
        <p className="text-sm text-gray-600 dark:text-gray-400">{toolSequence.summary}</p>
      )}

      {/* Steps */}
      <div className="space-y-2">
        {toolSequence.steps.map((step: TraceAnalysisToolStep) => (
          <div
            key={step.step}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
          >
            <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold">
              {step.step}
            </span>
            <div className="flex-shrink-0">{getStepStatusIcon(step.status)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {step.name}
                {step.optional && (
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(optional)</span>
                )}
              </div>
              {step.details && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.details}</div>
              )}
            </div>
            <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${getStepStatusBadge(step.status)}`}>
              {step.status}
            </span>
            {step.durationMs !== undefined && (
              <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VerificationCard({ verification }: { verification: TraceAnalysisResponse['verification'] }) {
  if (!verification) return null;

  const badge = getVerificationBadge(verification.status);

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icons.Shield />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Fulfillment Verification</h3>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.color}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{verification.summary}</p>
        {verification.evidence && verification.evidence.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Evidence</div>
            {verification.evidence.map((ev, idx) => (
              <div key={idx} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">{ev.source}:</span>
                <span>{ev.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function DiagnosticReportCard({ diagnosis }: { diagnosis: DiagnosisResult }) {
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icons.AlertCircle />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Diagnostic Report</h3>
          {diagnosis.fixesGenerated > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
              {diagnosis.fixesGenerated} fix{diagnosis.fixesGenerated !== 1 ? 'es' : ''} generated
            </span>
          )}
        </div>

        {/* Summary message */}
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{diagnosis.message}</p>

        {/* Analysis details */}
        {diagnosis.analysis && (
          <div className="space-y-3">
            {diagnosis.analysis.rootCause && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Root Cause</div>
                <p className="text-sm text-red-800 dark:text-red-300">{diagnosis.analysis.rootCause}</p>
              </div>
            )}
            {diagnosis.analysis.summary && (
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Summary</div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{diagnosis.analysis.summary}</p>
              </div>
            )}
            {diagnosis.analysis.issues && diagnosis.analysis.issues.length > 0 && (
              <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-1">Issues Found</div>
                <ul className="space-y-1">
                  {diagnosis.analysis.issues.map((issue, idx) => (
                    <li key={idx} className="text-sm text-yellow-800 dark:text-yellow-300 flex gap-2">
                      <span className="text-yellow-500">-</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Root cause breakdown from summary */}
        {diagnosis.summary?.rootCauseBreakdown && Object.keys(diagnosis.summary.rootCauseBreakdown).length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Root Cause Breakdown</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(diagnosis.summary.rootCauseBreakdown).map(([cause, count]) => (
                <div key={cause} className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{cause}:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          {diagnosis.provider && <span>Provider: {diagnosis.provider}</span>}
          {diagnosis.durationMs && <span>Duration: {(diagnosis.durationMs / 1000).toFixed(1)}s</span>}
          {diagnosis.runId && <span className="font-mono">Run: {diagnosis.runId}</span>}
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function TraceAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [sessionIdInput, setSessionIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TraceAnalysisResponse | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);

  const analyzeSession = useCallback(async (sessionId: string, opts?: { force?: boolean; verify?: boolean }) => {
    if (!sessionId.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setDiagnosisResult(null);
      const data = await getTraceAnalysis(sessionId.trim(), {
        force: opts?.force,
        verify: opts?.verify,
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze session');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep linking: read ?sessionId from URL on mount
  useEffect(() => {
    const sessionIdParam = searchParams.get('sessionId');
    if (sessionIdParam) {
      setSessionIdInput(sessionIdParam);
      analyzeSession(sessionIdParam);
      // Clear URL param after reading
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzeSession(sessionIdInput);
  };

  const handleRefresh = () => {
    if (result?.sessionId) {
      analyzeSession(result.sessionId, { force: true });
    }
  };

  const handleVerify = async () => {
    if (!result?.sessionId) return;
    try {
      setVerifyLoading(true);
      setError(null);
      const data = await getTraceAnalysis(result.sessionId, { verify: true, force: true });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleDiagnose = async () => {
    if (!result?.traces?.length) return;
    const traceId = result.traces[0].traceId;
    try {
      setDiagnoseLoading(true);
      setError(null);
      const data = await diagnoseProductionTrace(traceId);
      setDiagnosisResult(data);
    } catch (err: any) {
      setError(err.message || 'Diagnosis failed');
    } finally {
      setDiagnoseLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 overflow-auto h-full">
      <PageHeader
        title="Trace Analysis"
        subtitle="Investigate production sessions with intent classification, tool sequence mapping, and fulfillment verification"
      />

      {/* Search Bar */}
      <Card>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={sessionIdInput}
                onChange={(e) => setSessionIdInput(e.target.value)}
                placeholder="Enter session ID (e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890)"
                className="block w-full px-4 py-2.5 pl-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Icons.Search />
              </div>
            </div>
            <Button type="submit" disabled={loading || !sessionIdInput.trim()}>
              {loading ? <Spinner size="sm" /> : <Icons.Search />}
              <span className="ml-2">Analyze</span>
            </Button>
            {result && (
              <>
                <Button variant="secondary" onClick={handleRefresh} disabled={loading} title="Force re-analyze (bypass cache)">
                  {loading ? <Spinner size="sm" /> : <Icons.Refresh />}
                </Button>
                <Button variant="secondary" onClick={handleVerify} disabled={verifyLoading || loading} title="Run fulfillment verification">
                  {verifyLoading ? <Spinner size="sm" /> : <Icons.Shield />}
                  <span className="ml-1">Verify</span>
                </Button>
                <Button variant="secondary" onClick={handleDiagnose} disabled={diagnoseLoading || loading || !result.traces?.length} title="Diagnose & generate fixes">
                  {diagnoseLoading ? <Spinner size="sm" /> : <Icons.AlertCircle />}
                  <span className="ml-1">Diagnose</span>
                </Button>
              </>
            )}
          </div>
        </form>
      </Card>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
          <Icons.AlertCircle />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && !result && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Analyzing session...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Metadata bar */}
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-mono">{result.sessionId}</span>
            <span>{result.traces.length} trace(s)</span>
            <span>{result.transcript.length} turn(s)</span>
            <span>Analyzed: {formatTimestamp(result.analyzedAt)}</span>
            {result.cached && (
              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full">
                cached
              </span>
            )}
          </div>

          {/* Verification (if present) */}
          {result.verification && <VerificationCard verification={result.verification} />}

          {/* Diagnostic Report (if present) */}
          {diagnosisResult && <DiagnosticReportCard diagnosis={diagnosisResult} />}

          {/* Intent Classification */}
          <Card>
            <div className="p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Intent Classification</h3>
              <IntentCard intent={result.intent} />
            </div>
          </Card>

          {/* Two-column layout for traces and tool sequence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trace List */}
            <Card>
              <div className="p-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                  Traces ({result.traces.length})
                </h3>
                <TraceList traces={result.traces} />
              </div>
            </Card>

            {/* Tool Sequence */}
            <Card>
              <div className="p-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Tool Sequence</h3>
                <ToolSequenceView toolSequence={result.toolSequence} />
              </div>
            </Card>
          </div>

          {/* Transcript */}
          <Card>
            <div className="p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                Transcript ({result.transcript.length} turns)
              </h3>
              <TranscriptView transcript={result.transcript} />
            </div>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <Icons.Search />
          <p className="mt-3 text-lg font-medium">Enter a session ID to begin analysis</p>
          <p className="mt-1 text-sm">You can also deep-link with ?sessionId=xxx in the URL</p>
        </div>
      )}
    </div>
  );
}
