/**
 * DataPipelineView Component
 * Main component for displaying call flow as a vertical data pipeline
 *
 * Features:
 * - Vertical data flow visualization (top to bottom)
 * - Turn-based grouping (user input → processing → response)
 * - Layer-specific coloring (L4 Flowise, L3 Tools, L2 Node-RED, L1 Cloud9)
 * - Collapsible input/output panels
 * - Error highlighting at failure point
 * - Playback integration with auto-scroll
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { cn } from '../../../../utils/cn';
import type { FlowNode } from './types';
import { LAYER_CONFIG } from './types';
import { formatDuration } from './flowTransformers';
import { transformToPipelineData } from './pipelineTransformers';
import { TurnPipeline } from './TurnPipeline';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Layers: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  ArrowDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
  Bot: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  X: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface TimelineEvent {
  nodeId: string;
  timeMs: number;
  type: string;
}

interface FlowDebugInfo {
  rawObservationCount: number;
  filteredObservationCount: number;
  transcriptTurnCount: number;
  observationNames: string[];
}

interface DataPipelineViewProps {
  nodes: FlowNode[];
  onNodeClick: (node: FlowNode) => void;
  currentTimeMs: number;
  activeNodeIds: Set<string>;
  completedNodeIds: Set<string>;
  totalDurationMs: number;
  events?: TimelineEvent[];
  onJumpToStep?: (stepIndex: number) => void;
  flowDebug?: FlowDebugInfo;
  // Search props (managed by parent FlowViewPopout)
  searchMatchingNodeIds?: Set<string>;
  focusedSearchNodeId?: string | null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DataPipelineView({
  nodes,
  onNodeClick,
  currentTimeMs,
  activeNodeIds,
  completedNodeIds,
  totalDurationMs,
  events = [],
  onJumpToStep,
  flowDebug,
  searchMatchingNodeIds = new Set<string>(),
  focusedSearchNodeId = null,
}: DataPipelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFullIO, setShowFullIO] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [currentErrorIndex, setCurrentErrorIndex] = useState(0);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Get all error nodes for navigation, sorted by start time
  const errorNodes = useMemo(() => {
    return nodes.filter(n => n.status === 'error').sort((a, b) => a.startMs - b.startMs);
  }, [nodes]);

  // Jump to a specific error node
  const jumpToError = (index: number) => {
    if (errorNodes.length === 0) return;

    const wrappedIndex = index % errorNodes.length;
    setCurrentErrorIndex(wrappedIndex);

    const errorNode = errorNodes[wrappedIndex];
    if (scrollRef.current && errorNode) {
      // Find which turn contains this error node
      const errorTurn = pipelineTurns.find(turn => {
        return errorNode.startMs >= turn.startMs && errorNode.startMs < turn.endMs;
      });

      // First, scroll the turn into view (instant scroll)
      if (errorTurn) {
        const turnElement = scrollRef.current.querySelector(`[data-turn="${errorTurn.id}"]`);
        if (turnElement) {
          turnElement.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }

      // Then find and scroll to the specific node with highlighting
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const nodeElement = scrollRef.current?.querySelector(`[data-node-id="${errorNode.id}"]`);
        if (nodeElement) {
          nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight the node
          nodeElement.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
          setTimeout(() => {
            nodeElement.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2');
          }, 2000);
        }
      });

      // Also trigger the node click to show details
      onNodeClick(errorNode);
    }
  };

  // Jump to previous error
  const jumpToPreviousError = () => {
    if (errorNodes.length === 0) return;
    const newIndex = (currentErrorIndex - 1 + errorNodes.length) % errorNodes.length;
    jumpToError(newIndex);
  };

  // Jump to next error (for cycling through errors)
  const jumpToNextError = () => {
    jumpToError(currentErrorIndex + 1);
  };


  // Debug: Analyze all nodes by layer and type
  const debugInfo = useMemo(() => {
    const byLayer = {
      flowise: nodes.filter(n => n.layer === 'layer4_flowise'),
      tools: nodes.filter(n => n.layer === 'layer3_tools'),
      nodeRed: nodes.filter(n => n.layer === 'layer2_nodered'),
      cloud9: nodes.filter(n => n.layer === 'layer1_cloud9'),
    };
    const byType = {
      user_input: nodes.filter(n => n.type === 'user_input'),
      assistant_response: nodes.filter(n => n.type === 'assistant_response'),
      llm_generation: nodes.filter(n => n.type === 'llm_generation'),
      tool_decision: nodes.filter(n => n.type === 'tool_decision'),
      api_call: nodes.filter(n => n.type === 'api_call'),
      error_state: nodes.filter(n => n.type === 'error_state'),
    };
    // Get observation details with input/output structure
    const observationDetails = nodes
      .filter(n => n.type !== 'user_input' && n.type !== 'assistant_response')
      .map(n => {
        // Extract key fields from input/output to help debug
        const inputKeys = n.data.input ? Object.keys(n.data.input as object) : [];
        const outputKeys = n.data.output ? Object.keys(n.data.output as object) : [];
        const inputAction = (n.data.input as Record<string, unknown>)?.action;
        const inputTool = (n.data.input as Record<string, unknown>)?.tool;
        return {
          id: n.id,
          label: n.label,
          subtitle: n.subtitle,
          type: n.type,
          layer: n.layer,
          hasInput: !!n.data.input,
          hasOutput: !!n.data.output,
          inputKeys,
          outputKeys,
          inputAction: inputAction as string | undefined,
          inputTool: inputTool as string | undefined,
          durationMs: n.durationMs,
        };
      });
    // Get ALL nodes for debugging (including user/assistant)
    const allNodeDetails = nodes.map(n => ({
      id: n.id,
      label: n.label,
      subtitle: n.subtitle,
      type: n.type,
      layer: n.layer,
      hasObservationId: !!n.data.observationId,
      observationId: n.data.observationId,
    }));
    return { byLayer, byType, observationDetails, allNodeDetails, totalNodes: nodes.length };
  }, [nodes]);

  // Transform nodes into pipeline turns
  const pipelineTurns = useMemo(() => {
    return transformToPipelineData(nodes, totalDurationMs);
  }, [nodes, totalDurationMs]);

  // Find the active turn index
  const activeTurnIndex = useMemo(() => {
    return pipelineTurns.findIndex(turn => {
      if (turn.userInput && activeNodeIds.has(turn.userInput.id)) return true;
      if (turn.assistantResponse && activeNodeIds.has(turn.assistantResponse.id)) return true;
      if (turn.layerNodes.flowise.some(n => activeNodeIds.has(n.id))) return true;
      if (turn.layerNodes.tools.some(n => activeNodeIds.has(n.id))) return true;
      if (turn.layerNodes.nodeRed.some(n => activeNodeIds.has(n.id))) return true;
      if (turn.layerNodes.cloud9.some(n => activeNodeIds.has(n.id))) return true;
      return false;
    });
  }, [pipelineTurns, activeNodeIds]);

  // Auto-scroll to active turn (when enabled)
  useEffect(() => {
    if (autoScrollEnabled && activeTurnIndex >= 0 && scrollRef.current) {
      const turnElement = scrollRef.current.querySelector(`[data-turn="pipeline-turn-${activeTurnIndex}"]`);
      turnElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeTurnIndex, autoScrollEnabled]);

  // Auto-scroll to focused search node when it changes
  useEffect(() => {
    if (!focusedSearchNodeId || !scrollRef.current) return;

    // Find the node in the nodes array to get its timing
    const focusedNode = nodes.find(n => n.id === focusedSearchNodeId);
    if (!focusedNode) return;

    // Find which turn contains this node
    const turn = pipelineTurns.find(t => {
      return focusedNode.startMs >= t.startMs && focusedNode.startMs < t.endMs;
    });

    // First, scroll the turn into view (instant scroll)
    if (turn) {
      const turnElement = scrollRef.current.querySelector(`[data-turn="${turn.id}"]`);
      if (turnElement) {
        turnElement.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }

    // Then find and scroll to the specific node with highlighting
    requestAnimationFrame(() => {
      const nodeElement = scrollRef.current?.querySelector(`[data-node-id="${focusedSearchNodeId}"]`);
      if (nodeElement) {
        nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add temporary highlight effect
        nodeElement.classList.add('ring-2', 'ring-orange-500', 'ring-offset-2', 'animate-pulse');
        setTimeout(() => {
          nodeElement.classList.remove('ring-2', 'ring-orange-500', 'ring-offset-2', 'animate-pulse');
        }, 1500);
      }
    });
  }, [focusedSearchNodeId, nodes, pipelineTurns]);

  // Handle turn navigation click
  const handleTurnClick = (turnIndex: number) => {
    const turn = pipelineTurns[turnIndex];
    if (!turn || !scrollRef.current) return;

    // First, scroll the turn into view (instant scroll)
    const turnElement = scrollRef.current.querySelector(`[data-turn="${turn.id}"]`);
    if (turnElement) {
      turnElement.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    // If this turn has an error, scroll to and highlight the error node
    if (turn.hasError && turn.errorNode) {
      requestAnimationFrame(() => {
        const nodeElement = scrollRef.current?.querySelector(`[data-node-id="${turn.errorNode!.id}"]`);
        if (nodeElement) {
          nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight the node
          nodeElement.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
          setTimeout(() => {
            nodeElement.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2');
          }, 2000);
        }
      });
      // Show the error node details
      onNodeClick(turn.errorNode);
    }

    // If onJumpToStep is provided, find the corresponding event index
    if (onJumpToStep) {
      const firstNode = turn.userInput ||
        turn.layerNodes.flowise[0] ||
        turn.layerNodes.tools[0] ||
        turn.layerNodes.nodeRed[0] ||
        turn.layerNodes.cloud9[0] ||
        turn.assistantResponse;

      if (firstNode) {
        const eventIndex = events.findIndex(e => e.nodeId === firstNode.id);
        if (eventIndex >= 0) {
          onJumpToStep(eventIndex);
        }
      }
    }
  };

  // Count errors and bottlenecks
  const errorCount = useMemo(() => {
    return nodes.filter(n => n.status === 'error').length;
  }, [nodes]);

  const bottleneckCount = useMemo(() => {
    return nodes.filter(n => n.status === 'bottleneck').length;
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Icons.Bot />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          No Pipeline Data
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          This trace doesn't have data to visualize in the pipeline view.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sticky Error Banner - Always visible when errors exist */}
      {errorCount > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Icons.XCircle />
              <span className="font-semibold">
                {errorCount} Error{errorCount > 1 ? 's' : ''} Found
              </span>
            </div>
            <span className="text-red-100 text-sm">
              ({currentErrorIndex + 1} of {errorCount})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={jumpToPreviousError}
              className="p-1.5 hover:bg-red-400/30 rounded-lg transition-colors"
              title="Previous error"
            >
              <Icons.ChevronLeft />
            </button>
            <button
              onClick={() => jumpToError(currentErrorIndex)}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              Jump to Error
            </button>
            <button
              onClick={jumpToNextError}
              className="p-1.5 hover:bg-red-400/30 rounded-lg transition-colors"
              title="Next error"
            >
              <Icons.ChevronRight />
            </button>
          </div>
        </div>
      )}

      {/* Compact Header - Single row with all controls */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* Left: Turn Navigation (compact) */}
        <div className="flex items-center gap-2 min-w-0">
          {pipelineTurns.length > 1 && (
            <>
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">Turn:</span>
              <div className="flex items-center gap-0.5">
                {pipelineTurns.map((turn, idx) => (
                  <button
                    key={turn.id}
                    onClick={() => handleTurnClick(idx)}
                    className={cn(
                      'w-6 h-6 rounded text-[10px] font-bold transition-all relative',
                      idx === activeTurnIndex && [
                        'ring-1 ring-offset-1 scale-110',
                        turn.hasError ? 'ring-red-500 bg-red-500 text-white' : 'ring-blue-500 bg-blue-500 text-white',
                      ],
                      idx !== activeTurnIndex && [
                        turn.hasError
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                      ],
                    )}
                    title={turn.hasError ? `Turn ${idx + 1} - Has Error` : `Turn ${idx + 1}`}
                  >
                    {idx + 1}
                    {/* Error indicator dot */}
                    {turn.hasError && idx !== activeTurnIndex && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 border border-white dark:border-gray-900 rounded-full animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Center: Layer Legend */}
        <div className="flex items-center gap-3">
          {[
            { color: 'bg-blue-500', label: 'L4 Flowise' },
            { color: 'bg-amber-500', label: 'L3 Tools' },
            { color: 'bg-purple-500', label: 'L2 Node-RED' },
            { color: 'bg-green-500', label: 'L1 Cloud9' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={cn('w-2 h-2 rounded-full', color)} />
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Right: Status & Controls */}
        <div className="flex items-center gap-2">
          {/* Search indicator (shows when search is active) */}
          {searchMatchingNodeIds.size > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30">
              <Icons.Search />
              <span className="text-[10px] font-bold text-yellow-700 dark:text-yellow-300">
                {searchMatchingNodeIds.size}
              </span>
            </div>
          )}

          {/* Bottleneck indicator */}
          {bottleneckCount > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30">
              <Icons.Flame />
              <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300">{bottleneckCount}</span>
            </div>
          )}

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScrollEnabled(!autoScrollEnabled)}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors',
              autoScrollEnabled
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
            )}
            title={autoScrollEnabled ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            Auto
          </button>

          {/* I/O toggle */}
          <button
            onClick={() => setShowFullIO(!showFullIO)}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors',
              showFullIO
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
            )}
          >
            I/O
          </button>

          {/* Debug toggle */}
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors',
              showDebug
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
            )}
          >
            Debug
          </button>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-3 max-h-80 overflow-y-auto">
          <div className="text-[10px] font-mono space-y-3">
            {/* RAW DATA COUNTS - Most important for debugging */}
            {flowDebug && (
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded border border-yellow-300 dark:border-yellow-700">
                <div className="font-bold text-yellow-800 dark:text-yellow-300 mb-1">RAW INPUT DATA:</div>
                <div className="flex gap-4 flex-wrap text-yellow-700 dark:text-yellow-400">
                  <span>Raw Observations: <strong>{flowDebug.rawObservationCount}</strong></span>
                  <span>After Filter: <strong>{flowDebug.filteredObservationCount}</strong></span>
                  <span>Transcript Turns: <strong>{flowDebug.transcriptTurnCount}</strong></span>
                </div>
                {flowDebug.observationNames.length > 0 && (
                  <div className="mt-1 text-[9px]">
                    <span className="font-bold">Observation Names: </span>
                    {flowDebug.observationNames.join(', ')}
                  </div>
                )}
                {flowDebug.rawObservationCount === 0 && (
                  <div className="mt-1 text-red-600 dark:text-red-400 font-bold">
                    ⚠️ NO OBSERVATIONS RECEIVED - Check backend API response
                  </div>
                )}
              </div>
            )}

            {/* Layer counts */}
            <div>
              <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">Nodes by Layer ({debugInfo.totalNodes} total):</div>
              <div className="flex gap-4 flex-wrap">
                <span className="text-blue-600 dark:text-blue-400">L4 Flowise: {debugInfo.byLayer.flowise.length}</span>
                <span className="text-amber-600 dark:text-amber-400">L3 Tools: {debugInfo.byLayer.tools.length}</span>
                <span className="text-purple-600 dark:text-purple-400">L2 Node-RED: {debugInfo.byLayer.nodeRed.length}</span>
                <span className="text-green-600 dark:text-green-400">L1 Cloud9: {debugInfo.byLayer.cloud9.length}</span>
              </div>
            </div>

            {/* Type counts */}
            <div>
              <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">Nodes by Type:</div>
              <div className="flex gap-4 flex-wrap">
                <span>user_input: {debugInfo.byType.user_input.length}</span>
                <span>assistant_response: {debugInfo.byType.assistant_response.length}</span>
                <span>llm_generation: {debugInfo.byType.llm_generation.length}</span>
                <span>tool_decision: {debugInfo.byType.tool_decision.length}</span>
                <span>api_call: {debugInfo.byType.api_call.length}</span>
                <span>error_state: {debugInfo.byType.error_state.length}</span>
              </div>
            </div>

            {/* Observation list with details */}
            <div>
              <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">Observations ({debugInfo.observationDetails.length}):</div>
              {debugInfo.observationDetails.length === 0 ? (
                <div className="text-red-600 dark:text-red-400 italic">No observation data found - only transcript messages</div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {debugInfo.observationDetails.map((obs, idx) => (
                    <div key={obs.id} className="py-1 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 w-4">{idx + 1}.</span>
                        <span className={cn(
                          'px-1 rounded text-[9px] font-bold',
                          obs.layer === 'layer4_flowise' && 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300',
                          obs.layer === 'layer3_tools' && 'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300',
                          obs.layer === 'layer2_nodered' && 'bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300',
                          obs.layer === 'layer1_cloud9' && 'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300',
                        )}>
                          {obs.layer.replace('layer', 'L').replace('_flowise', '').replace('_tools', '').replace('_nodered', '').replace('_cloud9', '')}
                        </span>
                        <span className="px-1 rounded bg-gray-200 dark:bg-gray-700 text-[9px]">{obs.type}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{obs.label}</span>
                        {obs.subtitle && obs.subtitle !== obs.label && (
                          <span className="text-gray-500 truncate max-w-[200px]">({obs.subtitle})</span>
                        )}
                        <span className="ml-auto text-gray-400">{obs.durationMs}ms</span>
                      </div>
                      {/* Show input/output structure */}
                      <div className="ml-6 mt-0.5 text-[9px] text-gray-500 dark:text-gray-400">
                        {obs.inputAction && <span className="text-amber-600 dark:text-amber-400 mr-2">action: {obs.inputAction}</span>}
                        {obs.inputTool && <span className="text-purple-600 dark:text-purple-400 mr-2">tool: {obs.inputTool}</span>}
                        {obs.inputKeys.length > 0 && (
                          <span className="text-green-600 dark:text-green-400">
                            IN[{obs.inputKeys.slice(0, 5).join(', ')}{obs.inputKeys.length > 5 ? '...' : ''}]
                          </span>
                        )}
                        {obs.outputKeys.length > 0 && (
                          <span className="text-blue-600 dark:text-blue-400 ml-2">
                            OUT[{obs.outputKeys.slice(0, 5).join(', ')}{obs.outputKeys.length > 5 ? '...' : ''}]
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content with Sidebars */}
      <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-950">
        {/* Left Sidebar - Pipeline Stats (collapsible on smaller screens) */}
        <div className="w-44 xl:w-52 2xl:w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-y-auto p-2 xl:p-3">
          <div className="space-y-4">
            {/* Layer Breakdown */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Layer Activity
              </div>
              {/* L4 Flowise - Blue */}
              <div className={cn(
                'p-2 rounded-lg border mb-1.5 border-blue-200 dark:border-blue-800',
                debugInfo.byLayer.flowise.length > 0 ? 'bg-blue-50/50 dark:bg-blue-950/30' : 'bg-gray-50 dark:bg-gray-800/30 opacity-50'
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">L4 Flowise</span>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{debugInfo.byLayer.flowise.length}</span>
                </div>
                {debugInfo.byLayer.flowise.length > 0 && (
                  <div className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDuration(debugInfo.byLayer.flowise.reduce((acc, n) => acc + n.durationMs, 0))}
                  </div>
                )}
              </div>
              {/* L3 Tools - Amber */}
              <div className={cn(
                'p-2 rounded-lg border mb-1.5 border-amber-200 dark:border-amber-800',
                debugInfo.byLayer.tools.length > 0 ? 'bg-amber-50/50 dark:bg-amber-950/30' : 'bg-gray-50 dark:bg-gray-800/30 opacity-50'
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">L3 Tools</span>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{debugInfo.byLayer.tools.length}</span>
                </div>
                {debugInfo.byLayer.tools.length > 0 && (
                  <div className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDuration(debugInfo.byLayer.tools.reduce((acc, n) => acc + n.durationMs, 0))}
                  </div>
                )}
              </div>
              {/* L2 Node-RED - Purple */}
              <div className={cn(
                'p-2 rounded-lg border mb-1.5 border-purple-200 dark:border-purple-800',
                debugInfo.byLayer.nodeRed.length > 0 ? 'bg-purple-50/50 dark:bg-purple-950/30' : 'bg-gray-50 dark:bg-gray-800/30 opacity-50'
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-purple-700 dark:text-purple-300">L2 Node-RED</span>
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">{debugInfo.byLayer.nodeRed.length}</span>
                </div>
                {debugInfo.byLayer.nodeRed.length > 0 && (
                  <div className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDuration(debugInfo.byLayer.nodeRed.reduce((acc, n) => acc + n.durationMs, 0))}
                  </div>
                )}
              </div>
              {/* L1 Cloud9 - Green */}
              <div className={cn(
                'p-2 rounded-lg border mb-1.5 border-green-200 dark:border-green-800',
                debugInfo.byLayer.cloud9.length > 0 ? 'bg-green-50/50 dark:bg-green-950/30' : 'bg-gray-50 dark:bg-gray-800/30 opacity-50'
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-green-700 dark:text-green-300">L1 Cloud9</span>
                  <span className="text-[10px] font-bold text-green-600 dark:text-green-400">{debugInfo.byLayer.cloud9.length}</span>
                </div>
                {debugInfo.byLayer.cloud9.length > 0 && (
                  <div className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDuration(debugInfo.byLayer.cloud9.reduce((acc, n) => acc + n.durationMs, 0))}
                  </div>
                )}
              </div>
            </div>

            {/* API Call Summary */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                API Calls
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-600 dark:text-gray-400">Tool calls:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{debugInfo.byType.tool_decision.length}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-600 dark:text-gray-400">HTTP requests:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{debugInfo.byType.api_call.length}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-600 dark:text-gray-400">LLM calls:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{debugInfo.byType.llm_generation.length}</span>
                </div>
              </div>
            </div>

            {/* Turn Overview */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Turns ({pipelineTurns.length})
              </div>
              <div className="space-y-1">
                {pipelineTurns.map((turn, idx) => {
                  const nodeCount = turn.layerNodes.flowise.length + turn.layerNodes.tools.length +
                    turn.layerNodes.nodeRed.length + turn.layerNodes.cloud9.length;
                  return (
                    <button
                      key={turn.id}
                      onClick={() => handleTurnClick(idx)}
                      className={cn(
                        'w-full p-1.5 rounded text-left text-[10px] transition-colors',
                        idx === activeTurnIndex
                          ? 'bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent',
                        turn.hasError && 'border-red-300 dark:border-red-700'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Turn {idx + 1}</span>
                        {turn.hasError && <span className="text-red-500 text-[9px]">ERR</span>}
                      </div>
                      <div className="text-[9px] text-gray-500 dark:text-gray-400">
                        {nodeCount} nodes • {formatDuration(turn.endMs - turn.startMs)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline View - Center (expands to fill available space) */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 xl:p-6"
        >
          {/* Data Flow Direction Indicator */}
          <div className="flex items-center justify-center gap-2 mb-4 xl:mb-6 text-gray-400 dark:text-gray-500">
            <span className="text-xs font-medium uppercase tracking-wide">Data Flow</span>
            <Icons.ArrowDown />
            <span className="text-xs opacity-60">Top to Bottom</span>
          </div>

          {/* Pipeline Turns - Responsive width: contained on small, expands on large screens */}
          <div className="space-y-4 xl:space-y-6 max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto">
            {pipelineTurns.map((turn, idx) => (
              <div key={turn.id}>
                <TurnPipeline
                  turn={turn}
                  activeNodeIds={activeNodeIds}
                  completedNodeIds={completedNodeIds}
                  onNodeClick={onNodeClick}
                  showFullIO={showFullIO}
                  searchMatchingNodeIds={searchMatchingNodeIds}
                  focusedSearchNodeId={focusedSearchNodeId}
                />

                {/* Connector between turns */}
                {idx < pipelineTurns.length - 1 && (
                  <div className="flex items-center justify-center py-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600 rounded-full" />
                      <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600 rounded-full" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* End indicator */}
          <div className="flex items-center justify-center gap-2 mt-8 text-gray-400 dark:text-gray-500">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            <span className="text-xs font-medium uppercase tracking-wide px-4">End of Call</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DataPipelineView;
