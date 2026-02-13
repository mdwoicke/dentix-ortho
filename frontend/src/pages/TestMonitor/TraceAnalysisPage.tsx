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
  checkSlotAvailability,
  bookCorrection,
  cancelCorrection,
  rescheduleCorrection,
  getCorrectionHistory,
  type TraceAnalysisResponse,
  type TraceAnalysisTranscriptTurn,
  type TraceAnalysisStepStatus,
  type DiagnosisResult,
  type CallReport,
  type CurrentBookingData,
  type SlotAlternative,
  type SlotCheckResult,
  type CorrectionResult,
  type CallReportBookingResult,
  type BookingCorrectionRecord,
  type CurrentBookingChild,
  type IntentDeliveryComparison,
  type ChildComparison,
} from '../../services/api/testMonitorApi';
import { GuidCopyButton } from '../../components/ui/GuidCopyButton';
import { getLangfuseConfigs } from '../../services/api/appSettingsApi';
import type { LangfuseConfigProfile } from '../../types/appSettings.types';

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
  Calendar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
    case 'completed':
      return <span className="text-green-500"><Icons.Check /></span>;
    case 'failed':
      return <span className="text-red-500"><Icons.X /></span>;
    case 'missing':
      return <span className="text-gray-400"><Icons.Clock /></span>;
    default:
      return <span className="text-gray-300"><Icons.Clock /></span>;
  }
}

function getStepStatusBadge(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
    case 'failed':
      return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
    case 'missing':
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
    case 'verified':
      return { color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300', label: 'Verified' };
    case 'partial':
      return { color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300', label: 'Partial' };
    case 'failed':
      return { color: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300', label: 'Failed' };
    case 'no_claims':
      return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', label: 'No Claims' };
    default:
      return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', label: 'Unknown' };
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

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
            {intent.bookingDetails.parentName && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Parent:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.parentName}</span>
              </div>
            )}
            {intent.bookingDetails.parentPhone && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Phone:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.parentPhone}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500 dark:text-gray-400">Children:</span>{' '}
              <span className="text-gray-900 dark:text-white">{intent.bookingDetails.childCount}</span>
            </div>
            {intent.bookingDetails.childNames.length > 0 && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Names:</span>{' '}
                <span className="text-gray-900 dark:text-white">{intent.bookingDetails.childNames.join(', ')}</span>
              </div>
            )}
            {intent.bookingDetails.requestedDates.length > 0 && (
              <div className="col-span-2">
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="text-blue-500 mr-1">{'\u{1F4C5}'}</span>
                  Intended Booking Date{intent.bookingDetails.requestedDates.length > 1 ? 's' : ''}:
                </span>{' '}
                <span className="text-gray-900 dark:text-white font-medium">{intent.bookingDetails.requestedDates.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// INTENT VS DELIVERY COMPARISON CARD
// ============================================================================

function getComparisonStatusBadge(status: IntentDeliveryComparison['overallStatus']): { color: string; label: string; icon: string } {
  switch (status) {
    case 'match':
      return { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', label: 'All Fulfilled', icon: '\u2713' };
    case 'partial':
      return { color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', label: 'Partial Match', icon: '\u26A0' };
    case 'mismatch':
      return { color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', label: 'Mismatch', icon: '\u2717' };
    case 'pending':
      return { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', label: 'Pending', icon: '\u23F3' };
    default:
      return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', label: 'Unknown', icon: '?' };
  }
}

function getChildStatusBadge(status: ChildComparison['status']): { color: string; label: string; icon: string } {
  switch (status) {
    case 'match':
      return { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', label: 'Match', icon: '\u2713' };
    case 'date_mismatch':
      return { color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', label: 'Date Mismatch', icon: '\u26A0' };
    case 'failed':
      return { color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', label: 'Failed', icon: '\u2717' };
    case 'queued':
      return { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', label: 'Queued', icon: '\u23F3' };
    case 'not_attempted':
      return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', label: 'Not Attempted', icon: '\u2014' };
    default:
      return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', label: 'Unknown', icon: '?' };
  }
}

function IntentDeliveryComparisonCard({ comparison }: { comparison: IntentDeliveryComparison }) {
  const overallBadge = getComparisonStatusBadge(comparison.overallStatus);

  return (
    <Card>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icons.Calendar />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Intent vs Delivery</h3>
          </div>
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${overallBadge.color}`}>
            {overallBadge.icon} {overallBadge.label}
          </span>
        </div>

        {/* Children Comparison Table */}
        {comparison.children.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Child</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Caller Requested</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">System Delivered</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {comparison.children.map((child, idx) => {
                  const statusBadge = getChildStatusBadge(child.status);
                  return (
                    <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
                      {/* Child Name */}
                      <td className="py-3 pr-4">
                        <span className="font-medium text-gray-900 dark:text-white">{child.childName}</span>
                      </td>

                      {/* Requested */}
                      <td className="py-3 pr-4">
                        <div className="text-gray-900 dark:text-white">{child.requested.name}</div>
                        {child.requested.date && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                            <span className="text-blue-500">{'\u{1F4C5}'}</span> {child.requested.date}
                          </div>
                        )}
                      </td>

                      {/* Delivered */}
                      <td className="py-3 pr-4">
                        {child.delivered.appointmentBooked ? (
                          <div>
                            <div className="text-green-600 dark:text-green-400 font-medium">{'\u2713'} Booked</div>
                            {child.delivered.actualSlot && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                                <span className="text-blue-500">{'\u{1F4C5}'}</span> {child.delivered.actualSlot}
                              </div>
                            )}
                          </div>
                        ) : child.status === 'queued' ? (
                          <div className="text-blue-600 dark:text-blue-400 font-medium">{'\u23F3'} Queued</div>
                        ) : (
                          <div>
                            <div className="text-red-600 dark:text-red-400 font-medium">{'\u2717'} Not Booked</div>
                            {child.delivered.error && (
                              <div className="text-xs text-red-500 dark:text-red-400 mt-0.5">{child.delivered.error}</div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3">
                        <div>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.color}`}>
                            {statusBadge.icon} {statusBadge.label}
                          </span>
                          {child.discrepancy && child.status !== 'match' && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[200px]">
                              {child.discrepancy}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Transfer Comparison */}
        {comparison.transfer && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Transfer:</span>
              <span className="text-gray-900 dark:text-white">
                {comparison.transfer.requested ? 'Requested' : 'Not Requested'}
              </span>
              <span className="text-gray-400">{'\u2192'}</span>
              <span className="text-gray-900 dark:text-white">
                {comparison.transfer.delivered ? 'Transferred' : 'Not Transferred'}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                comparison.transfer.status === 'match'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}>
                {comparison.transfer.status === 'match' ? '\u2713 Match' : '\u2717 Mismatch'}
              </span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {comparison.children.length === 0 && !comparison.transfer && (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No booking intent or transfer data to compare.
          </div>
        )}
      </div>
    </Card>
  );
}

type TranscriptFilter = 'all' | 'caller' | 'agent';

function TranscriptView({ transcript }: { transcript: TraceAnalysisTranscriptTurn[] }) {
  const [filter, setFilter] = useState<TranscriptFilter>('all');

  if (!transcript || transcript.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No transcript available.</p>;
  }

  // Filter transcript based on selection
  const filteredTranscript = transcript.filter((turn) => {
    if (filter === 'all') return true;
    if (filter === 'caller') return turn.role === 'user';
    if (filter === 'agent') return turn.role === 'assistant' || turn.role === 'tool';
    return true;
  });

  // Count messages by role
  const callerCount = transcript.filter(t => t.role === 'user').length;
  const agentCount = transcript.filter(t => t.role === 'assistant' || t.role === 'tool').length;

  return (
    <div className="space-y-3">
      {/* Filter Toggle */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Show:</span>
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            filter === 'all'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Both ({transcript.length})
        </button>
        <button
          onClick={() => setFilter('caller')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            filter === 'caller'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Caller ({callerCount})
        </button>
        <button
          onClick={() => setFilter('agent')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            filter === 'agent'
              ? 'bg-gray-700 dark:bg-gray-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Agent ({agentCount})
        </button>
      </div>

      {/* Transcript Messages */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {filteredTranscript.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
            No messages match the selected filter.
          </p>
        ) : (
          filteredTranscript.map((turn, idx) => {
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
                    {turn.role === 'user' ? 'Caller' : turn.role === 'tool' ? 'Tool' : 'Agent'}
                    {turn.timestamp && (
                      <span className="ml-2 font-normal opacity-75">{formatTimestamp(turn.timestamp)}</span>
                    )}
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">{turn.content}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
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
              (toolSequence.completionRate ?? 0) >= 0.8
                ? 'bg-green-500'
                : (toolSequence.completionRate ?? 0) >= 0.5
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${(toolSequence.completionRate ?? 0) * 100}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {((toolSequence.completionRate ?? 0) * 100).toFixed(0)}%
        </span>
      </div>

      {/* Step statuses */}
      <div className="space-y-2">
        {(toolSequence.stepStatuses || []).map((ss: TraceAnalysisStepStatus, idx: number) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
          >
            <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold">
              {idx + 1}
            </span>
            <div className="flex-shrink-0">{getStepStatusIcon(ss.status)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {ss.step.description}
                {ss.step.optional && (
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(optional)</span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {ss.actualCount}/{ss.expectedCount} calls
                {ss.step.occurrences === 'per_child' && ' (per child)'}
              </div>
              {ss.errors.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {ss.errors.map((err, ei) => (
                    <div key={ei} className="text-xs text-red-600 dark:text-red-400">{err}</div>
                  ))}
                </div>
              )}
            </div>
            <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${getStepStatusBadge(ss.status)}`}>
              {ss.status}
            </span>
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
        {verification.childVerifications && verification.childVerifications.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Per-Child Results</div>
            {verification.childVerifications.map((cv, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{cv.childName}</span>
                <span className={`px-1.5 py-0.5 text-xs rounded ${cv.patientRecordStatus === 'pass' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : cv.patientRecordStatus === 'fail' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                  Patient: {cv.patientRecordStatus}
                </span>
                <span className={`px-1.5 py-0.5 text-xs rounded ${cv.appointmentRecordStatus === 'pass' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : cv.appointmentRecordStatus === 'fail' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                  Appt: {cv.appointmentRecordStatus}
                </span>
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
// CALL REPORT CARD
// ============================================================================

function CallReportCard({ report }: { report: CallReport }) {
  const statusColor = {
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    partial: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    none: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  };

  const toolStatusDot = (status: string) => {
    if (status === 'success') return '🟢';
    if (status === 'partial') return '🟡';
    return '🔴';
  };

  return (
    <Card>
      <div className="p-4 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Call Trace Report</h3>

        {/* Caller Info */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {report.callerName && (
            <div><span className="text-gray-500 dark:text-gray-400">Caller:</span> <span className="font-medium text-gray-900 dark:text-white">{report.callerName}</span></div>
          )}
          {report.callerPhone && (
            <div><span className="text-gray-500 dark:text-gray-400">Phone:</span> <span className="font-mono text-gray-900 dark:text-white">{report.callerPhone}</span></div>
          )}
          {report.callerEmail && (
            <div><span className="text-gray-500 dark:text-gray-400">Email:</span> <span className="font-mono text-gray-900 dark:text-white">{report.callerEmail}</span></div>
          )}
          {report.callerDOB && (
            <div><span className="text-gray-500 dark:text-gray-400">DOB:</span> <span className="text-gray-900 dark:text-white">{report.callerDOB}</span></div>
          )}
          {report.location && (
            <div><span className="text-gray-500 dark:text-gray-400">Location:</span> <span className="text-gray-900 dark:text-white">{report.location}</span></div>
          )}
          {report.insurance && (
            <div><span className="text-gray-500 dark:text-gray-400">Insurance:</span> <span className="text-gray-900 dark:text-white">{report.insurance}</span></div>
          )}
        </div>

        {/* Children */}
        {report.children.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Children ({report.children.length})</div>
            <div className="flex gap-3">
              {report.children.map((child, i) => (
                <div key={i} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">{child.name}</div>
                  {child.dob && <div className="text-xs text-gray-500 dark:text-gray-400">DOB: {child.dob}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tool Call Sequence */}
        {report.toolCalls.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Tool Call Sequence</div>
            <div className="space-y-2">
              {report.toolCalls.map((tc, i) => (
                <div key={i} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 text-sm">
                  <div className="flex items-center gap-2">
                    <span>{toolStatusDot(tc.status)}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{i + 1}. {tc.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{'\u2192'}</span>
                    <code className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">{tc.action}</code>
                    {tc.durationMs && <span className="text-xs text-gray-400 ml-auto">{(tc.durationMs / 1000).toFixed(1)}s</span>}
                  </div>
                  <div className="ml-6 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <div>Input: {tc.inputSummary}</div>
                    <div>Output: {tc.outputSummary}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Booking Results */}
        {report.bookingResults.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Booking Results</div>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor[report.bookingOverall]}`}>
                {report.bookingOverall.toUpperCase()}
              </span>
              {report.bookingElapsedMs && (
                <span className="text-xs text-gray-400">{(report.bookingElapsedMs / 1000).toFixed(1)}s elapsed</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <th className="text-left py-1 pr-3">Child</th>
                    <th className="text-left py-1 pr-3">Patient GUID</th>
                    <th className="text-left py-1 pr-3">Slot</th>
                    <th className="text-left py-1 pr-3">Appt GUID</th>
                    <th className="text-left py-1 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bookingResults.map((br, i) => (
                    <tr key={i} className="border-t border-gray-200 dark:border-gray-600">
                      <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white">{br.childName || 'Unknown'}</td>
                      <td className="py-1.5 pr-3">
                        {br.patientGUID ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{br.patientGUID.substring(0, 8)}...</span>
                            <GuidCopyButton label="Patient GUID" guid={br.patientGUID} />
                          </div>
                        ) : '\u2014'}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{br.slot || '\u2014'}</td>
                      <td className="py-1.5 pr-3">
                        {br.appointmentGUID ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{br.appointmentGUID.substring(0, 8)}...</span>
                            <GuidCopyButton label="Appointment GUID" guid={br.appointmentGUID} />
                          </div>
                        ) : '\u2014'}
                      </td>
                      <td className="py-1.5 pr-3">
                        {br.booked ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">{'\u2713'} Booked</span>
                        ) : br.queued ? (
                          <span className="text-yellow-600 dark:text-yellow-400 font-medium">{'\u23F3'} Queued</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-medium">{'\u2717'} Failed{br.error ? `: ${br.error}` : ''}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Discrepancies */}
        {report.discrepancies.length > 0 && (
          <div>
            <div className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2">Discrepancies</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 dark:text-gray-400">
                    <th className="text-left py-1 pr-3">Aspect</th>
                    <th className="text-left py-1 pr-3">What Allie Said</th>
                    <th className="text-left py-1 pr-3">What Actually Happened</th>
                  </tr>
                </thead>
                <tbody>
                  {report.discrepancies.map((d, i) => (
                    <tr key={i} className="border-t border-gray-200 dark:border-gray-600">
                      <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white">{d.aspect}</td>
                      <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{d.said}</td>
                      <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{d.actual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Issues */}
        {report.issues.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Issues Identified</div>
            <ul className="space-y-1">
              {report.issues.map((issue, i) => (
                <li key={i} className="text-sm text-red-800 dark:text-red-300 flex gap-2">
                  <span className="text-red-500">{i + 1}.</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// CURRENT BOOKING DATA CARD
// ============================================================================

function CurrentBookingDataCard({ data }: { data: CurrentBookingData }) {
  return (
    <Card>
      <div className="p-4 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Current Booking Data</h3>

        {/* Parent */}
        {data.parent && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Parent</div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-4 text-sm mb-1">
                <span className="font-medium text-gray-900 dark:text-white">{data.parent.name}</span>
                {data.parent.dob && <span className="text-gray-500 dark:text-gray-400">DOB: {data.parent.dob}</span>}
                {data.parent.phone && <span className="text-gray-500 dark:text-gray-400">Phone: {data.parent.phone}</span>}
                {data.parent.email && <span className="text-gray-500 dark:text-gray-400">{data.parent.email}</span>}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-gray-500 dark:text-gray-400">Patient GUID:</span>
                <code className="font-mono text-gray-700 dark:text-gray-300">{data.parent.patientGUID}</code>
                <GuidCopyButton label="Patient GUID" guid={data.parent.patientGUID} />
              </div>
            </div>
          </div>
        )}

        {/* Children */}
        {data.children.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Children</div>
            <div className="space-y-3">
              {data.children.map((child) => (
                <div key={child.patientGUID} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                  <div className="font-medium text-sm text-gray-900 dark:text-white mb-1">{child.name}</div>
                  <div className="flex items-center gap-1 text-xs mb-1">
                    <span className="text-gray-500 dark:text-gray-400">Patient GUID:</span>
                    <code className="font-mono text-gray-700 dark:text-gray-300">{child.patientGUID}</code>
                    <GuidCopyButton label="Patient GUID" guid={child.patientGUID} />
                  </div>
                  {child.dob && <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">DOB: {child.dob}</div>}

                  {child.appointments.length > 0 ? (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Appointments:</div>
                      <div className="space-y-1.5">
                        {child.appointments.map((appt) => (
                          <div key={appt.appointmentGUID} className="ml-2 p-2 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-xs">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-gray-900 dark:text-white font-medium">{appt.dateTime}</span>
                              {appt.type && <span className="text-gray-500 dark:text-gray-400">- {appt.type}</span>}
                              {appt.status && (
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  appt.status.toLowerCase().includes('cancel') ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                }`}>
                                  {appt.status}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500 dark:text-gray-400">Appt GUID:</span>
                              <code className="font-mono text-gray-700 dark:text-gray-300">{appt.appointmentGUID}</code>
                              <GuidCopyButton label="Appointment GUID" guid={appt.appointmentGUID} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">No appointments found</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {data.errors.length > 0 && (
          <div className="p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
            <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-1">Warnings</div>
            {data.errors.map((err, i) => (
              <div key={i} className="text-xs text-yellow-700 dark:text-yellow-300">{err}</div>
            ))}
          </div>
        )}

        {/* Queried timestamp */}
        <div className="text-xs text-gray-400 dark:text-gray-500">
          Queried: {formatTimestamp(data.queriedAt)}
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// BOOKING CORRECTION CARD
// ============================================================================

interface ChildCorrectionState {
  checking: boolean;
  booking: boolean;
  checkResult: SlotCheckResult | null;
  selectedAlternative: SlotAlternative | null;
  actionResult: CorrectionResult | null;
}

type CorrectionStatus = 'needs_booking' | 'booked' | 'was_cancelled' | 'queued_booked' | 'no_record';

function determineCorrectionStatus(
  br: CallReportBookingResult,
  currentChildren: CurrentBookingChild[]
): { status: CorrectionStatus; currentChild: CurrentBookingChild | null; currentAppt: any | null } {
  const currentChild = currentChildren.find(c => c.patientGUID === br.patientGUID) || null;
  if (!currentChild) {
    // If we have a patientGUID, the record exists even if no booking was attempted
    // This allows booking for children found via lookup but never booked
    if (br.patientGUID) {
      return { status: 'needs_booking', currentChild: null, currentAppt: null };
    }
    return { status: br.queued || br.booked ? 'needs_booking' : 'no_record', currentChild: null, currentAppt: null };
  }

  const scheduledAppts = currentChild.appointments.filter(a =>
    a.status && !a.status.toLowerCase().includes('cancel')
  );
  const cancelledAppts = currentChild.appointments.filter(a =>
    a.status && a.status.toLowerCase().includes('cancel')
  );

  if (br.booked && scheduledAppts.length > 0) {
    return { status: 'booked', currentChild, currentAppt: scheduledAppts[0] };
  }
  if (br.queued && scheduledAppts.length > 0) {
    return { status: 'queued_booked', currentChild, currentAppt: scheduledAppts[0] };
  }
  if (br.booked && cancelledAppts.length > 0 && scheduledAppts.length === 0) {
    return { status: 'was_cancelled', currentChild, currentAppt: cancelledAppts[0] };
  }
  if ((br.queued && !br.booked) || (br.booked && scheduledAppts.length === 0)) {
    return { status: 'needs_booking', currentChild, currentAppt: null };
  }
  // If we have a currentChild (patient exists) but no bookings and no booking was attempted,
  // the patient needs booking - this handles children found via lookup
  if (currentChild && scheduledAppts.length === 0) {
    return { status: 'needs_booking', currentChild, currentAppt: null };
  }
  return { status: 'no_record', currentChild, currentAppt: null };
}

function getStatusBadge(status: CorrectionStatus): { color: string; label: string; icon: string } {
  switch (status) {
    case 'needs_booking': return { color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', label: 'Needs Booking', icon: '\u26A0' };
    case 'booked': return { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', label: 'Booked', icon: '\u2713' };
    case 'was_cancelled': return { color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', label: 'Was Cancelled', icon: '\u2717' };
    case 'queued_booked': return { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', label: 'Queued\u2192Booked', icon: '\u2713' };
    case 'no_record': return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', label: 'No Record', icon: '\u2014' };
  }
}

// Helper to format date for input[type=date] (YYYY-MM-DD)
function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) {
    // Default to today
    const today = new Date();
    return today.toISOString().split('T')[0];
  }
  // Parse MM/DD/YYYY format
  const parts = dateStr.split(' ')[0].split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // Try to parse as date
  try {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

// Helper to format YYYY-MM-DD to MM/DD/YYYY for API
function formatDateForApi(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}

// Helper to format date for display
function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

// Slot picker modal with date selection
function SlotPickerModal({
  childName, patientGUID, defaultDate, slots, intendedSlot, loading, booking, onDateChange, onSelect, onClose,
}: {
  childName: string;
  patientGUID: string;
  defaultDate: string | null; // The date from the trace (MM/DD/YYYY format)
  slots: SlotAlternative[];
  intendedSlot: SlotAlternative | null;
  loading: boolean;
  booking: boolean;
  onDateChange: (date: string) => void; // Called with MM/DD/YYYY format
  onSelect: (slot: SlotAlternative) => void;
  onClose: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(() => formatDateForInput(defaultDate));
  const originalDate = formatDateForInput(defaultDate);
  const isOriginalDate = selectedDate === originalDate;

  // Handle date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    onDateChange(formatDateForApi(newDate));
  };

  // Quick date navigation
  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const newDateStr = current.toISOString().split('T')[0];
    setSelectedDate(newDateStr);
    onDateChange(formatDateForApi(newDateStr));
  };

  // Filter out past time slots if showing today's date
  const filterPastSlots = (slotList: SlotAlternative[]): SlotAlternative[] => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // If not viewing today, return all slots
    if (selectedDate !== todayStr) {
      return slotList;
    }

    // Filter out slots that have already passed
    return slotList.filter(s => {
      try {
        const slotDate = new Date(s.startTime);
        // Add 5 minute buffer - don't show slots starting in less than 5 minutes
        const bufferMs = 5 * 60 * 1000;
        return slotDate.getTime() > (now.getTime() + bufferMs);
      } catch {
        return true; // Keep slot if we can't parse it
      }
    });
  };

  const filteredSlots = filterPastSlots(slots);
  const pastSlotsCount = slots.length - filteredSlots.length;

  // Group slots into AM and PM
  const amSlots: SlotAlternative[] = [];
  const pmSlots: SlotAlternative[] = [];
  for (const s of filteredSlots) {
    const upper = s.startTime.toUpperCase();
    if (upper.includes('PM') && !upper.includes('12:')) {
      pmSlots.push(s);
    } else if (upper.includes('PM') && upper.includes('12:')) {
      pmSlots.push(s);
    } else {
      amSlots.push(s);
    }
  }

  // Extract just the time portion for display
  const formatTime = (startTime: string) => {
    try {
      const d = new Date(startTime);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      // Fallback: grab the time part after the date
      const parts = startTime.split(' ');
      return parts.length >= 2 ? parts.slice(1).join(' ') : startTime;
    }
  };

  const isIntended = (s: SlotAlternative) =>
    intendedSlot && s.startTime === intendedSlot.startTime;

  const slotButton = (s: SlotAlternative) => (
    <button
      key={s.startTime}
      onClick={() => onSelect(s)}
      disabled={booking}
      className={`px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
        isIntended(s)
          ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium ring-2 ring-green-300 dark:ring-green-700'
          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-600'
      }`}
    >
      {formatTime(s.startTime)}
      {isIntended(s) && <span className="ml-1 text-xs">(original)</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Select Slot for {childName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {loading ? 'Loading...' : `${filteredSlots.length} available slot${filteredSlots.length !== 1 ? 's' : ''}`} for {formatDateForDisplay(selectedDate)}
              {pastSlotsCount > 0 && (
                <span className="ml-1 text-yellow-600 dark:text-yellow-400">
                  ({pastSlotsCount} past time{pastSlotsCount !== 1 ? 's' : ''} hidden)
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <Icons.X />
          </button>
        </div>

        {/* Date Picker Section */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => changeDate(-1)}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-400"
              title="Previous day"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                disabled={loading}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
              {!isOriginalDate && (
                <button
                  onClick={() => {
                    setSelectedDate(originalDate);
                    onDateChange(formatDateForApi(originalDate));
                  }}
                  disabled={loading}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40 disabled:opacity-50"
                  title="Return to original search date"
                >
                  Original
                </button>
              )}
            </div>
            <button
              onClick={() => changeDate(1)}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-400"
              title="Next day"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          {isOriginalDate && defaultDate && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">
              Showing slots for the date originally searched in this call
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Spinner size="lg" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading available slots from Cloud9...</span>
            </div>
          ) : filteredSlots.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {pastSlotsCount > 0 ? (
                <>
                  <p className="text-sm">All {pastSlotsCount} slot{pastSlotsCount !== 1 ? 's' : ''} for today have already passed.</p>
                  <p className="text-xs mt-2">Try selecting a future date above.</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No available slots found for {formatDateForDisplay(selectedDate)}.</p>
                  <p className="text-xs mt-2">Try selecting a different date above.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {amSlots.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Morning</div>
                  <div className="flex flex-wrap gap-2">
                    {amSlots.map(slotButton)}
                  </div>
                </div>
              )}
              {pmSlots.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Afternoon</div>
                  <div className="flex flex-wrap gap-2">
                    {pmSlots.map(slotButton)}
                  </div>
                </div>
              )}
            </div>
          )}

          {booking && (
            <div className="mt-4 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <Spinner size="sm" /> Processing...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface SlotModalState {
  key: string;
  br: CallReportBookingResult;
  mode: 'book' | 'reschedule';
  oldApptGUID?: string;
  currentDate: string; // MM/DD/YYYY format - the current date being viewed
  originalDate: string; // MM/DD/YYYY format - the original date from the trace
}

function BookingCorrectionCard({
  sessionId, bookingResults, currentBookingData, onRefresh,
}: {
  sessionId: string;
  bookingResults: CallReportBookingResult[];
  currentBookingData: CurrentBookingData;
  onRefresh: () => void;
}) {
  const [childStates, setChildStates] = useState<Record<string, ChildCorrectionState>>({});
  const [history, setHistory] = useState<BookingCorrectionRecord[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ type: string; message: string; onConfirm: () => void } | null>(null);
  // Modal state: which child key is open + the action mode + date tracking
  const [slotModal, setSlotModal] = useState<SlotModalState | null>(null);

  // Load correction history
  useEffect(() => {
    getCorrectionHistory(sessionId).then(r => setHistory(r.corrections)).catch(() => {});
  }, [sessionId]);

  const getState = (key: string): ChildCorrectionState => childStates[key] || { checking: false, booking: false, checkResult: null, selectedAlternative: null, actionResult: null };
  const setState = (key: string, patch: Partial<ChildCorrectionState>) => {
    setChildStates(prev => ({ ...prev, [key]: { ...getState(key), ...patch } }));
  };

  // Fetch slots for a given date
  const fetchSlotsForDate = async (br: CallReportBookingResult, date: string, intendedSlot?: string, scheduleViewGUID?: string) => {
    const key = br.patientGUID || br.childName || '';
    if (!br.patientGUID) return;

    setState(key, { checking: true, checkResult: null });

    try {
      const result = await checkSlotAvailability(sessionId, {
        patientGUID: br.patientGUID,
        intendedStartTime: intendedSlot || `${date} 9:00 AM`, // Use intended slot or a default time
        date: date,
        scheduleViewGUID: scheduleViewGUID || br.scheduleViewGUID, // Filter to same chair if available
      });
      setState(key, { checking: false, checkResult: result });
    } catch (err: any) {
      setState(key, { checking: false, actionResult: { success: false, message: err.message } });
    }
  };

  // Open modal and fetch slots
  const openSlotPicker = async (br: CallReportBookingResult, mode: 'book' | 'reschedule', oldApptGUID?: string, fallbackSlot?: string) => {
    const key = br.patientGUID || br.childName || '';
    const slot = br.slot || fallbackSlot;
    if (!br.patientGUID) return;

    // Extract date from slot or use today
    let slotDate: string;
    if (slot) {
      slotDate = slot.split(' ')[0]; // MM/DD/YYYY
    } else {
      // Default to today if no slot
      const today = new Date();
      slotDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
    }

    setSlotModal({ key, br, mode, oldApptGUID, currentDate: slotDate, originalDate: slotDate });
    setState(key, { checking: true, checkResult: null, actionResult: null });

    try {
      const result = await checkSlotAvailability(sessionId, {
        patientGUID: br.patientGUID,
        intendedStartTime: slot || `${slotDate} 9:00 AM`,
        date: slotDate,
        scheduleViewGUID: br.scheduleViewGUID, // Filter to same chair if available
      });
      setState(key, { checking: false, checkResult: result });
    } catch (err: any) {
      setState(key, { checking: false, actionResult: { success: false, message: err.message } });
    }
  };

  // Handle date change from the modal
  const handleDateChange = async (newDate: string) => {
    if (!slotModal) return;

    // Update modal state with new date
    setSlotModal(prev => prev ? { ...prev, currentDate: newDate } : null);

    // Fetch slots for the new date (pass scheduleViewGUID to filter to same chair)
    await fetchSlotsForDate(slotModal.br, newDate, slotModal.br.slot || undefined, slotModal.br.scheduleViewGUID);
  };

  // User picked a slot from the modal
  const handleSlotSelected = (slot: SlotAlternative) => {
    if (!slotModal) return;
    const { br, mode, oldApptGUID } = slotModal;
    if (mode === 'reschedule' && oldApptGUID) {
      handleReschedule(br, oldApptGUID, slot);
    } else {
      handleBook(br, slot);
    }
  };

  const handleBook = async (br: CallReportBookingResult, slot: SlotAlternative) => {
    const key = br.patientGUID || br.childName || '';
    setConfirmAction({
      type: 'Book',
      message: `Book appointment for ${br.childName || 'Unknown'} at ${slot.startTime}?`,
      onConfirm: async () => {
        setConfirmAction(null);
        setState(key, { booking: true, actionResult: null });
        try {
          const result = await bookCorrection(sessionId, {
            patientGUID: br.patientGUID!,
            startTime: slot.startTime,
            scheduleViewGUID: slot.scheduleViewGUID,
            scheduleColumnGUID: slot.scheduleColumnGUID,
            appointmentTypeGUID: br.appointmentTypeGUID,
            childName: br.childName || undefined,
          });
          setState(key, { booking: false, actionResult: result });
          if (result.success) {
            setSlotModal(null);
            getCorrectionHistory(sessionId).then(r => setHistory(r.corrections)).catch(() => {});
            onRefresh();
          }
        } catch (err: any) {
          setState(key, { booking: false, actionResult: { success: false, message: err.message } });
        }
      },
    });
  };

  const handleCancel = async (br: CallReportBookingResult, apptGUID: string) => {
    const key = br.patientGUID || br.childName || '';
    setConfirmAction({
      type: 'Cancel',
      message: `Cancel appointment ${apptGUID.substring(0, 8)}... for ${br.childName || 'Unknown'}?`,
      onConfirm: async () => {
        setConfirmAction(null);
        setState(key, { booking: true, actionResult: null });
        try {
          const result = await cancelCorrection(sessionId, { appointmentGUID: apptGUID, childName: br.childName || undefined });
          setState(key, { booking: false, actionResult: result });
          if (result.success) {
            getCorrectionHistory(sessionId).then(r => setHistory(r.corrections)).catch(() => {});
            onRefresh();
          }
        } catch (err: any) {
          setState(key, { booking: false, actionResult: { success: false, message: err.message } });
        }
      },
    });
  };

  const handleReschedule = async (br: CallReportBookingResult, oldApptGUID: string, newSlot: SlotAlternative) => {
    const key = br.patientGUID || br.childName || '';
    setConfirmAction({
      type: 'Reschedule',
      message: `Cancel ${oldApptGUID.substring(0, 8)}... and rebook ${br.childName || 'Unknown'} at ${newSlot.startTime}?`,
      onConfirm: async () => {
        setConfirmAction(null);
        setState(key, { booking: true, actionResult: null });
        try {
          const result = await rescheduleCorrection(sessionId, {
            appointmentGUID: oldApptGUID,
            patientGUID: br.patientGUID!,
            newStartTime: newSlot.startTime,
            scheduleViewGUID: newSlot.scheduleViewGUID,
            scheduleColumnGUID: newSlot.scheduleColumnGUID,
            childName: br.childName || undefined,
          });
          setState(key, { booking: false, actionResult: result });
          if (result.success) {
            setSlotModal(null);
            getCorrectionHistory(sessionId).then(r => setHistory(r.corrections)).catch(() => {});
            onRefresh();
          }
        } catch (err: any) {
          setState(key, { booking: false, actionResult: { success: false, message: err.message } });
        }
      },
    });
  };

  return (
    <Card>
      <div className="p-4 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Booking Corrections</h3>

        {/* Confirmation Dialog */}
        {confirmAction && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">{confirmAction.message}</p>
            <div className="flex gap-2">
              <button onClick={confirmAction.onConfirm} className="px-3 py-1 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700">
                Confirm {confirmAction.type}
              </button>
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1 text-sm font-medium rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Slot Picker Modal */}
        {slotModal && (() => {
          const state = getState(slotModal.key);
          return (
            <SlotPickerModal
              childName={slotModal.br.childName || 'Unknown'}
              patientGUID={slotModal.br.patientGUID || ''}
              defaultDate={slotModal.originalDate}
              slots={state.checkResult?.alternatives || []}
              intendedSlot={state.checkResult?.intendedSlot || null}
              loading={state.checking}
              booking={state.booking}
              onDateChange={handleDateChange}
              onSelect={handleSlotSelected}
              onClose={() => setSlotModal(null)}
            />
          );
        })()}

        {/* Per-child rows */}
        {bookingResults.map((br) => {
          const key = br.patientGUID || br.childName || '';
          const { status, currentAppt } = determineCorrectionStatus(br, currentBookingData.children);
          const badge = getStatusBadge(status);
          const state = getState(key);

          return (
            <div key={key} className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900 dark:text-white">{br.childName || 'Unknown'}</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.color}`}>
                  {badge.icon} {badge.label}
                </span>
              </div>

              {/* Details */}
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                {br.patientGUID && (
                  <div className="flex items-center gap-1">
                    Patient GUID: <code className="font-mono">{br.patientGUID}</code>
                    <GuidCopyButton label="Patient GUID" guid={br.patientGUID} />
                  </div>
                )}
                {br.slot && <div>Intended Slot: {br.slot}</div>}
                {currentAppt && (
                  <div>
                    Current: {currentAppt.dateTime} - {currentAppt.status}
                    {currentAppt.appointmentGUID && (
                      <span className="ml-2">
                        Appt: <code className="font-mono">{currentAppt.appointmentGUID.substring(0, 8)}...</code>
                        <GuidCopyButton label="Appt GUID" guid={currentAppt.appointmentGUID} />
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 items-center">
                {(status === 'needs_booking' || status === 'was_cancelled' || status === 'no_record') && br.patientGUID && (
                  <button
                    onClick={() => openSlotPicker(br, 'book')}
                    disabled={state.checking}
                    className="px-3 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {state.checking ? 'Loading...' : <><Icons.Calendar /> Book</>}
                  </button>
                )}

                {(status === 'booked' || status === 'queued_booked') && currentAppt?.appointmentGUID && (
                  <>
                    <button
                      onClick={() => handleCancel(br, currentAppt.appointmentGUID)}
                      disabled={state.booking}
                      className="px-3 py-1 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/40 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => openSlotPicker(br, 'reschedule', currentAppt.appointmentGUID, currentAppt.dateTime)}
                      disabled={state.checking}
                      className="px-3 py-1 text-xs font-medium rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-800/40 disabled:opacity-50"
                    >
                      {state.checking ? 'Loading...' : 'Reschedule...'}
                    </button>
                  </>
                )}
              </div>

              {/* Action result */}
              {state.actionResult && (
                <div className={`p-2 rounded text-xs ${state.actionResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
                  {state.actionResult.message}
                  {state.actionResult.appointmentGUID && (
                    <span className="ml-1">
                      Appt: <code className="font-mono">{state.actionResult.appointmentGUID.substring(0, 8)}...</code>
                      <GuidCopyButton label="New Appt GUID" guid={state.actionResult.appointmentGUID} />
                    </span>
                  )}
                </div>
              )}

              {/* Loading overlay */}
              {state.booking && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Spinner size="sm" /> Processing correction...
                </div>
              )}
            </div>
          );
        })}

        {/* Correction History */}
        {history.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Correction History</div>
            <div className="space-y-1">
              {history.map((h) => (
                <div key={h.id} className="text-xs text-gray-600 dark:text-gray-400 flex gap-2">
                  <span>{formatTimestamp(h.performed_at)}</span>
                  <span>{'\u2014'}</span>
                  <span className="capitalize">{h.action}</span>
                  {h.child_name && <span>{h.child_name}</span>}
                  {h.slot_after && <span>at {h.slot_after}</span>}
                  {h.appointment_guid_after && <span>{'\u2192'} Appt: {h.appointment_guid_after.substring(0, 8)}...</span>}
                  <span className={h.status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {h.status === 'success' ? '\u2713' : '\u2717'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * ManualBookingCard - Allows booking when no patient GUIDs were found in the trace
 * This is shown when the call never got to the point of patient lookup/booking
 */
function ManualBookingCard({ sessionId, onRefresh }: { sessionId: string; onRefresh: () => void }) {
  const [patientGUID, setPatientGUID] = useState('');
  const [childName, setChildName] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);

  const handleCheckSlots = async () => {
    if (!patientGUID.trim()) {
      setError('Please enter a patient GUID');
      return;
    }

    setLoading(true);
    setError(null);
    setCheckResult(null);
    setSelectedSlot(null);
    setBookingResult(null);

    try {
      // Get today's date in MM/DD/YYYY format
      const today = new Date();
      const dateStr = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;

      const result = await checkSlotAvailability(sessionId, {
        patientGUID: patientGUID.trim(),
        date: dateStr,
        intendedStartTime: `${dateStr} 9:00 AM`,
      });
      setCheckResult(result);
    } catch (err: any) {
      setError(err.message || 'Failed to check slots');
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!selectedSlot || !patientGUID.trim()) return;

    setBookingInProgress(true);
    setError(null);

    try {
      const result = await bookCorrection(sessionId, {
        patientGUID: patientGUID.trim(),
        childName: childName.trim() || 'Unknown',
        slotStartTime: selectedSlot.startTime,
        scheduleViewGUID: selectedSlot.scheduleViewGUID,
        scheduleColumnGUID: selectedSlot.scheduleColumnGUID,
        appointmentTypeGUID: selectedSlot.appointmentTypeGUID,
        action: 'book',
      });
      setBookingResult(result);
      if (result.success) {
        onRefresh();
      }
    } catch (err: any) {
      setError(err.message || 'Booking failed');
    } finally {
      setBookingInProgress(false);
    }
  };

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icons.AlertCircle />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Manual Booking</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            No patient GUIDs found in trace - enter manually to book
          </span>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 mb-4">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            This call had tool errors before patient lookup could complete. If you know the patient's GUID, you can manually book an appointment.
          </p>
        </div>

        <div className="space-y-4">
          {/* Input fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Patient GUID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={patientGUID}
                onChange={(e) => setPatientGUID(e.target.value)}
                placeholder="Enter patient GUID..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Child Name (optional)
              </label>
              <input
                type="text"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="For audit trail..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          {/* Check slots button */}
          <div>
            <Button
              onClick={handleCheckSlots}
              disabled={loading || !patientGUID.trim()}
              variant="primary"
              size="sm"
            >
              {loading ? <Spinner size="sm" /> : 'Check Available Slots'}
            </Button>
          </div>

          {/* Error message */}
          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {error}
            </div>
          )}

          {/* Slot results */}
          {checkResult?.alternatives && checkResult.alternatives.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Available Slots ({checkResult.alternatives.length} found)
              </p>
              <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                {checkResult.alternatives.map((slot: any, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedSlot(slot)}
                    className={`p-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 ${
                      selectedSlot === slot ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {slot.startTime}
                    </span>
                    {slot.chairName && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        ({slot.chairName})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {checkResult?.alternatives?.length === 0 && (
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              No available slots found for today. Try again later.
            </div>
          )}

          {/* Book button */}
          {selectedSlot && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-600">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Selected: <strong>{selectedSlot.startTime}</strong>
              </span>
              <Button
                onClick={handleBook}
                disabled={bookingInProgress}
                variant="success"
                size="sm"
              >
                {bookingInProgress ? <Spinner size="sm" /> : 'Book Appointment'}
              </Button>
            </div>
          )}

          {/* Booking result */}
          {bookingResult && (
            <div className={`p-3 rounded-lg ${
              bookingResult.success
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}>
              <p className="text-sm font-medium">
                {bookingResult.success ? '\u2713 Booking Successful' : '\u2717 Booking Failed'}
              </p>
              <p className="text-xs mt-1">{bookingResult.message}</p>
              {bookingResult.appointmentGUID && (
                <p className="text-xs mt-1">Appointment GUID: {bookingResult.appointmentGUID}</p>
              )}
            </div>
          )}
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
  const [langfuseConfigs, setLangfuseConfigs] = useState<LangfuseConfigProfile[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<number | undefined>(undefined);

  const analyzeSession = useCallback(async (sessionId: string, opts?: { force?: boolean; verify?: boolean; configId?: number }) => {
    if (!sessionId.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setDiagnosisResult(null);
      const data = await getTraceAnalysis(sessionId.trim(), {
        force: opts?.force,
        verify: opts?.verify,
        configId: opts?.configId ?? selectedConfigId,
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze session');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [selectedConfigId]);

  // Load Langfuse configs on mount
  useEffect(() => {
    getLangfuseConfigs()
      .then(configs => setLangfuseConfigs(configs))
      .catch(err => console.error('Failed to fetch Langfuse configs:', err));
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
      const data = await diagnoseProductionTrace(traceId, {
        configId: selectedConfigId || undefined,
        sessionId: sessionIdInput.trim() || undefined,
      });
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
            <select
              value={selectedConfigId ?? ''}
              onChange={(e) => setSelectedConfigId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="w-48 px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Sources</option>
              {langfuseConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}
                </option>
              ))}
            </select>
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
      {loading && (
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <Spinner size="lg" />
              <div>
                <p className="text-base font-medium text-gray-900 dark:text-white">Analyzing session...</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Importing traces from Langfuse and classifying intent. This may take 10-30 seconds.
                </p>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </Card>
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

          {/* Intent Classification */}
          <Card>
            <div className="p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Intent Classification</h3>
              <IntentCard intent={result.intent} />

              {/* Show intended booking slots from call report (what was actually agreed upon during the call) */}
              {result.callReport?.bookingResults && result.callReport.bookingResults.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">
                    {'\u{1F4C5}'} Intended Booking{result.callReport.bookingResults.length > 1 ? 's' : ''} (Confirmed During Call)
                  </div>
                  <div className="space-y-1.5">
                    {result.callReport.bookingResults.map((br, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">{br.childName || 'Unknown'}</span>
                        {br.slot ? (
                          <span className="text-blue-700 dark:text-blue-300 font-medium">{br.slot}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 italic">No slot selected</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Intent vs Delivery Comparison (if we have comparison data with children or transfer) */}
          {result.intentDeliveryComparison && (result.intentDeliveryComparison.children.length > 0 || result.intentDeliveryComparison.transfer) && (
            <IntentDeliveryComparisonCard comparison={result.intentDeliveryComparison} />
          )}

          {/* Verification (if present) */}
          {result.verification && <VerificationCard verification={result.verification} />}

          {/* Diagnostic Report (if present) */}
          {diagnosisResult && <DiagnosticReportCard diagnosis={diagnosisResult} />}

          {/* Call Report (if present) */}
          {result.callReport && <CallReportCard report={result.callReport} />}

          {/* Current Booking Data (if present) */}
          {result.currentBookingData && <CurrentBookingDataCard data={result.currentBookingData} />}

          {/* Booking Corrections (if we have both booking results and current data) */}
          {result.currentBookingData && result.callReport?.bookingResults && result.callReport.bookingResults.length > 0 && (
            <BookingCorrectionCard
              sessionId={result.sessionId}
              bookingResults={result.callReport.bookingResults}
              currentBookingData={result.currentBookingData}
              onRefresh={handleRefresh}
            />
          )}

          {/* Manual Booking (if no booking results - allows manual GUID entry) */}
          {result.callReport && (!result.callReport.bookingResults || result.callReport.bookingResults.length === 0) && (
            <ManualBookingCard sessionId={result.sessionId} onRefresh={handleRefresh} />
          )}

          {/* Tool Sequence */}
          <Card>
            <div className="p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Tool Sequence</h3>
              <ToolSequenceView toolSequence={result.toolSequence} />
            </div>
          </Card>

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
