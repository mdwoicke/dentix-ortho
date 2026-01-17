/**
 * DataFlowArrow Component
 * Animated arrow showing data flow between pipeline layers
 */

import { cn } from '../../../../utils/cn';
import type { FlowLayer } from './types';

// ============================================================================
// TYPES
// ============================================================================

interface DataFlowArrowProps {
  direction?: 'down' | 'up';
  isActive?: boolean;
  fromLayer?: FlowLayer;
  toLayer?: FlowLayer;
  className?: string;
  label?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DataFlowArrow({
  direction = 'down',
  isActive = false,
  fromLayer,
  toLayer,
  className,
  label,
}: DataFlowArrowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center py-1',
        className
      )}
    >
      <div className="flex flex-col items-center gap-0.5">
        {/* Arrow with animation */}
        <div className={cn(
          'relative flex flex-col items-center',
          isActive && 'animate-pulse'
        )}>
          {/* Vertical line */}
          <div className={cn(
            'w-0.5 h-4 rounded-full transition-colors duration-300',
            isActive
              ? 'bg-gradient-to-b from-blue-400 to-indigo-500'
              : 'bg-gray-300 dark:bg-gray-600',
          )} />

          {/* Arrow head */}
          <svg
            className={cn(
              'w-3 h-3 transition-colors duration-300',
              direction === 'up' && 'rotate-180',
              isActive
                ? 'text-indigo-500'
                : 'text-gray-300 dark:text-gray-600',
            )}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>

          {/* Animated dot for active state */}
          {isActive && (
            <div className={cn(
              'absolute w-1.5 h-1.5 rounded-full bg-blue-500',
              'animate-bounce',
              direction === 'down' ? 'top-0' : 'bottom-0',
            )} />
          )}
        </div>

        {/* Optional label */}
        {label && (
          <span className={cn(
            'text-[9px] font-medium uppercase tracking-wider',
            isActive
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-400 dark:text-gray-500',
          )}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Layer transition arrow - shows the layer name transition
 */
export function LayerTransitionArrow({
  fromLayer,
  toLayer,
  isActive = false,
  className,
}: {
  fromLayer?: FlowLayer;
  toLayer?: FlowLayer;
  isActive?: boolean;
  className?: string;
}) {
  const layerColors: Record<FlowLayer, string> = {
    layer4_flowise: 'blue',
    layer3_tools: 'amber',
    layer2_nodered: 'purple',
    layer1_cloud9: 'green',
  };

  const fromColor = fromLayer ? layerColors[fromLayer] : 'gray';
  const toColor = toLayer ? layerColors[toLayer] : 'gray';

  return (
    <div className={cn('flex items-center justify-center py-1', className)}>
      <div className="flex flex-col items-center">
        {/* Gradient line */}
        <div
          className={cn(
            'w-0.5 h-6 rounded-full transition-all duration-300',
            isActive && 'animate-pulse',
          )}
          style={{
            background: isActive
              ? `linear-gradient(to bottom, var(--${fromColor}-500), var(--${toColor}-500))`
              : undefined,
          }}
        />

        {/* Arrow */}
        <svg
          className={cn(
            'w-4 h-4 transition-colors duration-300',
            isActive
              ? `text-${toColor}-500`
              : 'text-gray-300 dark:text-gray-600',
          )}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}

export default DataFlowArrow;
