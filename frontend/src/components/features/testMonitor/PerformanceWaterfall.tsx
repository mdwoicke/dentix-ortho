/**
 * PerformanceWaterfall Component
 *
 * Visualizes the timing of test execution including API calls.
 * Helps identify performance bottlenecks in test runs.
 */

import { useMemo } from 'react';
import { cn } from '../../../utils/cn';
import type { ConversationTurn, ApiCall } from '../../../types/testMonitor.types';

interface PerformanceWaterfallProps {
  transcript: ConversationTurn[];
  apiCalls: ApiCall[];
  testStartTime?: string;
  testDurationMs?: number;
  bottleneckThresholdMs?: number;
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
  details?: Record<string, any>;
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

    // Add conversation turns
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
        details: {
          content: turn.content?.substring(0, 100) + (turn.content?.length > 100 ? '...' : ''),
          validationPassed: turn.validationPassed,
        },
      });

      lastTurnEnd = Math.max(lastTurnEnd, endMs);
    });

    // Add API calls
    apiCalls.forEach((call) => {
      const startMs = parseTimestampToMs(call.timestamp, baseTime);
      const durationMs = call.durationMs || 0;
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
        details: {
          requestSize: JSON.stringify(call.requestPayload || {}).length,
          responseSize: JSON.stringify(call.responsePayload || {}).length,
        },
      });

      lastTurnEnd = Math.max(lastTurnEnd, endMs);
    });

    // Sort by start time
    entries.sort((a, b) => a.startMs - b.startMs);

    const totalDurationMs = testDurationMs || lastTurnEnd;

    return { entries, totalDurationMs };
  }, [transcript, apiCalls, testStartTime, testDurationMs, bottleneckThresholdMs]);

  const { entries, totalDurationMs } = waterfallData;

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
      <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center text-sm">
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
          <div className="w-40 flex-shrink-0 px-2">Name</div>
          <div className="flex-1 flex justify-between px-2">
            <span>0</span>
            <span>{formatDuration(totalDurationMs / 4)}</span>
            <span>{formatDuration(totalDurationMs / 2)}</span>
            <span>{formatDuration((totalDurationMs * 3) / 4)}</span>
            <span>{formatDuration(totalDurationMs)}</span>
          </div>
        </div>

        {/* Entries */}
        <div className="max-h-80 overflow-y-auto">
          {entries.map((entry) => {
            const leftPercent = totalDurationMs > 0 ? (entry.startMs / totalDurationMs) * 100 : 0;
            const widthPercent = totalDurationMs > 0 ? Math.max((entry.durationMs / totalDurationMs) * 100, 0.5) : 0;

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
              <div
                key={entry.id}
                className={cn(
                  'flex items-center h-8 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
                  entry.isBottleneck && 'bg-orange-50 dark:bg-orange-900/10'
                )}
                title={`${entry.name}: ${formatDuration(entry.durationMs)}`}
              >
                {/* Name Column */}
                <div className="w-40 flex-shrink-0 px-2 flex items-center gap-1">
                  <span className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    barColor
                  )} />
                  <span className="text-xs truncate text-gray-700 dark:text-gray-300">
                    {entry.name}
                  </span>
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
