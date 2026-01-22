/**
 * CollapsiblePanel Component
 * Expandable panel for showing JSON input/output data with syntax highlighting
 */

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../utils/cn';
import { getDataSize } from './pipelineTransformers';
import { copyToClipboard } from '../../../../utils/clipboard';

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
  Expand: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  ),
  Close: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
// POPOUT MODAL
// ============================================================================

interface JSONPopoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: string;
  highlightedData: string;
  dataSize: string;
  variant: 'input' | 'output';
}

function JSONPopoutModal({ isOpen, onClose, title, data, highlightedData, dataSize, variant }: JSONPopoutModalProps) {
  const [copied, setCopied] = useState(false);

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

  const handleCopy = async () => {
    try {
      await copyToClipboard(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  const isInput = variant === 'input';
  const colorClasses = isInput
    ? {
        border: 'border-blue-400 dark:border-blue-600',
        headerBg: 'bg-blue-100 dark:bg-blue-900/50',
        headerBorder: 'border-blue-200 dark:border-blue-800',
        text: 'text-blue-700 dark:text-blue-300',
        textLight: 'text-blue-500 dark:text-blue-400',
        buttonBg: 'bg-blue-200 dark:bg-blue-800/50 hover:bg-blue-300 dark:hover:bg-blue-700/50',
      }
    : {
        border: 'border-green-400 dark:border-green-600',
        headerBg: 'bg-green-100 dark:bg-green-900/50',
        headerBorder: 'border-green-200 dark:border-green-800',
        text: 'text-green-700 dark:text-green-300',
        textLight: 'text-green-500 dark:text-green-400',
        buttonBg: 'bg-green-200 dark:bg-green-800/50 hover:bg-green-300 dark:hover:bg-green-700/50',
      };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Full width for better JSON viewing */}
      <div className={cn(
        'relative w-full max-w-6xl h-[85vh] flex flex-col rounded-xl shadow-2xl border-2',
        'bg-gray-50 dark:bg-gray-900',
        colorClasses.border
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-5 py-3 border-b rounded-t-xl',
          colorClasses.headerBg,
          colorClasses.headerBorder
        )}>
          <div className="flex items-center gap-3">
            <span className={cn('text-lg font-bold uppercase', colorClasses.text)}>
              {title}
            </span>
            <span className={cn('text-sm font-mono', colorClasses.textLight)}>
              {dataSize}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                colorClasses.buttonBg,
                colorClasses.text
              )}
            >
              {copied ? <Icons.Check /> : <Icons.Copy />}
              {copied ? 'Copied!' : 'Copy All'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Icons.Close />
            </button>
          </div>
        </div>

        {/* Content */}
        <pre
          className="flex-1 p-6 text-sm font-mono overflow-auto bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlightedData }}
        />
      </div>
    </div>,
    document.body
  );
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
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);

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
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (formattedData) {
      try {
        await copyToClipboard(formattedData);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  // Handle popout
  const handlePopout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPopoutOpen(true);
  };

  if (!data) return null;

  const dataSize = getDataSize(data);
  const isInput = variant === 'input';

  return (
    <>
      <div className={cn(
        'rounded-lg border overflow-hidden transition-all duration-200',
        isInput
          ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30'
          : 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30'
      )}>
        {/* Header */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center justify-between px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
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
          <div className="flex items-center gap-1">
            {/* Popout button */}
            <button
              onClick={handlePopout}
              className={cn(
                'p-1 rounded-md transition-colors',
                isInput
                  ? 'hover:bg-blue-200 dark:hover:bg-blue-700/50 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-green-200 dark:hover:bg-green-700/50 text-green-600 dark:text-green-400'
              )}
              title="Open in full view"
            >
              <Icons.Expand />
            </button>
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className={cn(
                'p-1 rounded-md transition-colors',
                isInput
                  ? 'hover:bg-blue-200 dark:hover:bg-blue-700/50 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-green-200 dark:hover:bg-green-700/50 text-green-600 dark:text-green-400'
              )}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              {copied ? <Icons.Check /> : <Icons.Copy />}
            </button>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="relative border-t border-inherit">
            {/* JSON content - high contrast background */}
            <pre
              className="p-3 text-xs font-mono overflow-auto bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200"
              style={{ maxHeight }}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </div>
        )}
      </div>

      {/* Popout Modal */}
      {formattedData && (
        <JSONPopoutModal
          isOpen={isPopoutOpen}
          onClose={() => setIsPopoutOpen(false)}
          title={label}
          data={formattedData}
          highlightedData={highlightedHtml}
          dataSize={dataSize}
          variant={variant}
        />
      )}
    </>
  );
}

export default CollapsiblePanel;
