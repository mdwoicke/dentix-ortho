/**
 * CollapsiblePanel Component
 * Expandable panel for showing JSON input/output data with syntax highlighting
 */

import { useState, useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import { getDataSize } from './pipelineTransformers';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface CollapsiblePanelProps {
  label: 'Input' | 'Output';
  data: unknown;
  variant?: 'input' | 'output';
  defaultExpanded?: boolean;
  maxHeight?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Syntax highlight JSON with colors - high contrast for dark mode
 */
export function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        // High contrast colors for better readability
        let cls = 'text-orange-600 dark:text-orange-300'; // number - bright orange
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-cyan-700 dark:text-cyan-300 font-semibold'; // key - bright cyan, bold
          } else {
            cls = 'text-emerald-600 dark:text-emerald-300'; // string - bright green
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-violet-600 dark:text-violet-300'; // boolean - bright purple
        } else if (/null/.test(match)) {
          cls = 'text-rose-500 dark:text-rose-400'; // null - pink/red
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CollapsiblePanel({
  label,
  data,
  variant = 'input',
  defaultExpanded = false,
  maxHeight = 200,
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Format the data as JSON
  const formattedData = useMemo(() => {
    if (!data) return null;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  // Get syntax highlighted HTML
  const highlightedHtml = useMemo(() => {
    if (!formattedData) return '';
    return syntaxHighlight(formattedData);
  }, [formattedData]);

  // Handle copy
  const handleCopy = () => {
    if (formattedData) {
      navigator.clipboard.writeText(formattedData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!data) return null;

  const dataSize = getDataSize(data);
  const isInput = variant === 'input';

  return (
    <div className={cn(
      'rounded-lg border overflow-hidden transition-all duration-200',
      isInput
        ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30'
        : 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30'
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium transition-colors',
          isInput
            ? 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
            : 'text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30'
        )}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
          <span>{label}</span>
          <span className="text-[10px] opacity-60 font-mono">{dataSize}</span>
        </div>
        <span className="text-[10px] opacity-50">
          {isExpanded ? 'Click to collapse' : 'Click to expand'}
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="relative border-t border-inherit">
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={cn(
              'absolute top-2 right-2 p-1.5 rounded-md transition-colors z-10',
              isInput
                ? 'bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-700/50'
                : 'bg-green-100 dark:bg-green-800/50 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-700/50'
            )}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            {copied ? <Icons.Check /> : <Icons.Copy />}
          </button>

          {/* JSON content - high contrast background */}
          <pre
            className="p-3 pr-12 text-xs font-mono overflow-auto bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200"
            style={{ maxHeight }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </div>
      )}
    </div>
  );
}

export default CollapsiblePanel;
