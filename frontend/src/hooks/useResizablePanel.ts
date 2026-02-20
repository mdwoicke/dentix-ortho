import { useState, useCallback, useEffect, useRef } from 'react';

interface UseResizablePanelOptions {
  /** localStorage key for persisting width */
  storageKey: string;
  /** Default width in pixels */
  defaultWidth: number;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Maximum width as fraction of viewport (0-1) */
  maxWidthVw?: number;
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth = 320,
  maxWidthVw = 0.85,
}: UseResizablePanelOptions) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = Number(saved);
        if (parsed >= minWidth) return parsed;
      }
    } catch { /* ignore */ }
    return defaultWidth;
  });

  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = startX.current - e.clientX;
      const maxWidth = window.innerWidth * maxWidthVw;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, minWidth, maxWidthVw]);

  // Persist width to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)));
    } catch { /* ignore */ }
  }, [width, storageKey]);

  // Clamp on window resize
  useEffect(() => {
    const onResize = () => {
      const maxWidth = window.innerWidth * maxWidthVw;
      setWidth((w) => Math.min(w, maxWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [maxWidthVw]);

  return { width, isDragging: dragging, onMouseDown };
}
