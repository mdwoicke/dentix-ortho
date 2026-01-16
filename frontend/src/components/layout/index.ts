/**
 * Layout Components Index
 * Central export for all layout components
 */

export { Navbar } from './Navbar';
export { Sidebar } from './Sidebar';
export { MainLayout } from './MainLayout';
export { PageHeader } from './PageHeader';
export type { Breadcrumb, PageHeaderProps } from './PageHeader';

// Resizable layout components
export {
  ResizableLayout,
  ResizeHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
  usePanelConfig,
  useLayoutPersistence,
} from './ResizableLayout';
export type {
  ResizablePanelConfig,
  ResizableLayoutProps,
  ImperativePanelGroupHandle,
} from './ResizableLayout';
