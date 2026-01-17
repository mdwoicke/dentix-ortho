/**
 * useFlowLayout Hook
 * Calculates positions for flow nodes using a horizontal timeline layout
 */

import { useMemo } from 'react';
import type {
  FlowNode,
  FlowConnection,
  PositionedFlowNode,
  ConnectionPath,
  FlowLayoutConfig,
  CanvasDimensions,
} from './types';
import { DEFAULT_LAYOUT_CONFIG } from './types';

export interface FlowLayoutResult {
  positionedNodes: PositionedFlowNode[];
  connectionPaths: ConnectionPath[];
  dimensions: CanvasDimensions;
}

/**
 * Calculate positions for all nodes and connection paths
 */
export function useFlowLayout(
  nodes: FlowNode[],
  connections: FlowConnection[],
  config: FlowLayoutConfig = DEFAULT_LAYOUT_CONFIG
): FlowLayoutResult {
  return useMemo(() => {
    if (nodes.length === 0) {
      return {
        positionedNodes: [],
        connectionPaths: [],
        dimensions: {
          width: config.padding * 2,
          height: config.padding * 2,
          viewBox: `0 0 ${config.padding * 2} ${config.padding * 2}`,
        },
      };
    }

    // Sort nodes by startMs to create horizontal timeline
    const sortedNodes = [...nodes].sort((a, b) => a.startMs - b.startMs);

    // Group nodes into rows based on type or timing
    // Transcript nodes go in the middle, observation nodes fan out
    const transcriptNodes = sortedNodes.filter(n =>
      n.type === 'user_input' || n.type === 'assistant_response'
    );
    const observationNodes = sortedNodes.filter(n =>
      n.type !== 'user_input' && n.type !== 'assistant_response'
    );

    // Position map
    const positions = new Map<string, { x: number; y: number }>();

    // Layout transcript nodes in the center row
    const centerY = config.padding + config.nodeHeight + config.verticalGap;
    let xPos = config.padding;

    transcriptNodes.forEach(node => {
      positions.set(node.id, { x: xPos, y: centerY });
      xPos += config.nodeWidth + config.horizontalGap;
    });

    // Layout observation nodes above/below based on depth and type
    // LLM generations go below, tool calls and API calls go above
    const topY = config.padding;
    const bottomY = centerY + config.nodeHeight + config.verticalGap;

    // Group observation nodes by their associated transcript turn
    // Find which transcript node each observation is closest to
    observationNodes.forEach(node => {
      let closestTranscriptX = config.padding;
      let minDiff = Infinity;

      transcriptNodes.forEach(tNode => {
        const diff = Math.abs(node.startMs - tNode.startMs);
        if (diff < minDiff) {
          minDiff = diff;
          const pos = positions.get(tNode.id);
          if (pos) closestTranscriptX = pos.x;
        }
      });

      // Offset based on depth for nested observations
      const depthOffset = node.depth * (config.nodeWidth * 0.3);

      // Place LLM generations below, tools/API above
      if (node.type === 'llm_generation') {
        positions.set(node.id, {
          x: closestTranscriptX + depthOffset,
          y: bottomY + (node.depth * (config.nodeHeight + config.verticalGap * 0.5)),
        });
      } else {
        positions.set(node.id, {
          x: closestTranscriptX + depthOffset,
          y: topY,
        });
      }
    });

    // Handle collision detection - spread out overlapping nodes
    const resolveCollisions = () => {
      const tolerance = 10;
      let hasCollision = true;
      let iterations = 0;
      const maxIterations = 50;

      while (hasCollision && iterations < maxIterations) {
        hasCollision = false;
        iterations++;

        const nodeList = Array.from(positions.entries());
        for (let i = 0; i < nodeList.length; i++) {
          for (let j = i + 1; j < nodeList.length; j++) {
            const [id1, pos1] = nodeList[i];
            const [id2, pos2] = nodeList[j];

            // Check if nodes are in the same row (similar y)
            if (Math.abs(pos1.y - pos2.y) < config.nodeHeight * 0.5) {
              // Check horizontal overlap
              const overlap = (config.nodeWidth + tolerance) - Math.abs(pos1.x - pos2.x);
              if (overlap > 0) {
                hasCollision = true;
                // Push nodes apart
                const shift = overlap / 2 + tolerance;
                if (pos1.x < pos2.x) {
                  positions.set(id1, { x: pos1.x - shift, y: pos1.y });
                  positions.set(id2, { x: pos2.x + shift, y: pos2.y });
                } else {
                  positions.set(id1, { x: pos1.x + shift, y: pos1.y });
                  positions.set(id2, { x: pos2.x - shift, y: pos2.y });
                }
              }
            }
          }
        }
      }
    };

    resolveCollisions();

    // Normalize positions (ensure all positive)
    let minX = Infinity;
    let minY = Infinity;
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
    });

    if (minX < config.padding) {
      const shiftX = config.padding - minX;
      positions.forEach((pos, id) => {
        positions.set(id, { x: pos.x + shiftX, y: pos.y });
      });
    }
    if (minY < config.padding) {
      const shiftY = config.padding - minY;
      positions.forEach((pos, id) => {
        positions.set(id, { x: pos.x, y: pos.y + shiftY });
      });
    }

    // Create positioned nodes
    const positionedNodes: PositionedFlowNode[] = nodes.map(node => {
      const pos = positions.get(node.id) || { x: config.padding, y: config.padding };
      return {
        ...node,
        position: {
          x: pos.x,
          y: pos.y,
          width: config.nodeWidth,
          height: config.nodeHeight,
        },
      };
    });

    // Calculate connection paths
    const connectionPaths: ConnectionPath[] = connections.map(conn => {
      const sourceNode = positionedNodes.find(n => n.id === conn.sourceId);
      const targetNode = positionedNodes.find(n => n.id === conn.targetId);

      if (!sourceNode || !targetNode) {
        return {
          connection: conn,
          path: '',
          sourceX: 0,
          sourceY: 0,
          targetX: 0,
          targetY: 0,
        };
      }

      // Calculate connection points
      const sourceX = sourceNode.position.x + sourceNode.position.width;
      const sourceY = sourceNode.position.y + sourceNode.position.height / 2;
      const targetX = targetNode.position.x;
      const targetY = targetNode.position.y + targetNode.position.height / 2;

      // Create curved path
      const midX = (sourceX + targetX) / 2;
      const controlOffset = Math.abs(targetY - sourceY) * 0.5 + 30;

      let path: string;
      if (conn.type === 'parent-child') {
        // Vertical connection with curve
        const sourceBottom = sourceNode.position.y + sourceNode.position.height;
        const targetTop = targetNode.position.y;
        const centerX = sourceNode.position.x + sourceNode.position.width / 2;
        const targetCenterX = targetNode.position.x + targetNode.position.width / 2;

        path = `M ${centerX} ${sourceBottom}
                C ${centerX} ${sourceBottom + controlOffset},
                  ${targetCenterX} ${targetTop - controlOffset},
                  ${targetCenterX} ${targetTop}`;
      } else {
        // Horizontal connection with curve
        path = `M ${sourceX} ${sourceY}
                C ${midX} ${sourceY},
                  ${midX} ${targetY},
                  ${targetX} ${targetY}`;
      }

      return {
        connection: conn,
        path,
        sourceX,
        sourceY,
        targetX,
        targetY,
      };
    }).filter(cp => cp.path !== '');

    // Calculate canvas dimensions
    let maxX = 0;
    let maxY = 0;
    positionedNodes.forEach(node => {
      maxX = Math.max(maxX, node.position.x + node.position.width);
      maxY = Math.max(maxY, node.position.y + node.position.height);
    });

    const width = maxX + config.padding;
    const height = maxY + config.padding;

    return {
      positionedNodes,
      connectionPaths,
      dimensions: {
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
      },
    };
  }, [nodes, connections, config]);
}

export default useFlowLayout;
