/**
 * Copy as cURL Button Component
 * Generates and copies cURL command to clipboard
 */

import { useState } from 'react';
import { Button } from '../../ui/Button';
import { useToast } from '../../../hooks/useToast';
import { generateCurlCommand } from '../../../services/api/postmanApi';
import { cn } from '../../../utils/cn';
import { copyToClipboard } from '../../../utils/clipboard';

export interface CopyToPostmanButtonProps {
  procedure: string;
  parameters: Record<string, any>;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Code icon SVG (</> symbol)
 */
function CodeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

export function CopyToPostmanButton({
  procedure,
  parameters,
  variant = 'button',
  size = 'md',
  className,
}: CopyToPostmanButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleCopyToPostman = async () => {
    setIsLoading(true);

    try {
      // Generate cURL command from backend
      const curlCommand = await generateCurlCommand({
        procedure,
        parameters,
      });

      // Copy to clipboard (with fallback for non-secure contexts)
      await copyToClipboard(curlCommand);

      // Show success message
      toast.showSuccess('cURL command copied to clipboard!');
    } catch (error) {
      // Handle errors
      console.error('Failed to copy cURL command:', error);
      toast.showError('Failed to generate or copy cURL command');
    } finally {
      setIsLoading(false);
    }
  };

  // Icon-only variant
  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopyToPostman}
        disabled={isLoading}
        title="Copy as cURL"
        aria-label="Copy as cURL"
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-colors',
          'text-gray-600 dark:text-gray-400',
          'hover:text-blue-600 dark:hover:text-blue-400',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          size === 'sm' && 'p-1.5',
          size === 'md' && 'p-2',
          size === 'lg' && 'p-2.5',
          className
        )}
      >
        {isLoading ? (
          <svg
            className={cn(
              'animate-spin',
              size === 'sm' && 'h-4 w-4',
              size === 'md' && 'h-5 w-5',
              size === 'lg' && 'h-6 w-6'
            )}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <CodeIcon
            className={cn(
              size === 'sm' && 'h-4 w-4',
              size === 'md' && 'h-5 w-5',
              size === 'lg' && 'h-6 w-6'
            )}
          />
        )}
      </button>
    );
  }

  // Full button variant
  return (
    <Button
      onClick={handleCopyToPostman}
      variant="secondary"
      size={size}
      isLoading={isLoading}
      className={cn('gap-2', className)}
    >
      <CodeIcon className="h-4 w-4" />
      Copy as cURL
    </Button>
  );
}
