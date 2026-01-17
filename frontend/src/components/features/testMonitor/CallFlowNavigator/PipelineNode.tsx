/**
 * PipelineNode Component
 * Single node in the data pipeline with expandable I/O panels
 * Includes popout modal for full node view
 */

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../utils/cn';
import type { FlowNode } from './types';
import { LAYER_CONFIG, NODE_TYPE_CONFIG } from './types';
import { formatDuration } from './flowTransformers';
import { getShortActionLabel, hasInputData, hasOutputData, getDataSize } from './pipelineTransformers';
import { CollapsiblePanel, syntaxHighlight } from './CollapsiblePanel';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
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
  Database: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
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
  CheckCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  Expand: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  ),
  Close: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface PipelineNodeProps {
  node: FlowNode;
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
  showIO?: boolean;
  compact?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getNodeIcon(node: FlowNode) {
  switch (node.type) {
    case 'user_input':
      return <Icons.User />;
    case 'assistant_response':
      return <Icons.Bot />;
    case 'llm_generation':
      return <Icons.Cpu />;
    case 'tool_decision':
      return <Icons.Tool />;
    case 'api_call':
      if (node.layer === 'layer1_cloud9') return <Icons.Database />;
      return <Icons.Server />;
    case 'error_state':
      return <Icons.XCircle />;
    default:
      return <Icons.Server />;
  }
}

function getNodeTypeLabel(node: FlowNode): string {
  switch (node.type) {
    case 'user_input':
      return 'USER';
    case 'assistant_response':
      return 'ASSISTANT';
    case 'llm_generation':
      return 'LLM';
    case 'tool_decision':
      return 'TOOL';
    case 'api_call':
      return 'API';
    case 'error_state':
      return 'ERROR';
    default:
      return 'NODE';
  }
}

// ============================================================================
// NODE POPOUT MODAL
// ============================================================================

interface NodePopoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: FlowNode;
}

function NodePopoutModal({ isOpen, onClose, node }: NodePopoutModalProps) {
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Format data
  const inputData = useMemo(() => {
    if (!node.data.input) return null;
    try {
      return JSON.stringify(node.data.input, null, 2);
    } catch {
      return String(node.data.input);
    }
  }, [node.data.input]);

  const outputData = useMemo(() => {
    if (!node.data.output) return null;
    try {
      return JSON.stringify(node.data.output, null, 2);
    } catch {
      return String(node.data.output);
    }
  }, [node.data.output]);

  const inputHighlighted = useMemo(() => inputData ? syntaxHighlight(inputData) : '', [inputData]);
  const outputHighlighted = useMemo(() => outputData ? syntaxHighlight(outputData) : '', [outputData]);

  const handleCopyInput = () => {
    if (inputData) {
      navigator.clipboard.writeText(inputData);
      setCopiedInput(true);
      setTimeout(() => setCopiedInput(false), 2000);
    }
  };

  const handleCopyOutput = () => {
    if (outputData) {
      navigator.clipboard.writeText(outputData);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  if (!isOpen) return null;

  const isError = node.status === 'error';
  const layerConfig = LAYER_CONFIG[node.layer];
  const actionLabel = node.type === 'tool_decision' ? getShortActionLabel(node) : node.label;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        'relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl border-2',
        isError
          ? 'bg-red-50 dark:bg-gray-900 border-red-400 dark:border-red-600'
          : 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600'
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-4 py-3 border-b rounded-t-xl',
          isError
            ? 'bg-red-100 dark:bg-red-950/50 border-red-200 dark:border-red-800'
            : [
                node.layer === 'layer4_flowise' && 'bg-blue-100 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800',
                node.layer === 'layer3_tools' && 'bg-amber-100 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800',
                node.layer === 'layer2_nodered' && 'bg-purple-100 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800',
                node.layer === 'layer1_cloud9' && 'bg-green-100 dark:bg-green-950/50 border-green-200 dark:border-green-800',
              ]
        )}>
          <div className="flex items-center gap-3">
            {/* Icon */}
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              isError && 'bg-red-500 text-white',
              !isError && [
                node.layer === 'layer4_flowise' && 'bg-blue-500 text-white',
                node.layer === 'layer3_tools' && 'bg-amber-500 text-white',
                node.layer === 'layer2_nodered' && 'bg-purple-500 text-white',
                node.layer === 'layer1_cloud9' && 'bg-green-500 text-white',
              ]
            )}>
              {getNodeIcon(node)}
            </div>
            {/* Type badge */}
            <span className={cn(
              'px-2 py-1 rounded text-xs font-bold uppercase',
              isError && 'bg-red-500 text-white',
              !isError && [
                node.layer === 'layer4_flowise' && 'bg-blue-500 text-white',
                node.layer === 'layer3_tools' && 'bg-amber-500 text-white',
                node.layer === 'layer2_nodered' && 'bg-purple-500 text-white',
                node.layer === 'layer1_cloud9' && 'bg-green-500 text-white',
              ]
            )}>
              {getNodeTypeLabel(node)}
            </span>
            {/* Node label */}
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {actionLabel}
            </span>
            {node.subtitle && node.subtitle !== node.label && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({node.subtitle})
              </span>
            )}
            {/* Layer label */}
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {layerConfig.label}
            </span>
            {/* Duration */}
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {formatDuration(node.durationMs)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Icons.Close />
          </button>
        </div>

        {/* Error message */}
        {isError && (node.data.errorMessage || node.data.statusMessage) && (
          <div className="px-4 py-3 bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">
              {node.data.errorMessage || node.data.statusMessage}
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            {/* Input Panel */}
            {inputData && (
              <div className="flex flex-col border rounded-lg border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-blue-100 dark:bg-blue-900/50 border-b border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-700 dark:text-blue-300 uppercase">Input</span>
                    <span className="text-xs text-blue-500 dark:text-blue-400 font-mono">
                      {getDataSize(node.data.input)}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyInput}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 hover:bg-blue-300 dark:hover:bg-blue-700/50 transition-colors"
                  >
                    {copiedInput ? <Icons.Check /> : <Icons.Copy />}
                    {copiedInput ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre
                  className="flex-1 p-4 text-sm font-mono overflow-auto bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200"
                  dangerouslySetInnerHTML={{ __html: inputHighlighted }}
                />
              </div>
            )}

            {/* Output Panel */}
            {outputData && (
              <div className="flex flex-col border rounded-lg border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-green-100 dark:bg-green-900/50 border-b border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-green-700 dark:text-green-300 uppercase">Output</span>
                    <span className="text-xs text-green-500 dark:text-green-400 font-mono">
                      {getDataSize(node.data.output)}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyOutput}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-green-200 dark:bg-green-800/50 text-green-700 dark:text-green-300 hover:bg-green-300 dark:hover:bg-green-700/50 transition-colors"
                  >
                    {copiedOutput ? <Icons.Check /> : <Icons.Copy />}
                    {copiedOutput ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre
                  className="flex-1 p-4 text-sm font-mono overflow-auto bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200"
                  dangerouslySetInnerHTML={{ __html: outputHighlighted }}
                />
              </div>
            )}

            {/* No data message */}
            {!inputData && !outputData && (
              <div className="col-span-2 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <p>No input/output data available for this node</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PipelineNode({
  node,
  isActive,
  isCompleted,
  onClick,
  showIO = true,
  compact = false,
}: PipelineNodeProps) {
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);

  const isError = node.status === 'error';
  const isBottleneck = node.status === 'bottleneck';
  const layerConfig = LAYER_CONFIG[node.layer];
  const typeConfig = NODE_TYPE_CONFIG[node.type];

  // Get action label for tool nodes - show both tool action and original name
  const actionLabel = node.type === 'tool_decision' ? getShortActionLabel(node) : node.label;

  // For API calls, show the subtitle (original observation name) as additional context
  const subtitleText = node.subtitle && node.subtitle !== node.label ? node.subtitle : null;

  // Check if node has I/O data
  const hasIO = hasInputData(node) || hasOutputData(node);

  const handlePopout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPopoutOpen(true);
  };

  return (
    <>
      <div
        data-node-id={node.id}
        className={cn(
          'relative w-full transition-all duration-300 cursor-pointer group',
          // Active state - prominent glow
          isActive && [
            'scale-[1.02] z-10',
            isError && 'ring-2 ring-offset-2 ring-red-500 dark:ring-offset-gray-900',
            !isError && 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900',
          ],
          // Pending state
          !isCompleted && !isActive && 'opacity-50',
        )}
      >
        {/* Main Card */}
        <div
          onClick={onClick}
          className={cn(
            'rounded-xl border-2 overflow-hidden transition-all duration-200',
            // Error state
            isError && [
              'border-red-400 dark:border-red-600',
              'bg-red-50 dark:bg-red-950/50',
              isActive && 'shadow-xl shadow-red-500/30',
            ],
            // Bottleneck state
            isBottleneck && !isError && [
              'border-orange-400 dark:border-orange-600',
              'bg-orange-50 dark:bg-orange-950/50',
              isActive && 'shadow-xl shadow-orange-500/30',
            ],
            // Normal state
            !isError && !isBottleneck && [
              isActive && 'shadow-xl shadow-blue-500/20',
              // Layer-specific colors
              node.layer === 'layer4_flowise' && 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50',
              node.layer === 'layer3_tools' && 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50',
              node.layer === 'layer2_nodered' && 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/50',
              node.layer === 'layer1_cloud9' && 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/50',
            ],
            // Hover
            'hover:shadow-lg',
          )}
        >
          {/* Header */}
          <div className={cn(
            'flex items-center gap-2 px-3',
            compact ? 'py-1.5' : 'py-2',
            // Header background based on state
            isError && 'bg-red-100 dark:bg-red-900/50',
            isBottleneck && !isError && 'bg-orange-100 dark:bg-orange-900/50',
            !isError && !isBottleneck && [
              node.layer === 'layer4_flowise' && 'bg-blue-100 dark:bg-blue-900/40',
              node.layer === 'layer3_tools' && 'bg-amber-100 dark:bg-amber-900/40',
              node.layer === 'layer2_nodered' && 'bg-purple-100 dark:bg-purple-900/40',
              node.layer === 'layer1_cloud9' && 'bg-green-100 dark:bg-green-900/40',
            ],
          )}>
            {/* Icon */}
            <div className={cn(
              'flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center',
              isError && 'bg-red-500 text-white',
              isBottleneck && !isError && 'bg-orange-500 text-white',
              !isError && !isBottleneck && [
                node.layer === 'layer4_flowise' && 'bg-blue-500 text-white',
                node.layer === 'layer3_tools' && 'bg-amber-500 text-white',
                node.layer === 'layer2_nodered' && 'bg-purple-500 text-white',
                node.layer === 'layer1_cloud9' && 'bg-green-500 text-white',
              ],
            )}>
              {getNodeIcon(node)}
            </div>

            {/* Type label */}
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wide',
              isError && 'text-red-700 dark:text-red-300',
              isBottleneck && !isError && 'text-orange-700 dark:text-orange-300',
              !isError && !isBottleneck && [
                node.layer === 'layer4_flowise' && 'text-blue-700 dark:text-blue-300',
                node.layer === 'layer3_tools' && 'text-amber-700 dark:text-amber-300',
                node.layer === 'layer2_nodered' && 'text-purple-700 dark:text-purple-300',
                node.layer === 'layer1_cloud9' && 'text-green-700 dark:text-green-300',
              ],
            )}>
              [{getNodeTypeLabel(node)}]
            </span>

            {/* Action label (main text) and subtitle */}
            <div className="flex-1 min-w-0">
              <span className={cn(
                'block truncate font-medium',
                compact ? 'text-xs' : 'text-sm',
                'text-gray-900 dark:text-gray-100',
              )}>
                {actionLabel}
              </span>
              {subtitleText && (
                <span className="block truncate text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {subtitleText}
                </span>
              )}
            </div>

            {/* Popout button */}
            {hasIO && (
              <button
                onClick={handlePopout}
                className={cn(
                  'flex-shrink-0 p-1 rounded transition-colors opacity-0 group-hover:opacity-100',
                  isError && 'hover:bg-red-200 dark:hover:bg-red-800/50 text-red-600 dark:text-red-400',
                  !isError && [
                    node.layer === 'layer4_flowise' && 'hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-400',
                    node.layer === 'layer3_tools' && 'hover:bg-amber-200 dark:hover:bg-amber-800/50 text-amber-600 dark:text-amber-400',
                    node.layer === 'layer2_nodered' && 'hover:bg-purple-200 dark:hover:bg-purple-800/50 text-purple-600 dark:text-purple-400',
                    node.layer === 'layer1_cloud9' && 'hover:bg-green-200 dark:hover:bg-green-800/50 text-green-600 dark:text-green-400',
                  ]
                )}
                title="Open in popout"
              >
                <Icons.Expand />
              </button>
            )}

            {/* Status indicators */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isError && (
                <span className="text-red-600 dark:text-red-400">
                  <Icons.XCircle />
                </span>
              )}
              {isBottleneck && !isError && (
                <span className="text-orange-600 dark:text-orange-400">
                  <Icons.Flame />
                </span>
              )}
              {isCompleted && !isError && (
                <span className="text-green-600 dark:text-green-400 opacity-70">
                  <Icons.CheckCircle />
                </span>
              )}
            </div>

            {/* Duration */}
            <span className={cn(
              'text-[10px] font-mono flex-shrink-0',
              isBottleneck ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-gray-400 dark:text-gray-500',
            )}>
              {formatDuration(node.durationMs)}
            </span>
          </div>

          {/* Content section (message preview for user/assistant) */}
          {!compact && node.data.content && (node.type === 'user_input' || node.type === 'assistant_response') && (
            <div className="px-3 py-2 border-t border-inherit">
              <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                {node.data.content}
              </p>
            </div>
          )}

          {/* Error message */}
          {!compact && isError && (node.data.errorMessage || node.data.statusMessage) && (
            <div className="px-3 py-2 border-t border-red-200 dark:border-red-800 bg-red-100/50 dark:bg-red-900/30">
              <p className="text-xs text-red-700 dark:text-red-300 line-clamp-2">
                {node.data.errorMessage || node.data.statusMessage}
              </p>
            </div>
          )}
        </div>

        {/* I/O Panels (shown below the card) */}
        {showIO && !compact && (hasInputData(node) || hasOutputData(node)) && (
          <div className="mt-2 space-y-1.5 pl-4">
            {hasInputData(node) && (
              <CollapsiblePanel
                label="Input"
                data={node.data.input}
                variant="input"
              />
            )}
            {hasOutputData(node) && (
              <CollapsiblePanel
                label="Output"
                data={node.data.output}
                variant="output"
              />
            )}
          </div>
        )}

        {/* Active indicator line */}
        {isActive && (
          <div className={cn(
            'absolute left-0 top-0 bottom-0 w-1 rounded-l-xl',
            isError && 'bg-red-500',
            !isError && 'bg-blue-500',
          )} />
        )}
      </div>

      {/* Popout Modal */}
      <NodePopoutModal
        isOpen={isPopoutOpen}
        onClose={() => setIsPopoutOpen(false)}
        node={node}
      />
    </>
  );
}

export default PipelineNode;
