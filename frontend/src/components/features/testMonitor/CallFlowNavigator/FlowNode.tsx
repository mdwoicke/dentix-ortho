/**
 * FlowNode Component
 * Renders an individual node in the flow diagram with phone call monitoring theme
 */

import { cn } from '../../../../utils/cn';
import type { FlowNodeProps, FlowNodeType, FlowNodeStatus, FlowLayer } from './types';
import { LAYER_CONFIG } from './types';
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
  User: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Bot: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Cpu: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  Tool: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Server: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  Chat: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
};

/**
 * Get the icon component for a node type
 */
function getNodeIcon(type: FlowNodeType): React.ReactNode {
  switch (type) {
    case 'user_input':
      return <Icons.Phone />;
    case 'llm_generation':
      return <Icons.Cpu />;
    case 'tool_decision':
      return <Icons.Tool />;
    case 'api_call':
      return <Icons.Server />;
    case 'assistant_response':
      return <Icons.Chat />;
    case 'error_state':
      return <Icons.XCircle />;
  }
}

/**
 * Get the display name for a node type (phone call themed)
 */
function getNodeTypeLabel(type: FlowNodeType): string {
  switch (type) {
    case 'user_input':
      return 'Caller';
    case 'llm_generation':
      return 'AI Processing';
    case 'tool_decision':
      return 'Tool Call';
    case 'api_call':
      return 'API Request';
    case 'assistant_response':
      return 'Agent';
    case 'error_state':
      return 'Error';
  }
}

/**
 * Get the layer badge styling
 */
function getLayerBadge(layer: FlowLayer): { label: string; className: string } {
  const config = LAYER_CONFIG[layer];
  const colorMap: Record<FlowLayer, string> = {
    layer4_flowise: 'bg-blue-600/80 text-white',
    layer3_tools: 'bg-amber-600/80 text-white',
    layer2_nodered: 'bg-purple-600/80 text-white',
    layer1_cloud9: 'bg-green-600/80 text-white',
  };
  return {
    label: config.shortLabel,
    className: colorMap[layer],
  };
}

/**
 * Get the style classes for a node based on type and status
 */
function getNodeStyles(type: FlowNodeType, status: FlowNodeStatus, isActive: boolean, isCompleted: boolean): {
  container: string;
  header: string;
  body: string;
} {
  // Base classes
  const baseContainer = 'rounded-xl border-2 overflow-hidden transition-all duration-300 cursor-pointer';
  let containerClasses = baseContainer;
  let headerClasses = 'px-3 py-1.5 flex items-center gap-2';
  let bodyClasses = 'px-3 py-2';

  // Type-specific colors
  const typeStyles: Record<FlowNodeType, { header: string; body: string; border: string }> = {
    user_input: {
      header: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white',
      body: 'bg-blue-50 dark:bg-blue-900/30',
      border: 'border-blue-400 dark:border-blue-500',
    },
    llm_generation: {
      header: 'bg-gradient-to-r from-purple-500 to-purple-600 text-white',
      body: 'bg-purple-50 dark:bg-purple-900/30',
      border: 'border-purple-400 dark:border-purple-500',
    },
    tool_decision: {
      header: 'bg-gradient-to-r from-amber-500 to-amber-600 text-white',
      body: 'bg-amber-50 dark:bg-amber-900/30',
      border: 'border-amber-400 dark:border-amber-500',
    },
    api_call: {
      header: 'bg-gradient-to-r from-green-500 to-green-600 text-white',
      body: 'bg-green-50 dark:bg-green-900/30',
      border: 'border-green-400 dark:border-green-500',
    },
    assistant_response: {
      header: 'bg-gradient-to-r from-teal-500 to-teal-600 text-white',
      body: 'bg-teal-50 dark:bg-teal-900/30',
      border: 'border-teal-400 dark:border-teal-500',
    },
    error_state: {
      header: 'bg-gradient-to-r from-red-500 to-red-600 text-white',
      body: 'bg-red-50 dark:bg-red-900/30',
      border: 'border-red-400 dark:border-red-500',
    },
  };

  const style = typeStyles[type];
  containerClasses = cn(containerClasses, style.border);
  headerClasses = cn(headerClasses, style.header);
  bodyClasses = cn(bodyClasses, style.body);

  // Status-specific modifications
  if (status === 'error') {
    containerClasses = cn(containerClasses, 'ring-2 ring-red-500 ring-offset-2 dark:ring-offset-gray-900');
  } else if (status === 'bottleneck') {
    containerClasses = cn(containerClasses, 'ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-gray-900');
  }

  // Active state (during playback)
  if (isActive) {
    containerClasses = cn(containerClasses, 'shadow-lg shadow-blue-300/50 dark:shadow-blue-700/50 scale-105 z-10');
  }

  // Completed state (during playback)
  if (isCompleted && !isActive) {
    containerClasses = cn(containerClasses, 'opacity-90');
  }

  // Not yet reached (pending)
  if (!isActive && !isCompleted) {
    containerClasses = cn(containerClasses, 'opacity-60');
  }

  return {
    container: containerClasses,
    header: headerClasses,
    body: bodyClasses,
  };
}

/**
 * FlowNode Component
 */
export function FlowNode({ node, isActive, isCompleted, onClick }: FlowNodeProps) {
  const styles = getNodeStyles(node.type, node.status, isActive, isCompleted);

  return (
    <g
      transform={`translate(${node.position.x}, ${node.position.y})`}
      onClick={() => onClick(node.id)}
      style={{ cursor: 'pointer' }}
    >
      {/* Use foreignObject to render HTML content inside SVG */}
      <foreignObject
        width={node.position.width}
        height={node.position.height}
        className="overflow-visible"
      >
        <div className={styles.container}>
          {/* Header with icon and type */}
          <div className={styles.header}>
            {getNodeIcon(node.type)}
            <span className="text-xs font-semibold uppercase tracking-wide">
              {getNodeTypeLabel(node.type)}
            </span>
            {/* Status indicators */}
            {node.status === 'success' && isCompleted && (
              <span className="ml-auto text-white/80">
                <Icons.CheckCircle />
              </span>
            )}
            {node.status === 'bottleneck' && (
              <span className="ml-auto text-orange-200">
                <Icons.Flame />
              </span>
            )}
            {node.status === 'error' && (
              <span className="ml-auto text-red-200">
                <Icons.XCircle />
              </span>
            )}
          </div>

          {/* Body with label, layer badge, and duration */}
          <div className={styles.body}>
            {/* Layer badge */}
            <div className="mb-1.5">
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shadow-sm',
                getLayerBadge(node.layer).className
              )}>
                {getLayerBadge(node.layer).label}
              </span>
            </div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {node.label}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <Icons.Clock />
              <span className={cn(
                node.status === 'bottleneck' && 'text-orange-600 dark:text-orange-400 font-semibold'
              )}>
                {formatDuration(node.durationMs)}
              </span>
              {node.data.cost !== undefined && node.data.cost !== null && node.data.cost > 0 && (
                <>
                  <span className="mx-1 text-gray-300 dark:text-gray-600">•</span>
                  <span className="text-green-600 dark:text-green-400">${node.data.cost.toFixed(4)}</span>
                </>
              )}
            </div>
            {/* Subtitle (model name or tool name) */}
            {node.subtitle && (
              <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                {node.subtitle}
              </div>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

export default FlowNode;
