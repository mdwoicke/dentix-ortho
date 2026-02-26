/**
 * LayerSection Component
 * Container for a single layer's nodes in the pipeline view
 */

import { cn } from '../../../../utils/cn';
import type { FlowLayer, FlowNode } from './types';
import { LAYER_CONFIG, getL1Labels } from './types';

// ============================================================================
// TYPES
// ============================================================================

interface LayerSectionProps {
  layer: FlowLayer;
  children: React.ReactNode;
  isActive?: boolean;
  hasError?: boolean;
  className?: string;
  /** Override for L1 label (e.g., "NexHealth" for Chord, "Cloud9" for Ortho) */
  l1Label?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LayerSection({
  layer,
  children,
  isActive = false,
  hasError = false,
  className,
  l1Label,
}: LayerSectionProps) {
  const config = LAYER_CONFIG[layer];
  // For L1, use tenant-aware label if provided
  const displayLabel = layer === 'layer1_cloud9' && l1Label
    ? getL1Labels(l1Label).shortLabel
    : config.shortLabel;

  return (
    <div
      className={cn(
        'relative',
        className
      )}
    >
      {/* Layer header */}
      <div className={cn(
        'flex items-center gap-2 mb-2',
        // Active state
        isActive && 'opacity-100',
        !isActive && 'opacity-60',
      )}>
        {/* Layer color indicator */}
        <div className={cn(
          'w-1 h-4 rounded-full',
          hasError && 'bg-red-500',
          !hasError && [
            layer === 'layer4_flowise' && 'bg-blue-500',
            layer === 'layer3_tools' && 'bg-amber-500',
            layer === 'layer2_nodered' && 'bg-purple-500',
            layer === 'layer1_cloud9' && 'bg-green-500',
          ],
        )} />

        {/* Layer label */}
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-wider',
          hasError && 'text-red-600 dark:text-red-400',
          !hasError && [
            layer === 'layer4_flowise' && 'text-blue-600 dark:text-blue-400',
            layer === 'layer3_tools' && 'text-amber-600 dark:text-amber-400',
            layer === 'layer2_nodered' && 'text-purple-600 dark:text-purple-400',
            layer === 'layer1_cloud9' && 'text-green-600 dark:text-green-400',
          ],
        )}>
          {displayLabel}
        </span>

        {/* Dashed line */}
        <div className={cn(
          'flex-1 border-t border-dashed',
          hasError && 'border-red-300 dark:border-red-700',
          !hasError && [
            layer === 'layer4_flowise' && 'border-blue-200 dark:border-blue-800',
            layer === 'layer3_tools' && 'border-amber-200 dark:border-amber-800',
            layer === 'layer2_nodered' && 'border-purple-200 dark:border-purple-800',
            layer === 'layer1_cloud9' && 'border-green-200 dark:border-green-800',
          ],
        )} />
      </div>

      {/* Layer content */}
      <div className={cn(
        'space-y-2 p-3 rounded-lg',
        // Full border with layer color
        'border-2',
        hasError && 'border-red-300 dark:border-red-600 bg-red-50/30 dark:bg-red-950/20',
        !hasError && [
          layer === 'layer4_flowise' && 'border-blue-300 dark:border-blue-600 bg-blue-50/30 dark:bg-blue-950/20',
          layer === 'layer3_tools' && 'border-amber-300 dark:border-amber-600 bg-amber-50/30 dark:bg-amber-950/20',
          layer === 'layer2_nodered' && 'border-purple-300 dark:border-purple-600 bg-purple-50/30 dark:bg-purple-950/20',
          layer === 'layer1_cloud9' && 'border-green-300 dark:border-green-600 bg-green-50/30 dark:bg-green-950/20',
        ],
      )}>
        {children}
      </div>
    </div>
  );
}

/**
 * Compact layer header for minimal display
 */
export function LayerHeader({
  layer,
  nodeCount,
  isActive = false,
  className,
}: {
  layer: FlowLayer;
  nodeCount?: number;
  isActive?: boolean;
  className?: string;
}) {
  const config = LAYER_CONFIG[layer];

  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1 rounded-lg',
      isActive && 'bg-opacity-20',
      layer === 'layer4_flowise' && (isActive ? 'bg-blue-100 dark:bg-blue-900/30' : ''),
      layer === 'layer3_tools' && (isActive ? 'bg-amber-100 dark:bg-amber-900/30' : ''),
      layer === 'layer2_nodered' && (isActive ? 'bg-purple-100 dark:bg-purple-900/30' : ''),
      layer === 'layer1_cloud9' && (isActive ? 'bg-green-100 dark:bg-green-900/30' : ''),
      className
    )}>
      <div className={cn(
        'w-2 h-2 rounded-full',
        layer === 'layer4_flowise' && 'bg-blue-500',
        layer === 'layer3_tools' && 'bg-amber-500',
        layer === 'layer2_nodered' && 'bg-purple-500',
        layer === 'layer1_cloud9' && 'bg-green-500',
      )} />
      <span className={cn(
        'text-[10px] font-semibold uppercase',
        layer === 'layer4_flowise' && 'text-blue-600 dark:text-blue-400',
        layer === 'layer3_tools' && 'text-amber-600 dark:text-amber-400',
        layer === 'layer2_nodered' && 'text-purple-600 dark:text-purple-400',
        layer === 'layer1_cloud9' && 'text-green-600 dark:text-green-400',
      )}>
        {config.shortLabel}
      </span>
      {nodeCount !== undefined && nodeCount > 0 && (
        <span className="text-[9px] text-gray-400 dark:text-gray-500">
          ({nodeCount})
        </span>
      )}
    </div>
  );
}

export default LayerSection;
