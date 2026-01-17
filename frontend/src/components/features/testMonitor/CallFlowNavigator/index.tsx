/**
 * CallFlowNavigator Component
 * Interactive Voice Assistant Journey Visualization
 *
 * Features:
 * - Customer journey map showing IVA conversation flow
 * - Stage-based progression (Connect, Understand, Process, Resolve)
 * - Animated playback with timeline scrubbing
 * - Click-to-reveal details for each node
 * - Error and bottleneck highlighting
 * - Professional call center monitoring theme
 */

import { useState, useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import type { CallFlowNavigatorProps } from './types';
import { transformToFlowData } from './flowTransformers';
import { formatDuration } from './flowTransformers';
import { FlowViewPopout } from './FlowViewPopout';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Phone: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  Expand: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Dollar: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Users: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Server: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  Activity: () => (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
};

// ============================================================================
// METRIC CARD COMPONENT
// ============================================================================

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: 'default' | 'success' | 'warning' | 'error';
}

function MetricCard({ icon, label, value, color = 'default' }: MetricCardProps) {
  const colorStyles = {
    default: 'text-gray-600 dark:text-gray-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-orange-600 dark:text-orange-400',
    error: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="flex items-center gap-3">
      <div className={cn('opacity-60', colorStyles[color])}>
        {icon}
      </div>
      <div>
        <div className={cn('text-lg font-bold', colorStyles[color])}>
          {value}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {label}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CallFlowNavigator({
  observations,
  transcript,
  traceStartTime,
  traceDurationMs,
  bottleneckThresholdMs = 2000,
  langfuseHost,
  traceId,
}: CallFlowNavigatorProps) {
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);

  // Transform data into flow structure
  const flowData = useMemo(() => {
    return transformToFlowData(
      observations,
      transcript,
      traceStartTime,
      bottleneckThresholdMs
    );
  }, [observations, transcript, traceStartTime, bottleneckThresholdMs]);

  // Total duration for display
  const totalDurationMs = traceDurationMs || flowData.totalDurationMs;

  // Count conversation turns
  const conversationTurns = useMemo(() => {
    return flowData.nodes.filter(
      n => n.type === 'user_input' || n.type === 'assistant_response'
    ).length;
  }, [flowData.nodes]);

  // Empty state
  if (flowData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500">
          <Icons.Activity />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          No Flow Data Available
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md">
          This trace doesn't have enough observation data to generate a flow visualization.
          Traces require Langfuse observations to render the journey map.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Summary Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center text-white">
              <Icons.Phone />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                IVA Journey Navigator
              </h3>
              <p className="text-sm text-white/70">
                Interactive visualization of the call flow
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            <MetricCard
              icon={<Icons.Clock />}
              label="Duration"
              value={formatDuration(totalDurationMs)}
            />
            <MetricCard
              icon={<Icons.Dollar />}
              label="Cost"
              value={`$${flowData.totalCost.toFixed(4)}`}
              color="success"
            />
            <MetricCard
              icon={<Icons.Users />}
              label="Turns"
              value={conversationTurns}
            />
            <MetricCard
              icon={<Icons.Server />}
              label="API Calls"
              value={flowData.apiCallCount}
            />
            {flowData.errorCount > 0 && (
              <MetricCard
                icon={<Icons.XCircle />}
                label="Errors"
                value={flowData.errorCount}
                color="error"
              />
            )}
            {flowData.bottleneckCount > 0 && (
              <MetricCard
                icon={<Icons.Flame />}
                label="Bottlenecks"
                value={flowData.bottleneckCount}
                color="warning"
              />
            )}
          </div>
        </div>

        {/* Journey Preview */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Stage indicators */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Connect</span>
                </div>
                <Icons.ChevronRight />
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Understand</span>
                </div>
                <Icons.ChevronRight />
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Process</span>
                </div>
                <Icons.ChevronRight />
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Resolve</span>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400">
              {flowData.nodes.length} steps in journey
            </div>
          </div>
        </div>

        {/* Open Full View Button */}
        <div className="px-6 py-4">
          <button
            onClick={() => setIsPopoutOpen(true)}
            className={cn(
              'w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl',
              'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold',
              'hover:from-blue-700 hover:to-indigo-700 transition-all duration-200',
              'shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30',
              'transform hover:scale-[1.02]'
            )}
          >
            <Icons.Expand />
            <span>Open Full Journey View</span>
          </button>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
            Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">Esc</kbd> to close the full view
          </p>
        </div>
      </div>

      {/* Full Screen Popout */}
      <FlowViewPopout
        isOpen={isPopoutOpen}
        onClose={() => setIsPopoutOpen(false)}
        flowData={flowData}
        totalDurationMs={totalDurationMs}
        langfuseHost={langfuseHost}
        traceId={traceId}
      />
    </>
  );
}

export default CallFlowNavigator;
