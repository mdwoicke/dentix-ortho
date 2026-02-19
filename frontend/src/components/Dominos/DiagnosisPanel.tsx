import { useState } from 'react';
import { diagnoseOrder } from '../../services/api/dominosApi';
import type {
  DominosDiagnosisResult,
  DiagnosisErrorCategory,
  DiagnosisInvestigationCheck,
} from '../../types/dominos.types';

// ============================================================================
// CATEGORY COLORS
// ============================================================================

const CATEGORY_COLORS: Record<DiagnosisErrorCategory, { bg: string; text: string; border: string }> = {
  INVALID_MENU_ITEM: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-700' },
  INVALID_COUPON: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-700' },
  SERVICE_METHOD_ERROR: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-700' },
  STORE_CLOSED: { bg: 'bg-gray-100 dark:bg-gray-700/50', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300 dark:border-gray-600' },
  TIMEOUT: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700' },
  CODE_BUG: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', border: 'border-red-300 dark:border-red-700' },
  INPUT_VALIDATION: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-800 dark:text-pink-300', border: 'border-pink-300 dark:border-pink-700' },
  ADDRESS_ERROR: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-700' },
  OTHER: { bg: 'bg-gray-100 dark:bg-gray-700/50', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300 dark:border-gray-600' },
};

// ============================================================================
// STATUS ICONS
// ============================================================================

function StatusIcon({ status }: { status: DiagnosisInvestigationCheck['status'] }) {
  switch (status) {
    case 'pass':
      return <span className="text-green-500" title="Pass">&#10003;</span>;
    case 'fail':
      return <span className="text-red-500" title="Fail">&#10007;</span>;
    case 'warn':
      return <span className="text-yellow-500" title="Warning">&#9888;</span>;
    case 'skip':
      return <span className="text-gray-400" title="Skipped">&#8212;</span>;
    case 'error':
      return <span className="text-red-400" title="Error">&#9888;</span>;
    default:
      return <span className="text-gray-400">?</span>;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function DiagnosisPanel({ logId }: { logId: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<DominosDiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnosis = async () => {
    setState('loading');
    setError(null);
    try {
      const data = await diagnoseOrder(logId);
      setResult(data);
      setState('done');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Diagnosis failed';
      setError(msg);
      setState('error');
    }
  };

  // Idle state - show button
  if (state === 'idle') {
    return (
      <div className="mt-4">
        <button
          onClick={runDiagnosis}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Diagnose Error
        </button>
      </div>
    );
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="mt-4 bg-gray-50 dark:bg-gray-900 rounded-md p-4">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm text-gray-600 dark:text-gray-400">Diagnosing error... This may take a moment while we check the menu, replay the order, and test fixes.</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="mt-4 bg-red-50 dark:bg-red-900/20 rounded-md p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={runDiagnosis}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Result state
  if (!result) return null;

  const catColors = CATEGORY_COLORS[result.category] || CATEGORY_COLORS.OTHER;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Error Diagnosis</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{result.durationMs}ms</span>
          <button
            onClick={runDiagnosis}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Re-run
          </button>
        </div>
      </div>

      {/* Category + Confidence */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${catColors.bg} ${catColors.text} ${catColors.border}`}>
          {result.categoryLabel}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {result.confidence}% confidence
        </span>
      </div>

      {/* Root Cause */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{result.rootCause}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{result.explanation}</p>
      </div>

      {/* Investigation Checklist */}
      {result.investigation.checksPerformed.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">Investigation</h5>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-md divide-y divide-gray-200 dark:divide-gray-700">
            {result.investigation.checksPerformed.map((check, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2">
                <span className="mt-0.5"><StatusIcon status={check.status} /></span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{check.label}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 break-words">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Problematic Items */}
      {result.investigation.problematicItems.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">Problematic Items</h5>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-md overflow-hidden">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">Code</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">Reason</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">Alternatives</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {result.investigation.problematicItems.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-mono text-gray-800 dark:text-gray-200">{item.code}</td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{item.reason.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-1.5 font-mono text-green-700 dark:text-green-400">
                      {item.alternatives.length > 0 ? item.alternatives.join(', ') : <span className="text-gray-400 italic">none</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Replay Result */}
      {result.replay.performed && (
        <div>
          <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">Order Replay</h5>
          <div className={`rounded-md p-3 text-sm ${
            result.replay.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : result.replay.sameError
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {result.replay.success
                  ? 'Now succeeds (transient error)'
                  : result.replay.sameError
                    ? 'Still failing (same error)'
                    : 'Different error'}
              </span>
              <span className="text-xs opacity-75">
                {result.replay.statusCode > 0 && `HTTP ${result.replay.statusCode} | `}{result.replay.responseTimeMs}ms
              </span>
            </div>
            {result.replay.errorMessage && (
              <p className="text-xs mt-1 opacity-75">{result.replay.errorMessage}</p>
            )}
          </div>
        </div>
      )}

      {/* Fix Proposal */}
      {result.fixProposal && (
        <div>
          <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">Proposed Fix</h5>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 space-y-2">
            <p className="text-sm text-gray-800 dark:text-gray-200">{result.fixProposal.description}</p>

            {result.fixProposal.changes.length > 0 && (
              <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">Field</th>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">From</th>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {result.fixProposal.changes.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{c.field}</td>
                        <td className="px-3 py-1.5 font-mono text-red-600 dark:text-red-400 line-through">{c.from}</td>
                        <td className="px-3 py-1.5 font-mono text-green-600 dark:text-green-400">{c.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Fix test result */}
            <div className={`rounded px-3 py-2 text-xs ${
              result.fixProposal.testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}>
              <span className="font-medium">
                Fix test: {result.fixProposal.testResult.success ? 'PASSED' : 'FAILED'}
              </span>
              {' | '}
              <span>HTTP {result.fixProposal.testResult.statusCode}</span>
              {' | '}
              <span>{result.fixProposal.testResult.responseTimeMs}ms</span>
              {result.fixProposal.testResult.note && (
                <span className="ml-2 opacity-75">({result.fixProposal.testResult.note})</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resolution Steps */}
      {result.resolution.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">Resolution</h5>
          <ol className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 space-y-1 list-decimal list-inside text-sm text-gray-700 dark:text-gray-300">
            {result.resolution.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
