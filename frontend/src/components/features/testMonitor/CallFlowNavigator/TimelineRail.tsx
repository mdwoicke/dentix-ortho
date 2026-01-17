/**
 * TimelineRail Component
 * Horizontal timeline showing event markers with click-to-jump functionality
 */

import { useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import type { TimelineRailProps } from './types';
import { formatDuration } from './flowTransformers';

/**
 * TimelineRail Component
 */
export function TimelineRail({
  totalDurationMs,
  currentTimeMs,
  events,
  onTimeClick,
}: TimelineRailProps) {
  // Calculate marker positions
  const markers = useMemo(() => {
    if (totalDurationMs === 0) return [];

    return events.map(event => ({
      ...event,
      position: (event.timeMs / totalDurationMs) * 100,
    }));
  }, [events, totalDurationMs]);

  // Calculate current position percentage
  const currentPosition = totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0;

  // Time scale markers (0%, 25%, 50%, 75%, 100%)
  const timeScaleMarkers = [0, 25, 50, 75, 100].map(percent => ({
    percent,
    timeMs: (percent / 100) * totalDurationMs,
  }));

  // Handle click on timeline
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    const timeMs = (percent / 100) * totalDurationMs;
    onTimeClick(Math.max(0, Math.min(totalDurationMs, timeMs)));
  };

  if (totalDurationMs === 0) {
    return (
      <div className="h-12 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center text-sm text-gray-400">
        No timeline data
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      {/* Timeline header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Timeline
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Click to jump • {formatDuration(currentTimeMs)} / {formatDuration(totalDurationMs)}
        </span>
      </div>

      {/* Timeline track */}
      <div
        className="relative h-8 cursor-pointer group"
        onClick={handleClick}
      >
        {/* Background track */}
        <div className="absolute inset-y-2 left-0 right-0 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600 transition-all duration-150"
            style={{ width: `${currentPosition}%` }}
          />

          {/* Hover highlight */}
          <div className="absolute inset-0 bg-blue-200/0 group-hover:bg-blue-200/20 dark:group-hover:bg-blue-700/20 transition-colors" />
        </div>

        {/* Event markers */}
        {markers.map((marker, idx) => (
          <div
            key={`${marker.nodeId}-${idx}`}
            className="absolute top-0 bottom-0 w-0 flex items-center justify-center pointer-events-none"
            style={{ left: `${marker.position}%` }}
          >
            <div
              className={cn(
                'w-3 h-3 rounded-full border-2 transition-all',
                marker.timeMs <= currentTimeMs
                  ? 'bg-blue-500 border-blue-400 dark:border-blue-600'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
              )}
              title={`Event at ${formatDuration(marker.timeMs)}`}
            />
          </div>
        ))}

        {/* Current position indicator */}
        <div
          className="absolute top-0 bottom-0 w-0 flex items-center justify-center transition-all duration-150 pointer-events-none"
          style={{ left: `${currentPosition}%` }}
        >
          <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900 shadow-lg" />
          {/* Pulse animation */}
          <div className="absolute w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-50" />
        </div>
      </div>

      {/* Time scale */}
      <div className="relative mt-1 h-4">
        {timeScaleMarkers.map(marker => (
          <div
            key={marker.percent}
            className="absolute text-[10px] text-gray-400 dark:text-gray-500 transform -translate-x-1/2"
            style={{ left: `${marker.percent}%` }}
          >
            {formatDuration(marker.timeMs)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimelineRail;
