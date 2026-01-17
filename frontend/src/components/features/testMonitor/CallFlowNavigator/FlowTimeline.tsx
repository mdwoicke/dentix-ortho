/**
 * FlowTimeline Component
 * A vertical, card-based timeline view of the call flow
 * Replaces the unreadable horizontal SVG diagram with a clean, professional design
 */

import { useState, useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import type { FlowNode, FlowLayer, FlowNodeStatus, FlowNodeType } from './types';
import { LAYER_CONFIG } from './types';
import { formatDuration } from './flowTransformers';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  ChevronDown: ({ className }: { className?: string }) => (
    <svg className={cn("w-4 h-4", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <svg className={cn("w-4 h-4", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  User: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Bot: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Cpu: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  Tool: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
  CheckCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
  Dollar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface FlowTimelineProps {
  nodes: FlowNode[];
  onNodeClick: (node: FlowNode) => void;
  currentTimeMs: number;
  activeNodeIds: Set<string>;
  completedNodeIds: Set<string>;
}

interface ConversationGroup {
  turnNode: FlowNode;
  childNodes: FlowNode[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNodeIcon(type: FlowNodeType) {
  switch (type) {
    case 'user_input': return <Icons.User />;
    case 'llm_generation': return <Icons.Cpu />;
    case 'tool_decision': return <Icons.Tool />;
    case 'api_call': return <Icons.Server />;
    case 'assistant_response': return <Icons.Bot />;
    case 'error_state': return <Icons.XCircle />;
  }
}

function getNodeTypeLabel(type: FlowNodeType): string {
  switch (type) {
    case 'user_input': return 'User Message';
    case 'llm_generation': return 'AI Processing';
    case 'tool_decision': return 'Tool Call';
    case 'api_call': return 'API Request';
    case 'assistant_response': return 'Assistant Response';
    case 'error_state': return 'Error';
  }
}

function getLayerStyle(layer: FlowLayer) {
  const styles: Record<FlowLayer, { bg: string; text: string; border: string }> = {
    layer4_flowise: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    layer3_tools: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
    layer2_nodered: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30' },
    layer1_cloud9: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
  };
  return styles[layer];
}

function getStatusStyle(status: FlowNodeStatus) {
  const styles: Record<FlowNodeStatus, { bg: string; text: string; icon: React.ReactNode }> = {
    success: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', icon: <Icons.CheckCircle /> },
    error: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', icon: <Icons.XCircle /> },
    bottleneck: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', icon: <Icons.Flame /> },
    pending: { bg: 'bg-gray-500/10', text: 'text-gray-500 dark:text-gray-400', icon: <Icons.Clock /> },
  };
  return styles[status];
}

function getNodeBorderColor(type: FlowNodeType, status: FlowNodeStatus): string {
  if (status === 'error') return 'border-l-red-500';
  if (status === 'bottleneck') return 'border-l-orange-500';

  const colors: Record<FlowNodeType, string> = {
    user_input: 'border-l-blue-500',
    llm_generation: 'border-l-purple-500',
    tool_decision: 'border-l-amber-500',
    api_call: 'border-l-green-500',
    assistant_response: 'border-l-teal-500',
    error_state: 'border-l-red-500',
  };
  return colors[type];
}

// ============================================================================
// FLOW CARD COMPONENT
// ============================================================================

interface FlowCardProps {
  node: FlowNode;
  onClick: () => void;
  isActive: boolean;
  isCompleted: boolean;
  isExpanded?: boolean;
  childCount?: number;
  onToggle?: () => void;
  depth?: number;
}

function FlowCard({
  node,
  onClick,
  isActive,
  isCompleted,
  isExpanded,
  childCount = 0,
  onToggle,
  depth = 0,
}: FlowCardProps) {
  const layerStyle = getLayerStyle(node.layer);
  const statusStyle = getStatusStyle(node.status);
  const borderColor = getNodeBorderColor(node.type, node.status);

  const isConversationNode = node.type === 'user_input' || node.type === 'assistant_response';

  return (
    <div
      className={cn(
        'group relative',
        depth > 0 && 'ml-6',
      )}
    >
      {/* Connector line for nested items */}
      {depth > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 -translate-x-3" />
      )}

      <div
        onClick={onClick}
        className={cn(
          'relative border-l-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
          'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer',
          borderColor,
          isActive && 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20',
          !isCompleted && !isActive && 'opacity-60',
        )}
      >
        {/* Card Header */}
        <div className="flex items-center gap-3 p-4">
          {/* Expand/collapse for conversation nodes */}
          {isConversationNode && childCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.();
              }}
              className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              {isExpanded ? (
                <Icons.ChevronDown className="text-gray-500" />
              ) : (
                <Icons.ChevronRight className="text-gray-500" />
              )}
            </button>
          )}

          {/* Icon */}
          <div className={cn(
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
            node.type === 'user_input' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            node.type === 'assistant_response' && 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
            node.type === 'llm_generation' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
            node.type === 'tool_decision' && 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
            node.type === 'api_call' && 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
            node.type === 'error_state' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
          )}>
            {getNodeIcon(node.type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {getNodeTypeLabel(node.type)}
              </span>

              {/* Layer badge */}
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                layerStyle.bg, layerStyle.text
              )}>
                {LAYER_CONFIG[node.layer].shortLabel}
              </span>

              {/* Status badge */}
              {node.status !== 'pending' && (
                <span className={cn(
                  'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                  statusStyle.bg, statusStyle.text
                )}>
                  {statusStyle.icon}
                  <span className="capitalize">{node.status}</span>
                </span>
              )}
            </div>

            {/* Label/Name */}
            <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {node.label}
            </div>

            {/* Subtitle (model/tool name) */}
            {node.subtitle && (
              <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                {node.subtitle}
              </div>
            )}
          </div>

          {/* Right side metrics */}
          <div className="flex-shrink-0 text-right">
            <div className={cn(
              'flex items-center gap-1 text-sm font-medium',
              node.status === 'bottleneck' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'
            )}>
              <Icons.Clock />
              {formatDuration(node.durationMs)}
            </div>

            {node.data.cost != null && node.data.cost > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-1">
                <Icons.Dollar />
                ${node.data.cost.toFixed(4)}
              </div>
            )}

            {childCount > 0 && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {childCount} step{childCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Content preview for conversation nodes */}
        {isConversationNode && node.data.content && (
          <div className="px-4 pb-4 pt-0">
            <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 line-clamp-2">
              {node.data.content}
            </div>
          </div>
        )}

        {/* Active indicator */}
        {isActive && (
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FLOW TIMELINE COMPONENT
// ============================================================================

export function FlowTimeline({
  nodes,
  onNodeClick,
  currentTimeMs,
  activeNodeIds,
  completedNodeIds,
}: FlowTimelineProps) {
  // Track expanded state for conversation groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Group nodes by conversation turns
  const groups = useMemo(() => {
    const result: ConversationGroup[] = [];
    const sortedNodes = [...nodes].sort((a, b) => a.startMs - b.startMs);

    // Separate conversation nodes from observation nodes
    const conversationNodes = sortedNodes.filter(
      n => n.type === 'user_input' || n.type === 'assistant_response'
    );
    const observationNodes = sortedNodes.filter(
      n => n.type !== 'user_input' && n.type !== 'assistant_response'
    );

    // Create groups for each conversation turn
    conversationNodes.forEach((turnNode, idx) => {
      const nextTurnStart = conversationNodes[idx + 1]?.startMs ?? Infinity;

      // Find observations that belong to this turn (between this turn and next)
      const childNodes = observationNodes.filter(
        obs => obs.startMs >= turnNode.startMs && obs.startMs < nextTurnStart
      );

      result.push({
        turnNode,
        childNodes,
      });
    });

    // If there are observation nodes before any conversation, add them
    const earliestConversation = conversationNodes[0]?.startMs ?? Infinity;
    const orphanedNodes = observationNodes.filter(n => n.startMs < earliestConversation);
    if (orphanedNodes.length > 0) {
      result.unshift({
        turnNode: orphanedNodes[0],
        childNodes: orphanedNodes.slice(1),
      });
    }

    return result;
  }, [nodes]);

  const toggleGroup = (nodeId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Auto-expand groups with errors or active nodes
  useMemo(() => {
    const newExpanded = new Set(expandedGroups);
    groups.forEach(group => {
      const hasError = group.childNodes.some(n => n.status === 'error');
      const hasActive = group.childNodes.some(n => activeNodeIds.has(n.id));
      if (hasError || hasActive) {
        newExpanded.add(group.turnNode.id);
      }
    });
    if (newExpanded.size !== expandedGroups.size) {
      setExpandedGroups(newExpanded);
    }
  }, [groups, activeNodeIds]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Icons.Clock />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          No Flow Data
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          This trace doesn't have enough data to generate a flow visualization.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group, groupIndex) => {
        const isExpanded = expandedGroups.has(group.turnNode.id);
        const isGroupActive = activeNodeIds.has(group.turnNode.id) ||
          group.childNodes.some(n => activeNodeIds.has(n.id));
        const isGroupCompleted = completedNodeIds.has(group.turnNode.id) ||
          group.turnNode.startMs + group.turnNode.durationMs <= currentTimeMs;

        return (
          <div key={group.turnNode.id} className="relative">
            {/* Timeline connector */}
            {groupIndex > 0 && (
              <div className="absolute left-6 -top-3 w-px h-3 bg-gray-200 dark:bg-gray-700" />
            )}

            {/* Main turn card */}
            <FlowCard
              node={group.turnNode}
              onClick={() => onNodeClick(group.turnNode)}
              isActive={activeNodeIds.has(group.turnNode.id)}
              isCompleted={isGroupCompleted}
              isExpanded={isExpanded}
              childCount={group.childNodes.length}
              onToggle={() => toggleGroup(group.turnNode.id)}
            />

            {/* Child nodes (expanded) */}
            {isExpanded && group.childNodes.length > 0 && (
              <div className="mt-2 space-y-2">
                {group.childNodes.map((childNode) => (
                  <FlowCard
                    key={childNode.id}
                    node={childNode}
                    onClick={() => onNodeClick(childNode)}
                    isActive={activeNodeIds.has(childNode.id)}
                    isCompleted={
                      completedNodeIds.has(childNode.id) ||
                      childNode.startMs + childNode.durationMs <= currentTimeMs
                    }
                    depth={1}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FlowTimeline;
