/**
 * ResizableLayout Component
 * Provides resizable panel layouts with localStorage persistence
 */

import { ReactNode, useCallback, useState } from 'react';
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
  type GroupImperativeHandle as ImperativePanelGroupHandle,
  type Layout,
} from 'react-resizable-panels';

// Re-export panel components for convenience
export { Panel, PanelGroup, PanelResizeHandle };
export type { ImperativePanelGroupHandle };

/**
 * Hook to persist and restore panel layout from localStorage
 */
export function useLayoutPersistence(
  storageKey: string,
  defaultLayout?: Layout
): {
  layout: Layout | undefined;
  onLayoutChanged: (layout: Layout) => void;
} {
  const [layout, setLayout] = useState<Layout | undefined>(() => {
    if (typeof window === 'undefined') return defaultLayout;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored) as Layout;
      }
    } catch (e) {
      console.warn(`Failed to load layout from localStorage (${storageKey}):`, e);
    }
    return defaultLayout;
  });

  const onLayoutChanged = useCallback((newLayout: Layout) => {
    setLayout(newLayout);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newLayout));
    } catch (e) {
      console.warn(`Failed to save layout to localStorage (${storageKey}):`, e);
    }
  }, [storageKey]);

  return { layout, onLayoutChanged };
}

export interface ResizablePanelConfig {
  /** Unique ID for this panel (used for localStorage) */
  id: string;
  /** Content to render inside the panel */
  children: ReactNode;
  /** Default size as percentage (0-100) */
  defaultSize?: number;
  /** Minimum size as percentage (0-100) */
  minSize?: number;
  /** Maximum size as percentage (0-100) */
  maxSize?: number;
  /** Whether this panel is collapsible */
  collapsible?: boolean;
  /** Collapsed size when collapsed */
  collapsedSize?: number;
  /** Additional className for the panel */
  className?: string;
  /** Order in the panel group (for persistence) */
  order?: number;
}

export interface ResizableLayoutProps {
  /** Unique ID for this layout (used for localStorage persistence) */
  id: string;
  /** Direction of the layout */
  direction?: 'horizontal' | 'vertical';
  /** Panel configurations */
  panels: ResizablePanelConfig[];
  /** Additional className for the panel group */
  className?: string;
  /** Whether to persist layout to localStorage */
  autoSaveId?: string;
  /** Resize handle variant */
  handleVariant?: 'line' | 'dots' | 'minimal';
}

interface ResizeHandleProps {
  variant?: 'line' | 'dots' | 'minimal';
  direction: 'horizontal' | 'vertical';
}

/**
 * Custom resize handle component
 */
export function ResizeHandle({ variant = 'line', direction }: ResizeHandleProps) {
  const isHorizontal = direction === 'horizontal';

  return (
    <PanelResizeHandle
      className={`
        group relative flex items-center justify-center
        ${isHorizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}
        hover:bg-primary-500/10 active:bg-primary-500/20
        transition-colors duration-150
      `}
    >
      {/* Visual indicator */}
      <div
        className={`
          ${variant === 'minimal' ? 'opacity-0' : 'opacity-30'}
          group-hover:opacity-100 group-active:opacity-100
          transition-opacity duration-150
          ${isHorizontal ? 'h-8 w-1' : 'w-8 h-1'}
          ${variant === 'dots' ? 'rounded-full bg-gray-400 dark:bg-gray-500' : ''}
          ${variant === 'line' ? 'rounded-full bg-gray-300 dark:bg-gray-600' : ''}
          ${variant === 'minimal' ? 'rounded-full bg-gray-300 dark:bg-gray-600' : ''}
        `}
      />
      {/* Larger hit area indicator on hover */}
      <div
        className={`
          absolute opacity-0 group-hover:opacity-100
          transition-opacity duration-150
          ${isHorizontal ? 'w-0.5 h-full' : 'h-0.5 w-full'}
          bg-primary-500/50
        `}
      />
    </PanelResizeHandle>
  );
}

/**
 * ResizableLayout Component
 * Creates a resizable panel layout with optional persistence
 */
export function ResizableLayout({
  id,
  direction = 'horizontal',
  panels,
  className = '',
  autoSaveId,
  handleVariant = 'line',
}: ResizableLayoutProps) {
  const onLayout = useCallback((sizes: number[]) => {
    console.debug(`[ResizableLayout:${id}] Layout changed:`, sizes);
  }, [id]);

  return (
    <PanelGroup
      orientation={direction}
      id={id}
      onLayoutChanged={onLayout}
      className={className}
    >
      {panels.map((panel, index) => (
        <div key={panel.id} className="contents">
          <Panel
            id={panel.id}
            order={panel.order ?? index}
            defaultSize={panel.defaultSize}
            minSize={panel.minSize ?? 10}
            maxSize={panel.maxSize}
            collapsible={panel.collapsible}
            collapsedSize={panel.collapsedSize}
            className={panel.className}
          >
            {panel.children}
          </Panel>
          {/* Add resize handle between panels (not after the last one) */}
          {index < panels.length - 1 && (
            <ResizeHandle variant={handleVariant} direction={direction} />
          )}
        </div>
      ))}
    </PanelGroup>
  );
}

/**
 * Hook to create panel configurations with sensible defaults
 */
export function usePanelConfig(
  id: string,
  children: ReactNode,
  options: Partial<Omit<ResizablePanelConfig, 'id' | 'children'>> = {}
): ResizablePanelConfig {
  return {
    id,
    children,
    minSize: 10,
    ...options,
  };
}

export default ResizableLayout;
