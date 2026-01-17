/**
 * ErrorInline Component
 * Red error banner displayed inline at the failure point in the pipeline
 */

import { cn } from '../../../../utils/cn';
import type { FlowNode } from './types';
import { formatDuration } from './flowTransformers';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  XCircle: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface ErrorInlineProps {
  errorNode: FlowNode;
  onClick?: () => void;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ErrorInline({ errorNode, onClick, className }: ErrorInlineProps) {
  const errorMessage = errorNode.data.errorMessage ||
    errorNode.data.statusMessage ||
    'An error occurred during processing';

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl',
        'bg-red-100 dark:bg-red-900/40',
        'border-2 border-red-400 dark:border-red-600',
        'shadow-lg shadow-red-500/20',
        'animate-in slide-in-from-top duration-300',
        className
      )}
    >
      {/* Error icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white">
        <Icons.XCircle />
      </div>

      {/* Error content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-red-700 dark:text-red-300">
            ERROR
          </span>
          <span className="text-xs text-red-600 dark:text-red-400 font-mono">
            at {errorNode.label}
          </span>
          <span className="text-xs text-red-500 dark:text-red-500 font-mono">
            +{formatDuration(errorNode.startMs)}
          </span>
        </div>
        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 line-clamp-2">
          {errorMessage}
        </p>
      </div>

      {/* View details button */}
      {onClick && (
        <button
          onClick={onClick}
          className={cn(
            'flex-shrink-0 flex items-center gap-1.5',
            'px-3 py-1.5 rounded-lg',
            'bg-red-500 hover:bg-red-600',
            'text-white text-xs font-semibold',
            'transition-colors duration-200'
          )}
        >
          <span>Details</span>
          <Icons.ExternalLink />
        </button>
      )}
    </div>
  );
}

export default ErrorInline;
