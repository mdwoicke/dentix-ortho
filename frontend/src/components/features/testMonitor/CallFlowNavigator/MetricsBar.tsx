/**
 * MetricsBar Component
 * Displays summary metrics for the call flow with professional monitoring theme
 */

import { cn } from '../../../../utils/cn';
import type { MetricsBarProps } from './types';
import { formatDuration } from './flowTransformers';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Phone: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  CurrencyDollar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Server: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  ExclamationCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
  Chip: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  ArrowRight: () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
};

/**
 * MetricCard Component - Individual metric display
 */
interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'default' | 'success' | 'warning' | 'error';
  onClick?: () => void;
  clickable?: boolean;
}

function MetricCard({ icon, label, value, subValue, color = 'default', onClick, clickable }: MetricCardProps) {
  const colorStyles = {
    default: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    warning: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  };

  const iconColors = {
    default: 'text-gray-500 dark:text-gray-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-orange-600 dark:text-orange-400',
    error: 'text-red-600 dark:text-red-400',
  };

  const valueColors = {
    default: 'text-gray-900 dark:text-gray-100',
    success: 'text-green-700 dark:text-green-300',
    warning: 'text-orange-700 dark:text-orange-300',
    error: 'text-red-700 dark:text-red-300',
  };

  return (
    <div
      onClick={clickable && onClick ? onClick : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg border transition-all',
        colorStyles[color],
        clickable && onClick && 'cursor-pointer hover:shadow-md hover:scale-[1.02]'
      )}
    >
      <div className={iconColors[color]}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </div>
        <div className={cn('text-sm font-bold', valueColors[color])}>
          {value}
          {subValue && (
            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
              {subValue}
            </span>
          )}
        </div>
      </div>
      {clickable && onClick && (
        <div className={cn('opacity-50', iconColors[color])}>
          <Icons.ArrowRight />
        </div>
      )}
    </div>
  );
}

/**
 * MetricsBar Component
 */
export function MetricsBar({
  totalDurationMs,
  totalCost,
  apiCallCount,
  errorCount,
  bottleneckCount,
  tokenUsage,
  onJumpToError,
  onJumpToBottleneck,
}: MetricsBarProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
      {/* Header with call indicator */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-sm">
          <Icons.Phone />
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            Call Metrics
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span>Live monitoring</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {/* Duration */}
        <MetricCard
          icon={<Icons.Clock />}
          label="Duration"
          value={formatDuration(totalDurationMs)}
          color="default"
        />

        {/* Cost */}
        <MetricCard
          icon={<Icons.CurrencyDollar />}
          label="Cost"
          value={`$${totalCost.toFixed(4)}`}
          color="success"
        />

        {/* API Calls */}
        <MetricCard
          icon={<Icons.Server />}
          label="API Calls"
          value={apiCallCount}
          color="default"
        />

        {/* Tokens */}
        <MetricCard
          icon={<Icons.Chip />}
          label="Tokens"
          value={tokenUsage.total.toLocaleString()}
          subValue={`(${tokenUsage.input.toLocaleString()} in / ${tokenUsage.output.toLocaleString()} out)`}
          color="default"
        />

        {/* Errors */}
        <MetricCard
          icon={<Icons.ExclamationCircle />}
          label="Errors"
          value={errorCount}
          color={errorCount > 0 ? 'error' : 'success'}
          onClick={onJumpToError}
          clickable={errorCount > 0}
        />

        {/* Bottlenecks */}
        <MetricCard
          icon={<Icons.Flame />}
          label="Bottlenecks"
          value={bottleneckCount}
          subValue={bottleneckCount > 0 ? '(>2s)' : undefined}
          color={bottleneckCount > 0 ? 'warning' : 'success'}
          onClick={onJumpToBottleneck}
          clickable={bottleneckCount > 0}
        />
      </div>
    </div>
  );
}

export default MetricsBar;
