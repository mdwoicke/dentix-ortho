/**
 * ExpandablePanel Component
 * Wrapper that adds expand/collapse functionality to panels
 */

import { useState, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '../../ui';
import { cn } from '../../../utils/cn';

// Context to share expanded state with child components
export const ExpandablePanelContext = createContext<{ isExpanded: boolean }>({ isExpanded: false });
export const useExpandablePanel = () => useContext(ExpandablePanelContext);

interface ExpandablePanelProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** If true, panel will grow to fill available space. If false, sizes to content with max-height. */
  grow?: boolean;
  /** Maximum height for content area when not growing (default: 300px) */
  maxContentHeight?: string;
  /** Optional actions to render in the header (buttons, etc.) */
  headerActions?: React.ReactNode;
  /** Whether the panel should be expanded by default (default: true) */
  defaultExpanded?: boolean;
}

export function ExpandablePanel({
  title,
  subtitle,
  children,
  className,
  contentClassName,
  grow = false,
  maxContentHeight = '300px',
  headerActions,
  defaultExpanded = true,
}: ExpandablePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const ExpandIcon = () => (
    <button
      onClick={toggleExpand}
      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      title={isExpanded ? 'Collapse' : 'Expand'}
    >
      {isExpanded ? (
        // Collapse icon (arrows pointing inward)
        <svg
          className="w-4 h-4 text-gray-500 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 9L4 4m0 0v5m0-5h5M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0v-5m0 5h5M15 15l5 5m0 0v-5m0 5h-5"
          />
        </svg>
      ) : (
        // Expand icon (arrows pointing outward)
        <svg
          className="w-4 h-4 text-gray-500 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
          />
        </svg>
      )}
    </button>
  );

  // Header content (shared between normal and expanded views)
  const headerContent = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {subtitle && (
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {headerActions}
        <ExpandIcon />
      </div>
    </div>
  );

  // Normal (collapsed) view
  const normalView = (
    <Card className={cn(grow ? 'flex-1 flex flex-col min-h-0' : 'flex flex-col', className)}>
      <div className="p-3 border-b dark:border-gray-700 flex-shrink-0">
        {headerContent}
      </div>
      <div
        className={cn('overflow-y-auto', grow && 'flex-1', contentClassName)}
        style={!grow ? { maxHeight: maxContentHeight } : undefined}
      >
        <ExpandablePanelContext.Provider value={{ isExpanded: false }}>
          {children}
        </ExpandablePanelContext.Provider>
      </div>
    </Card>
  );

  // Expanded modal view
  const expandedView = isExpanded
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            // Close when clicking overlay background
            if (e.target === e.currentTarget) {
              setIsExpanded(false);
            }
          }}
        >
          <div
            className="w-[90vw] h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                {subtitle && (
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    {subtitle}
                  </span>
                )}
              </div>
              <ExpandIcon />
            </div>
            <div className={cn('flex-1 overflow-auto p-4', contentClassName)}>
              <ExpandablePanelContext.Provider value={{ isExpanded: true }}>
                {children}
              </ExpandablePanelContext.Provider>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {normalView}
      {expandedView}
    </>
  );
}
