/**
 * FlowConnection Component
 * Renders connections (arrows) between nodes in the flow diagram
 */

import { cn } from '../../../../utils/cn';
import type { FlowConnectionProps } from './types';

/**
 * FlowConnection Component
 * Renders an animated SVG path between nodes with an arrow marker
 */
export function FlowConnection({ connection, isActive, type }: FlowConnectionProps) {
  // Style based on connection type
  const strokeStyles: Record<string, { stroke: string; strokeDasharray?: string; opacity: number }> = {
    sequential: {
      stroke: 'stroke-gray-400 dark:stroke-gray-500',
      opacity: 0.8,
    },
    'parent-child': {
      stroke: 'stroke-purple-400 dark:stroke-purple-500',
      strokeDasharray: '4,4',
      opacity: 0.6,
    },
    retry: {
      stroke: 'stroke-orange-400 dark:stroke-orange-500',
      strokeDasharray: '6,3',
      opacity: 0.7,
    },
  };

  const style = strokeStyles[type] || strokeStyles.sequential;

  // Unique marker ID for this connection
  const markerId = `arrow-${connection.connection.id}`;

  return (
    <g className="flow-connection">
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            className={cn(
              'fill-gray-400 dark:fill-gray-500',
              type === 'parent-child' && 'fill-purple-400 dark:fill-purple-500',
              type === 'retry' && 'fill-orange-400 dark:fill-orange-500',
              isActive && 'fill-blue-500 dark:fill-blue-400'
            )}
          />
        </marker>
      </defs>

      {/* Connection path */}
      <path
        d={connection.path}
        fill="none"
        strokeWidth={isActive ? 2.5 : 2}
        strokeDasharray={style.strokeDasharray}
        markerEnd={`url(#${markerId})`}
        className={cn(
          'transition-all duration-300',
          style.stroke,
          isActive && 'stroke-blue-500 dark:stroke-blue-400'
        )}
        style={{ opacity: isActive ? 1 : style.opacity }}
      />

      {/* Animated particle during active state */}
      {isActive && connection.connection.animated !== false && (
        <circle
          r="4"
          fill="#3B82F6"
          className="animate-pulse"
        >
          <animateMotion
            dur="1.5s"
            repeatCount="indefinite"
            path={connection.path}
          />
        </circle>
      )}
    </g>
  );
}

export default FlowConnection;
