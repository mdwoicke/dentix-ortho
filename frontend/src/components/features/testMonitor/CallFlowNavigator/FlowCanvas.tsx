/**
 * FlowCanvas Component
 * SVG canvas for rendering the flow diagram with nodes and connections
 */

import { useRef, useState, useCallback } from 'react';
import { cn } from '../../../../utils/cn';
import type { PositionedFlowNode, ConnectionPath, CanvasDimensions } from './types';
import { FlowNode } from './FlowNode';
import { FlowConnection } from './FlowConnection';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  ZoomIn: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
    </svg>
  ),
  ZoomOut: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
    </svg>
  ),
  FitToScreen: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  ),
};

export interface FlowCanvasProps {
  nodes: PositionedFlowNode[];
  connections: ConnectionPath[];
  dimensions: CanvasDimensions;
  activeNodeIds: Set<string>;
  completedNodeIds: Set<string>;
  onNodeClick: (nodeId: string) => void;
  currentTimeMs: number;
}

/**
 * FlowCanvas Component
 */
export function FlowCanvas({
  nodes,
  connections,
  dimensions,
  activeNodeIds,
  completedNodeIds,
  onNodeClick,
  currentTimeMs,
}: FlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(2, prev + 0.25));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(0.25, prev - 0.25));
  }, []);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const fitZoom = Math.min(
      containerWidth / dimensions.width,
      containerHeight / dimensions.height,
      1
    );
    setZoom(fitZoom * 0.9); // 90% to add some padding
    setPan({ x: 0, y: 0 });
  }, [dimensions]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.25, Math.min(2, prev + delta)));
    }
  }, []);

  // Check which connections are active
  const isConnectionActive = (connPath: ConnectionPath): boolean => {
    return activeNodeIds.has(connPath.connection.sourceId) ||
           activeNodeIds.has(connPath.connection.targetId);
  };

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No flow data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Zoom Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1 shadow-lg">
        <button
          onClick={zoomIn}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400"
          title="Zoom In (Ctrl + Scroll)"
        >
          <Icons.ZoomIn />
        </button>
        <div className="text-[10px] text-center text-gray-500 dark:text-gray-400 py-0.5">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={zoomOut}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400"
          title="Zoom Out (Ctrl + Scroll)"
        >
          <Icons.ZoomOut />
        </button>
        <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
        <button
          onClick={fitToScreen}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400"
          title="Fit to Screen"
        >
          <Icons.FitToScreen />
        </button>
      </div>

      {/* Pan hint */}
      <div className="absolute bottom-3 left-3 z-10 text-xs text-gray-400 dark:text-gray-500">
        Alt + Drag or Middle-click to pan
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className={cn(
          'w-full h-[480px] overflow-hidden',
          isPanning && 'cursor-grabbing'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={dimensions.viewBox}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'top left',
          }}
        >
          {/* Grid pattern for background */}
          <defs>
            <pattern
              id="flow-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1.2" className="fill-gray-300 dark:fill-gray-600" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#flow-grid)" opacity="0.5" />

          {/* Connections layer */}
          <g className="connections-layer">
            {connections.map(connPath => (
              <FlowConnection
                key={connPath.connection.id}
                connection={connPath}
                isActive={isConnectionActive(connPath)}
                type={connPath.connection.type}
              />
            ))}
          </g>

          {/* Nodes layer */}
          <g className="nodes-layer">
            {nodes.map(node => (
              <FlowNode
                key={node.id}
                node={node}
                isActive={activeNodeIds.has(node.id)}
                isCompleted={completedNodeIds.has(node.id) || node.startMs + node.durationMs <= currentTimeMs}
                onClick={onNodeClick}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-wrap gap-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-blue-500 to-blue-600" />
          <span className="text-gray-600 dark:text-gray-400">Caller</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-teal-500 to-teal-600" />
          <span className="text-gray-600 dark:text-gray-400">Agent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-purple-500 to-purple-600" />
          <span className="text-gray-600 dark:text-gray-400">AI</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-amber-500 to-amber-600" />
          <span className="text-gray-600 dark:text-gray-400">Tool</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-green-500 to-green-600" />
          <span className="text-gray-600 dark:text-gray-400">API</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded ring-2 ring-orange-500 bg-orange-100 dark:bg-orange-900/30" />
          <span className="text-gray-600 dark:text-gray-400">Slow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded ring-2 ring-red-500 bg-red-100 dark:bg-red-900/30" />
          <span className="text-gray-600 dark:text-gray-400">Error</span>
        </div>
      </div>
    </div>
  );
}

export default FlowCanvas;
