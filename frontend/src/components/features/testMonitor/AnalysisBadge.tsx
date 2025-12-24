/**
 * AnalysisBadge Component
 * Shows analysis status for a test run
 */

import React from 'react';
import { cn } from '../../../utils/cn';

interface AnalysisBadgeProps {
  fixCount: number;
  className?: string;
}

export function AnalysisBadge({ fixCount, className }: AnalysisBadgeProps) {
  if (fixCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
        fixCount > 0
          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
        className
      )}
      title={`${fixCount} fix${fixCount !== 1 ? 'es' : ''} generated`}
    >
      <span className="text-[10px]">🔧</span>
      <span>{fixCount} fix{fixCount !== 1 ? 'es' : ''}</span>
    </div>
  );
}
