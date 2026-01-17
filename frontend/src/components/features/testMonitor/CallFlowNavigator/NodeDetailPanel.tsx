/**
 * NodeDetailPanel Component
 * Slide-out panel showing detailed information for a selected node
 */

import { useState } from 'react';
import { cn } from '../../../../utils/cn';
import type { NodeDetailPanelProps, FlowNodeType } from './types';
import { formatDuration, formatCost } from './flowTransformers';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  X: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
};

/**
 * Get type label for display
 */
function getTypeLabel(type: FlowNodeType): string {
  switch (type) {
    case 'user_input': return 'Caller Message';
    case 'llm_generation': return 'AI Generation';
    case 'tool_decision': return 'Tool Call';
    case 'api_call': return 'API Request';
    case 'assistant_response': return 'Agent Response';
    case 'error_state': return 'Error';
  }
}

/**
 * Get status styling
 */
function getStatusStyle(status: string): string {
  switch (status) {
    case 'success': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'error': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'bottleneck': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }
}

/**
 * Collapsible Section Component
 */
interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  onCopy?: () => void;
}

function CollapsibleSection({ title, icon, defaultOpen = true, children, onCopy }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCopy) {
      onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        {icon}
        <span className="flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </span>
        {onCopy && (
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            title="Copy to clipboard"
          >
            {copied ? <Icons.Check /> : <Icons.Copy />}
          </button>
        )}
        <div className={cn('transition-transform', isOpen && 'rotate-180')}>
          <Icons.ChevronDown />
        </div>
      </button>
      {isOpen && (
        <div className="p-3 bg-white dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * NodeDetailPanel Component
 */
export function NodeDetailPanel({ node, onClose, langfuseHost, traceId }: NodeDetailPanelProps) {
  if (!node) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const langfuseUrl = langfuseHost && traceId && node.data.observationId
    ? `${langfuseHost}/trace/${traceId}?observation=${node.data.observationId}`
    : null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-blue-600">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {getTypeLabel(node.type)}
          </h3>
          <p className="text-sm text-blue-100 opacity-90">
            {node.label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <Icons.X />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Timing Section */}
        <CollapsibleSection
          title="Timing"
          icon={<Icons.Clock />}
          defaultOpen={true}
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Started</span>
              <span className="font-mono text-gray-900 dark:text-gray-100">
                +{formatDuration(node.startMs)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Duration</span>
              <span className={cn(
                'font-mono font-medium',
                node.status === 'bottleneck' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'
              )}>
                {formatDuration(node.durationMs)}
                {node.status === 'bottleneck' && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 rounded">
                    BOTTLENECK
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Status</span>
              <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getStatusStyle(node.status))}>
                {node.status.toUpperCase()}
              </span>
            </div>
            {node.data.cost !== undefined && node.data.cost !== null && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Cost</span>
                <span className="font-mono text-green-600 dark:text-green-400">
                  {formatCost(node.data.cost)}
                </span>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Token Usage (for LLM nodes) */}
        {node.data.tokens && (
          <CollapsibleSection
            title="Token Usage"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            }
            defaultOpen={true}
          >
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Input</div>
                <div className="font-semibold text-blue-600 dark:text-blue-400">
                  {node.data.tokens.input?.toLocaleString() || 0}
                </div>
              </div>
              <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Output</div>
                <div className="font-semibold text-green-600 dark:text-green-400">
                  {node.data.tokens.output?.toLocaleString() || 0}
                </div>
              </div>
              <div className="text-center p-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
                <div className="font-semibold text-purple-600 dark:text-purple-400">
                  {node.data.tokens.total?.toLocaleString() || 0}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Model (for LLM nodes) */}
        {node.data.model && (
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
            <span className="text-gray-500 dark:text-gray-400">Model</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">
              {node.data.model}
            </span>
          </div>
        )}

        {/* Content (for transcript nodes) */}
        {node.data.content && (
          <CollapsibleSection
            title="Message Content"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            defaultOpen={true}
            onCopy={() => copyToClipboard(node.data.content || '')}
          >
            <div className="max-h-48 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {node.data.content}
            </div>
          </CollapsibleSection>
        )}

        {/* Input Payload */}
        {node.data.input && (
          <CollapsibleSection
            title="Request Payload"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
            }
            defaultOpen={false}
            onCopy={() => copyToClipboard(JSON.stringify(node.data.input, null, 2))}
          >
            <pre className="max-h-48 overflow-auto p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {JSON.stringify(node.data.input, null, 2)}
            </pre>
          </CollapsibleSection>
        )}

        {/* Output Payload */}
        {node.data.output && (
          <CollapsibleSection
            title="Response Payload"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            }
            defaultOpen={false}
            onCopy={() => copyToClipboard(JSON.stringify(node.data.output, null, 2))}
          >
            <pre className="max-h-48 overflow-auto p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {JSON.stringify(node.data.output, null, 2)}
            </pre>
          </CollapsibleSection>
        )}

        {/* Error/Status Message */}
        {node.data.statusMessage && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="text-xs font-medium text-red-700 dark:text-red-300 uppercase mb-1">
              Status Message
            </div>
            <div className="text-sm text-red-600 dark:text-red-400">
              {node.data.statusMessage}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
        {langfuseUrl ? (
          <a
            href={langfuseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
          >
            <Icons.ExternalLink />
            View in Langfuse
          </a>
        ) : (
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
          >
            Close Panel
          </button>
        )}
      </div>
    </div>
  );
}

export default NodeDetailPanel;
