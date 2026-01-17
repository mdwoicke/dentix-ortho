/**
 * FlowViewPopout Component
 * Full-screen popout modal for the Call Flow Navigator
 * Provides a spacious, professional view of the call trace
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '../../../../utils/cn';
import type { FlowNode, FlowData } from './types';
import { LAYER_CONFIG } from './types';
import { formatDuration } from './flowTransformers';
import { DataPipelineView } from './DataPipelineView';
import { usePlaybackAnimation } from './usePlaybackAnimation';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  X: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Phone: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Dollar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Server: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  Chip: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  Play: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
    </svg>
  ),
  Pause: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  SkipBack: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
    </svg>
  ),
  SkipForward: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface FlowViewPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  flowData: FlowData;
  totalDurationMs: number;
  langfuseHost?: string;
  traceId?: string;
  sessionId?: string;
}

// ============================================================================
// METRIC PILL COMPONENT
// ============================================================================

interface MetricPillProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'default' | 'success' | 'warning' | 'error';
  onClick?: () => void;
}

function MetricPill({ icon, label, value, subValue, color = 'default', onClick }: MetricPillProps) {
  const colorStyles = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    warning: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg',
        colorStyles[color],
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity'
      )}
    >
      <span className="opacity-70">{icon}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold">{value}</span>
        <span className="text-xs opacity-70">{label}</span>
        {subValue && <span className="text-xs opacity-50">({subValue})</span>}
      </div>
    </div>
  );
}

// ============================================================================
// NODE DETAIL SIDEBAR
// ============================================================================

interface NodeDetailSidebarProps {
  node: FlowNode | null;
  onClose: () => void;
  langfuseHost?: string;
  traceId?: string;
}

function NodeDetailSidebar({ node, onClose, langfuseHost, traceId }: NodeDetailSidebarProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!node) return null;

  const layerConfig = LAYER_CONFIG[node.layer];

  return (
    <div className="w-[450px] h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Node Details
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {node.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Icons.X />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Layer & Status */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium',
              node.layer === 'layer4_flowise' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
              node.layer === 'layer3_tools' && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
              node.layer === 'layer2_nodered' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
              node.layer === 'layer1_cloud9' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
            )}>
              {layerConfig.label}
            </span>
            <span className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium capitalize',
              node.status === 'success' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
              node.status === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
              node.status === 'bottleneck' && 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
              node.status === 'pending' && 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
            )}>
              {node.status}
            </span>
          </div>
        </div>

        {/* Timing */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Timing</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Started</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">+{formatDuration(node.startMs)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
              <div className={cn(
                'text-sm font-medium',
                node.status === 'bottleneck' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'
              )}>
                {formatDuration(node.durationMs)}
              </div>
            </div>
          </div>
        </div>

        {/* Cost & Tokens */}
        {(node.data.cost != null || node.data.tokens) && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Usage</h4>
            <div className="grid grid-cols-2 gap-4">
              {node.data.cost != null && node.data.cost > 0 && (
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Cost</div>
                  <div className="text-sm font-medium text-green-600 dark:text-green-400">${node.data.cost.toFixed(4)}</div>
                </div>
              )}
              {node.data.tokens && (
                <>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Input Tokens</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{node.data.tokens.input?.toLocaleString() || '0'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Output Tokens</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{node.data.tokens.output?.toLocaleString() || '0'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {node.data.content && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Content</h4>
              <button
                onClick={() => copyToClipboard(node.data.content || '', 'content')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {copiedField === 'content' ? <Icons.CheckCircle /> : <Icons.Copy />}
                {copiedField === 'content' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-300 max-h-40 overflow-y-auto">
              {node.data.content}
            </div>
          </div>
        )}

        {/* Input/Output */}
        {node.data.input && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Input</h4>
              <button
                onClick={() => copyToClipboard(JSON.stringify(node.data.input, null, 2), 'input')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {copiedField === 'input' ? <Icons.CheckCircle /> : <Icons.Copy />}
                {copiedField === 'input' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 max-h-40 overflow-auto font-mono">
              {JSON.stringify(node.data.input, null, 2)}
            </pre>
          </div>
        )}

        {node.data.output && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Output</h4>
              <button
                onClick={() => copyToClipboard(JSON.stringify(node.data.output, null, 2), 'output')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {copiedField === 'output' ? <Icons.CheckCircle /> : <Icons.Copy />}
                {copiedField === 'output' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 max-h-40 overflow-auto font-mono">
              {JSON.stringify(node.data.output, null, 2)}
            </pre>
          </div>
        )}

        {/* Error Message */}
        {(node.data.errorMessage || node.data.statusMessage) && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Error Details</h4>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {node.data.errorMessage || node.data.statusMessage}
            </div>
          </div>
        )}

        {/* External Links */}
        {(langfuseHost && node.data.observationId) && (
          <div className="px-6 py-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Links</h4>
            <a
              href={`${langfuseHost}/project/*/traces/${traceId}?observation=${node.data.observationId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Icons.ExternalLink />
              View in Langfuse
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FlowViewPopout({
  isOpen,
  onClose,
  flowData,
  totalDurationMs,
  langfuseHost,
  traceId,
  sessionId,
}: FlowViewPopoutProps) {
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

  // Playback animation - uses fixed visualization duration for smooth viewing
  const {
    isPlaying,
    currentTimeMs,
    speed,
    activeNodeIds,
    completedNodeIds,
    play,
    pause,
    stepForward,
    stepBackward,
    jumpToStart,
    jumpToEnd,
    setSpeed,
    canStepForward,
    canStepBackward,
    visualizationDurationMs,
    currentStepIndex,
    totalSteps,
    jumpToStep,
    events,
  } = usePlaybackAnimation({
    nodes: flowData.nodes,
    totalDurationMs,
  });

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNode) {
          setSelectedNode(null);
        } else {
          onClose();
        }
      }
      if (e.key === ' ' && !e.target?.toString().includes('input')) {
        e.preventDefault();
        isPlaying ? pause() : play();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, play, pause, onClose, selectedNode]);

  const handleNodeClick = useCallback((node: FlowNode) => {
    setSelectedNode(node);
  }, []);

  // Find first error/bottleneck for quick navigation
  const jumpToError = useCallback(() => {
    const errorNode = flowData.nodes.find(n => n.status === 'error');
    if (errorNode) setSelectedNode(errorNode);
  }, [flowData.nodes]);

  const jumpToBottleneck = useCallback(() => {
    const bottleneckNode = flowData.nodes.find(n => n.status === 'bottleneck');
    if (bottleneckNode) setSelectedNode(bottleneckNode);
  }, [flowData.nodes]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[95vw] h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white">
                <Icons.Phone />
                <span className="font-bold text-sm uppercase tracking-wide">Call Flow Navigator</span>
              </div>
              {sessionId && (
                <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {sessionId}
                </span>
              )}
            </div>

            {/* Metrics - only show those with data */}
            <div className="flex items-center gap-2">
              <MetricPill icon={<Icons.Clock />} label="Duration" value={formatDuration(totalDurationMs)} />
              {flowData.totalCost > 0 && (
                <MetricPill
                  icon={<Icons.Dollar />}
                  label="Cost"
                  value={`$${flowData.totalCost.toFixed(4)}`}
                  color="success"
                />
              )}
              {flowData.apiCallCount > 0 && (
                <MetricPill icon={<Icons.Server />} label="API Calls" value={flowData.apiCallCount} />
              )}
              {flowData.tokenUsage.total > 0 && (
                <MetricPill
                  icon={<Icons.Chip />}
                  label="Tokens"
                  value={flowData.tokenUsage.total.toLocaleString()}
                  subValue={`${flowData.tokenUsage.input.toLocaleString()} / ${flowData.tokenUsage.output.toLocaleString()}`}
                />
              )}
              {flowData.errorCount > 0 && (
                <MetricPill
                  icon={<Icons.XCircle />}
                  label="Errors"
                  value={flowData.errorCount}
                  color="error"
                  onClick={jumpToError}
                />
              )}
              {flowData.bottleneckCount > 0 && (
                <MetricPill
                  icon={<Icons.Flame />}
                  label="Bottlenecks"
                  value={flowData.bottleneckCount}
                  color="warning"
                  onClick={jumpToBottleneck}
                />
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Icons.X />
            </button>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={jumpToStart}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Jump to start (Home)"
              >
                <Icons.SkipBack />
              </button>
              <button
                onClick={stepBackward}
                disabled={!canStepBackward}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  canStepBackward
                    ? "text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700"
                    : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                )}
                title="Previous step (←)"
              >
                <Icons.ChevronLeft />
              </button>
              <button
                onClick={isPlaying ? pause : play}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Icons.Pause /> : <Icons.Play />}
              </button>
              <button
                onClick={stepForward}
                disabled={!canStepForward}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  canStepForward
                    ? "text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700"
                    : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                )}
                title="Next step (→)"
              >
                <Icons.ChevronRight />
              </button>
              <button
                onClick={jumpToEnd}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Jump to end (End)"
              >
                <Icons.SkipForward />
              </button>
            </div>

            <div className="flex items-center gap-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Speed:</span>
              {([0.5, 1, 2, 4] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    'px-2 py-1 rounded text-sm font-medium transition-colors',
                    speed === s
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Step counter */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                Step {currentStepIndex + 1}
              </span>
              <span className="text-xs text-indigo-500 dark:text-indigo-400">
                of {totalSteps}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-3">
              {/* Animated progress bar */}
              <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
                <div
                  className={cn(
                    "h-full transition-all duration-100 relative",
                    "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
                  )}
                  style={{ width: `${visualizationDurationMs > 0 ? (currentTimeMs / visualizationDurationMs) * 100 : 0}%` }}
                >
                  {/* Animated pulse at the leading edge */}
                  <div className={cn(
                    "absolute right-0 top-0 bottom-0 w-4 bg-white/30",
                    isPlaying && "animate-pulse"
                  )} />
                </div>
                {/* Step markers */}
                {totalSteps > 1 && totalSteps <= 30 && (
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: totalSteps - 1 }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 border-r border-gray-300 dark:border-gray-600"
                      />
                    ))}
                  </div>
                )}
              </div>
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400 min-w-[140px] text-right">
                {formatDuration(currentTimeMs)} / {formatDuration(visualizationDurationMs)}
              </span>
            </div>

            <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">Space</kbd> Play/Pause
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">←→</kbd> Step
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Data Pipeline View */}
          <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
            <DataPipelineView
              nodes={flowData.nodes}
              onNodeClick={handleNodeClick}
              currentTimeMs={currentTimeMs}
              activeNodeIds={activeNodeIds}
              completedNodeIds={completedNodeIds}
              totalDurationMs={totalDurationMs}
              events={events}
              onJumpToStep={jumpToStep}
              flowDebug={flowData._debug}
            />
          </div>

          {/* Detail Sidebar */}
          {selectedNode && (
            <NodeDetailSidebar
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              langfuseHost={langfuseHost}
              traceId={traceId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowViewPopout;
