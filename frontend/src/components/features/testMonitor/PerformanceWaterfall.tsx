/**
 * PerformanceWaterfall Component
 *
 * Visualizes the timing of test execution including API calls.
 * Helps identify performance bottlenecks in test runs.
 * Each step is expandable to show detailed information.
 */

import { useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import type { ConversationTurn, ApiCall } from '../../../types/testMonitor.types';
import { useExpandablePanel } from './ExpandablePanel';

interface PerformanceWaterfallProps {
  transcript: ConversationTurn[];
  apiCalls: ApiCall[];
  testStartTime?: string;
  testDurationMs?: number;
  bottleneckThresholdMs?: number;
}

interface AssociatedApiCall {
  id: number;
  toolName: string;
  durationMs: number;
  status?: string;
  timestamp: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
}

interface WaterfallEntry {
  id: string;
  type: 'user_message' | 'assistant_message' | 'api_call';
  name: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  isBottleneck: boolean;
  stepId?: string;
  status?: string;
  // Full content for expandable view
  content?: string;
  validationPassed?: boolean;
  validationMessage?: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  timestamp?: string;
  // Associated API calls for assistant messages
  associatedApiCalls?: AssociatedApiCall[];
}

/**
 * Format milliseconds as readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Parse timestamp to milliseconds from test start
 */
function parseTimestampToMs(timestamp: string, baseTime: Date): number {
  try {
    const time = new Date(timestamp);
    return Math.max(0, time.getTime() - baseTime.getTime());
  } catch {
    return 0;
  }
}

export function PerformanceWaterfall({
  transcript,
  apiCalls,
  testStartTime,
  testDurationMs = 0,
  bottleneckThresholdMs = 2000,
}: PerformanceWaterfallProps) {
  // Check if we're in expanded/popout mode for wider name column
  const { isExpanded: isPanelExpanded } = useExpandablePanel();

  // Width classes for name column - wider in expanded mode
  const nameColumnWidth = isPanelExpanded ? 'w-72' : 'w-44';

  const waterfallData = useMemo(() => {
    if (!transcript.length && !apiCalls.length) return { entries: [], totalDurationMs: 0 };

    // Determine base time
    const baseTime = testStartTime
      ? new Date(testStartTime)
      : new Date(
          transcript[0]?.timestamp ||
          apiCalls[0]?.timestamp ||
          new Date().toISOString()
        );

    const entries: WaterfallEntry[] = [];

    // Sort API calls by timestamp for grouping
    const sortedApiCalls = [...apiCalls].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Group API calls by assistant turn based on timestamp windows
    const apiCallsByTurnIndex = new Map<number, AssociatedApiCall[]>();
    const assignedCallIds = new Set<number>();

    // For each assistant turn, find API calls that occurred during its processing
    transcript.forEach((turn, idx) => {
      if (turn.role === 'assistant') {
        const assistantTime = new Date(turn.timestamp).getTime();

        // Find the previous user turn (window start)
        let windowStart = 0;
        for (let j = idx - 1; j >= 0; j--) {
          if (transcript[j].role === 'user') {
            windowStart = new Date(transcript[j].timestamp).getTime();
            break;
          }
        }

        // Find the next user turn (window end boundary)
        let nextUserTime: number | null = null;
        for (let j = idx + 1; j < transcript.length; j++) {
          if (transcript[j].role === 'user') {
            nextUserTime = new Date(transcript[j].timestamp).getTime();
            break;
          }
        }

        // Window end: use the next user message time if available
        const windowEnd = nextUserTime !== null
          ? nextUserTime
          : assistantTime + 500;

        // Find API calls in this window that haven't been assigned yet
        const turnApiCalls: AssociatedApiCall[] = [];
        for (let callIdx = 0; callIdx < sortedApiCalls.length; callIdx++) {
          const call = sortedApiCalls[callIdx];
          if (assignedCallIds.has(call.id)) continue;
          const callTime = new Date(call.timestamp).getTime();
          if (callTime >= windowStart && callTime < windowEnd) {
            // Estimate duration if not provided
            let durationMs = call.durationMs || 0;
            if (durationMs === 0) {
              // Try to estimate from next API call in window
              for (let nextIdx = callIdx + 1; nextIdx < sortedApiCalls.length; nextIdx++) {
                const nextCall = sortedApiCalls[nextIdx];
                const nextCallTime = new Date(nextCall.timestamp).getTime();
                if (nextCallTime >= windowStart && nextCallTime < windowEnd) {
                  const estimatedMs = nextCallTime - callTime;
                  if (estimatedMs > 0 && estimatedMs < 30000) {
                    durationMs = estimatedMs;
                  }
                  break;
                }
              }
              // If still 0, estimate from assistant message time
              if (durationMs === 0) {
                const estimatedMs = assistantTime - callTime;
                if (estimatedMs > 0 && estimatedMs < 30000) {
                  durationMs = estimatedMs;
                }
              }
            }

            turnApiCalls.push({
              id: call.id,
              toolName: call.toolName,
              durationMs,
              status: call.status,
              timestamp: call.timestamp,
              requestPayload: call.requestPayload,
              responsePayload: call.responsePayload,
            });
            assignedCallIds.add(call.id);
          }
        }

        if (turnApiCalls.length > 0) {
          apiCallsByTurnIndex.set(idx, turnApiCalls);
        }
      }
    });

    // Add conversation turns with associated API calls
    let lastTurnEnd = 0;
    transcript.forEach((turn, idx) => {
      const startMs = parseTimestampToMs(turn.timestamp, baseTime);
      const durationMs = turn.responseTimeMs || 100; // Default to 100ms if not provided
      const endMs = startMs + durationMs;

      entries.push({
        id: `turn-${idx}`,
        type: turn.role === 'user' ? 'user_message' : 'assistant_message',
        name: turn.role === 'user' ? 'User Message' : 'Assistant Response',
        startMs,
        durationMs,
        endMs,
        isBottleneck: durationMs > bottleneckThresholdMs,
        stepId: turn.stepId,
        status: turn.validationPassed === false ? 'failed' : 'success',
        // Store full content for expandable view
        content: turn.content,
        validationPassed: turn.validationPassed,
        validationMessage: turn.validationMessage,
        timestamp: turn.timestamp,
        // Add associated API calls for assistant messages
        associatedApiCalls: turn.role === 'assistant' ? apiCallsByTurnIndex.get(idx) : undefined,
      });

      lastTurnEnd = Math.max(lastTurnEnd, endMs);
    });

    // Add API calls as separate timeline entries
    // Calculate estimated durations for API calls without duration data
    // Use sortedApiCalls to ensure proper ordering for duration estimation
    sortedApiCalls.forEach((call, callIdx) => {
      const startMs = parseTimestampToMs(call.timestamp, baseTime);

      // Use provided duration, or estimate from time to next API call/event
      let durationMs = call.durationMs || 0;

      if (durationMs === 0) {
        // Try to estimate from next API call timestamp
        const nextCall = sortedApiCalls[callIdx + 1];
        if (nextCall) {
          const nextStartMs = parseTimestampToMs(nextCall.timestamp, baseTime);
          const estimatedMs = nextStartMs - startMs;
          if (estimatedMs > 0 && estimatedMs < 30000) { // Cap at 30 seconds
            durationMs = estimatedMs;
          }
        }

        // If still 0, try to find next transcript entry
        if (durationMs === 0) {
          const callTime = new Date(call.timestamp).getTime();
          for (const turn of transcript) {
            const turnTime = new Date(turn.timestamp).getTime();
            if (turnTime > callTime) {
              const estimatedMs = turnTime - callTime;
              if (estimatedMs > 0 && estimatedMs < 30000) {
                durationMs = estimatedMs;
              }
              break;
            }
          }
        }
      }

      const endMs = startMs + durationMs;

      entries.push({
        id: `api-${call.id}`,
        type: 'api_call',
        name: call.toolName,
        startMs,
        durationMs,
        endMs,
        isBottleneck: durationMs > bottleneckThresholdMs,
        stepId: call.stepId,
        status: call.status,
        // Store full payloads for expandable view
        requestPayload: call.requestPayload,
        responsePayload: call.responsePayload,
        timestamp: call.timestamp,
      });

      lastTurnEnd = Math.max(lastTurnEnd, endMs);
    });

    // Sort by start time
    entries.sort((a, b) => a.startMs - b.startMs);

    const totalDurationMs = testDurationMs || lastTurnEnd;

    return { entries, totalDurationMs };
  }, [transcript, apiCalls, testStartTime, testDurationMs, bottleneckThresholdMs]);

  const { entries, totalDurationMs } = waterfallData;

  // Track which entries are expanded (all collapsed by default)
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  // Toggle expansion of an entry
  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Check if all entries are expanded
  const allExpanded = useMemo(() => {
    if (entries.length === 0) return false;
    return entries.every(entry => expandedEntries[entry.id]);
  }, [entries, expandedEntries]);

  // Toggle all entries expanded/collapsed
  const toggleAllEntries = () => {
    if (allExpanded) {
      // Collapse all
      setExpandedEntries({});
    } else {
      // Expand all
      const allExpanded: Record<string, boolean> = {};
      entries.forEach(entry => {
        allExpanded[entry.id] = true;
      });
      setExpandedEntries(allExpanded);
    }
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const apiEntries = entries.filter(e => e.type === 'api_call');
    const bottlenecks = entries.filter(e => e.isBottleneck);
    const totalApiTime = apiEntries.reduce((sum, e) => sum + e.durationMs, 0);
    const avgApiTime = apiEntries.length ? totalApiTime / apiEntries.length : 0;
    const slowestApi = apiEntries.reduce((max, e) => e.durationMs > max.durationMs ? e : max, { durationMs: 0 } as WaterfallEntry);

    return {
      totalApiCalls: apiEntries.length,
      totalApiTime,
      avgApiTime,
      bottleneckCount: bottlenecks.length,
      slowestApi,
    };
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No timing data available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statistics Header */}
      <div className="grid grid-cols-5 gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm">
        <div>
          <div className="text-gray-500 dark:text-gray-400 text-xs">Turns</div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {transcript.length}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400 text-xs">Total Duration</div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {formatDuration(totalDurationMs)}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400 text-xs">API Calls</div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {stats.totalApiCalls}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400 text-xs">Avg API Time</div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {formatDuration(stats.avgApiTime)}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400 text-xs">Bottlenecks</div>
          <div className={cn(
            'font-medium',
            stats.bottleneckCount > 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400'
          )}>
            {stats.bottleneckCount}
          </div>
        </div>
      </div>

      {/* Slowest API Warning */}
      {stats.slowestApi.durationMs > bottleneckThresholdMs && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
          <span className="font-medium text-red-700 dark:text-red-300">Slowest API Call: </span>
          <span className="text-red-600 dark:text-red-400">
            {stats.slowestApi.name} took {formatDuration(stats.slowestApi.durationMs)}
          </span>
        </div>
      )}

      {/* Waterfall Chart */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Time Scale Header */}
        <div className="flex items-center h-6 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <div className={cn(nameColumnWidth, 'flex-shrink-0 px-2 flex items-center gap-1')}>
            <button
              onClick={toggleAllEntries}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={allExpanded ? 'Collapse all' : 'Expand all'}
            >
              <svg
                className={cn(
                  'w-3 h-3 transition-transform',
                  allExpanded && 'rotate-90'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span>Name</span>
          </div>
          <div className="flex-1 flex justify-between px-2">
            <span>0</span>
            <span>{formatDuration(totalDurationMs / 4)}</span>
            <span>{formatDuration(totalDurationMs / 2)}</span>
            <span>{formatDuration((totalDurationMs * 3) / 4)}</span>
            <span>{formatDuration(totalDurationMs)}</span>
          </div>
        </div>

        {/* Entries */}
        <div className="max-h-[480px] overflow-y-auto">
          {entries.map((entry) => {
            const leftPercent = totalDurationMs > 0 ? (entry.startMs / totalDurationMs) * 100 : 0;
            const widthPercent = totalDurationMs > 0 ? Math.max((entry.durationMs / totalDurationMs) * 100, 0.5) : 0;
            const isExpanded = expandedEntries[entry.id] || false;

            const barColor = {
              user_message: 'bg-blue-400 dark:bg-blue-600',
              assistant_message: entry.status === 'failed'
                ? 'bg-red-400 dark:bg-red-600'
                : 'bg-green-400 dark:bg-green-600',
              api_call: entry.isBottleneck
                ? 'bg-orange-400 dark:bg-orange-600'
                : 'bg-purple-400 dark:bg-purple-600',
            }[entry.type];

            return (
              <div key={entry.id} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                {/* Main row - clickable */}
                <div
                  onClick={() => toggleEntry(entry.id)}
                  className={cn(
                    'flex items-center h-8 cursor-pointer transition-colors',
                    'hover:bg-gray-50 dark:hover:bg-gray-800',
                    entry.isBottleneck && 'bg-orange-50 dark:bg-orange-900/10',
                    isExpanded && 'bg-gray-50 dark:bg-gray-800'
                  )}
                  title={`Click to ${isExpanded ? 'collapse' : 'expand'} details`}
                >
                  {/* Expand/collapse icon + Name Column */}
                  <div className={cn(nameColumnWidth, 'flex-shrink-0 px-2 flex items-center gap-1')}>
                    <svg
                      className={cn(
                        'w-3 h-3 text-gray-400 transition-transform flex-shrink-0',
                        isExpanded && 'rotate-90'
                      )}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      barColor
                    )} />
                    <span className="text-xs truncate text-gray-700 dark:text-gray-300">
                      {entry.name}
                    </span>
                    {/* API call count badge for assistant messages */}
                    {entry.type === 'assistant_message' && entry.associatedApiCalls && entry.associatedApiCalls.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium whitespace-nowrap flex-shrink-0">
                        {entry.associatedApiCalls.length} call{entry.associatedApiCalls.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {entry.isBottleneck && (
                      <span className="text-xs px-1 rounded bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200">
                        SLOW
                      </span>
                    )}
                  </div>

                  {/* Timeline Bar */}
                  <div className="flex-1 h-full flex items-center px-1 relative">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex">
                      {[0, 1, 2, 3, 4].map(i => (
                        <div
                          key={i}
                          className="flex-1 border-l border-gray-200 dark:border-gray-700 first:border-l-0"
                        />
                      ))}
                    </div>

                    {/* Bar */}
                    <div
                      className={cn(
                        'h-4 rounded relative z-10 transition-all',
                        barColor,
                        entry.isBottleneck && 'ring-1 ring-orange-500'
                      )}
                      style={{
                        marginLeft: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        minWidth: '4px',
                      }}
                    >
                      {/* Duration label inside bar if wide enough */}
                      {widthPercent > 10 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium">
                          {formatDuration(entry.durationMs)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Duration Column */}
                  <div className="w-16 flex-shrink-0 px-2 text-xs text-right text-gray-500 dark:text-gray-400">
                    {formatDuration(entry.durationMs)}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                    {/* Timestamp row */}
                    {entry.timestamp && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono">
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                    )}

                    {/* User/Assistant message content */}
                    {(entry.type === 'user_message' || entry.type === 'assistant_message') && (
                      <div className="space-y-3">
                        {/* Associated API calls for assistant messages */}
                        {entry.type === 'assistant_message' && entry.associatedApiCalls && entry.associatedApiCalls.length > 0 && (
                          <div className="rounded border border-purple-200 dark:border-purple-800 overflow-hidden">
                            <div className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 border-b border-purple-200 dark:border-purple-800">
                              <span className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Tool Calls ({entry.associatedApiCalls.length})
                              </span>
                            </div>
                            <div className="divide-y divide-purple-100 dark:divide-purple-800">
                              {entry.associatedApiCalls.map((apiCall) => (
                                <div key={apiCall.id} className="px-3 py-2 bg-purple-50/50 dark:bg-purple-900/10">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={cn(
                                        'w-2 h-2 rounded-full',
                                        apiCall.status === 'completed' ? 'bg-green-500' :
                                        apiCall.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                                      )} />
                                      <span className="font-mono text-xs font-medium text-purple-700 dark:text-purple-300">
                                        {apiCall.toolName}
                                      </span>
                                      {apiCall.status === 'failed' && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                          Failed
                                        </span>
                                      )}
                                    </div>
                                    <span className={cn(
                                      'text-xs font-mono',
                                      apiCall.durationMs > bottleneckThresholdMs
                                        ? 'text-orange-600 dark:text-orange-400 font-medium'
                                        : 'text-gray-500 dark:text-gray-400'
                                    )}>
                                      {formatDuration(apiCall.durationMs)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Message content */}
                        <div className={cn(
                          'p-3 rounded-lg text-sm whitespace-pre-wrap break-words',
                          entry.type === 'user_message'
                            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                            : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        )}>
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                            {entry.type === 'user_message' ? 'User Message' : 'Assistant Response'}
                          </div>
                          <div className={cn(
                            'max-h-48 overflow-y-auto',
                            entry.type === 'user_message'
                              ? 'text-blue-800 dark:text-blue-200'
                              : 'text-green-800 dark:text-green-200'
                          )}>
                            {entry.content || <span className="italic text-gray-400">No content</span>}
                          </div>
                        </div>
                        {/* Validation status for assistant messages */}
                        {entry.type === 'assistant_message' && entry.validationPassed !== undefined && (
                          <div className={cn(
                            'px-2 py-1 rounded text-xs',
                            entry.validationPassed
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          )}>
                            <span className="font-medium">Validation: </span>
                            {entry.validationPassed ? 'Passed' : 'Failed'}
                            {entry.validationMessage && (
                              <span className="ml-2">- {entry.validationMessage}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* API call request/response */}
                    {entry.type === 'api_call' && (
                      <div className="space-y-3">
                        {/* Request payload */}
                        <div className="rounded border border-amber-200 dark:border-amber-800 overflow-hidden">
                          <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                              </svg>
                              Request (Input)
                            </span>
                          </div>
                          <div className="p-2 bg-amber-50/50 dark:bg-amber-900/10 max-h-40 overflow-auto">
                            {entry.requestPayload ? (
                              <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {JSON.stringify(entry.requestPayload, null, 2)}
                              </pre>
                            ) : (
                              <span className="text-xs text-amber-600 dark:text-amber-400 italic">No request data</span>
                            )}
                          </div>
                        </div>

                        {/* Response payload */}
                        <div className="rounded border border-green-200 dark:border-green-800 overflow-hidden">
                          <div className="px-3 py-1.5 bg-green-50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800">
                            <span className="text-xs font-medium text-green-700 dark:text-green-300 uppercase flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
                              Response (Output)
                            </span>
                          </div>
                          <div className="p-2 bg-green-50/50 dark:bg-green-900/10 max-h-40 overflow-auto">
                            {entry.responsePayload ? (
                              <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {JSON.stringify(entry.responsePayload, null, 2)}
                              </pre>
                            ) : (
                              <span className="text-xs text-green-600 dark:text-green-400 italic">No response data</span>
                            )}
                          </div>
                        </div>

                        {/* Status indicator */}
                        {entry.status && (
                          <div className={cn(
                            'px-2 py-1 rounded text-xs inline-block',
                            entry.status === 'completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : entry.status === 'failed'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          )}>
                            Status: {entry.status}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-400 dark:bg-blue-600" />
          <span>User Message</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-400 dark:bg-green-600" />
          <span>Assistant Response</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-purple-400 dark:bg-purple-600" />
          <span>API Call</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-400 dark:bg-orange-600 ring-1 ring-orange-500" />
          <span>Bottleneck ({'>'}2s)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-400 dark:bg-red-600" />
          <span>Failed</span>
        </div>
      </div>
    </div>
  );
}

export default PerformanceWaterfall;
