/**
 * GuidCopyButton Component
 * Info icon button that shows a popover with GUID and copy functionality
 */

import { useState, useRef, useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import { cn } from '../../utils/cn';
import { copyToClipboard } from '../../utils/clipboard';

export interface GuidCopyButtonProps {
  label: string;
  guid: string;
  disabled?: boolean;
  className?: string;
}

export function GuidCopyButton({ label, guid, disabled, className }: GuidCopyButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setCopied(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(guid);
      setCopied(true);
      toast.showSuccess(`${label} copied to clipboard`);
      setTimeout(() => {
        setIsOpen(false);
        setCopied(false);
      }, 1000);
    } catch {
      toast.showError('Failed to copy to clipboard');
    }
  };

  if (disabled || !guid) {
    return null;
  }

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        title={`View ${label}`}
        aria-label={`View ${label}`}
        className={cn(
          'p-2 rounded-md transition-colors',
          'text-gray-500 dark:text-gray-400',
          'hover:text-blue-600 dark:hover:text-blue-400',
          'hover:bg-gray-100 dark:hover:bg-gray-700',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800'
        )}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className={cn(
            'absolute z-50 mt-1 top-full right-0',
            'bg-white dark:bg-gray-800',
            'border border-gray-200 dark:border-gray-600',
            'rounded-lg shadow-lg',
            'p-3 min-w-[300px]'
          )}
        >
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            {label}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1.5 rounded break-all">
              {guid}
            </code>
            <button
              onClick={handleCopy}
              type="button"
              className={cn(
                'flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                copied
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
              )}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
