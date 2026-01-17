/**
 * Pipeline Transformers
 * Utility functions for transforming FlowNodes into Pipeline turn structures
 * for the DataPipelineView component
 */

import type { FlowNode, ToolAction, PipelineTurn } from './types';
import { TOOL_ACTION_MAP } from './types';

/**
 * Extract tool action from a node's input data
 * Parses the action field from tool call inputs
 */
export function extractToolAction(node: FlowNode): ToolAction | null {
  // Only process tool_decision nodes
  if (node.type !== 'tool_decision') {
    return null;
  }

  // Try to extract the action from input data
  const input = node.data.input as Record<string, unknown> | undefined;
  if (!input) {
    return null;
  }

  // Look for action field in various locations
  let action: string | undefined;
  if (typeof input.action === 'string') {
    action = input.action;
  } else if (typeof (input as Record<string, unknown>)?.input === 'object') {
    const nestedInput = (input as Record<string, { action?: string }>).input;
    if (typeof nestedInput?.action === 'string') {
      action = nestedInput.action;
    }
  }

  // Determine the tool name from the node label or subtitle
  const label = node.label?.toLowerCase() || '';
  const subtitle = node.subtitle?.toLowerCase() || '';

  // Find matching tool configuration
  let toolConfig: typeof TOOL_ACTION_MAP[string] | undefined;
  let toolName = '';

  for (const [key, config] of Object.entries(TOOL_ACTION_MAP)) {
    if (label.includes(key) || subtitle.includes(key) ||
        label.includes(config.tool.toLowerCase()) ||
        (key === 'chord_ortho_patient' && (label.includes('patient tool') || label.includes('patient'))) ||
        (key === 'schedule_appointment_ortho' && (label.includes('schedule') || label.includes('appt')))) {
      toolConfig = config;
      toolName = key;
      break;
    }
  }

  if (!toolConfig) {
    return {
      toolName: node.label || 'Unknown Tool',
      action: action || 'unknown',
      displayLabel: node.label || 'Unknown Operation',
    };
  }

  // Get the display label for this action
  const actionLabel = action && toolConfig.actions[action]
    ? toolConfig.actions[action]
    : action || 'Unknown Action';

  return {
    toolName,
    action: action || 'unknown',
    displayLabel: `${toolConfig.tool} > ${actionLabel}`,
  };
}

/**
 * Get a shortened action label for display
 */
export function getShortActionLabel(node: FlowNode): string {
  const toolAction = extractToolAction(node);
  if (toolAction) {
    return toolAction.displayLabel;
  }

  // Fallback to node label
  return node.label || 'Unknown';
}

/**
 * Transform FlowNodes into PipelineTurn structure
 * Groups nodes by conversation turn (user input → assistant response cycle)
 */
export function transformToPipelineData(
  nodes: FlowNode[],
  totalDurationMs: number
): PipelineTurn[] {
  const turns: PipelineTurn[] = [];
  const sortedNodes = [...nodes].sort((a, b) => a.startMs - b.startMs);

  // Separate conversation nodes from system nodes
  const conversationNodes = sortedNodes.filter(
    n => n.type === 'user_input' || n.type === 'assistant_response'
  );
  const systemNodes = sortedNodes.filter(
    n => n.type !== 'user_input' && n.type !== 'assistant_response'
  );

  // Track current turn
  let currentUserNode: FlowNode | null = null;
  let turnIndex = 0;

  // Process conversation nodes to identify turns
  conversationNodes.forEach((node, idx) => {
    if (node.type === 'user_input') {
      // If we have a pending user node without assistant response, save it as incomplete turn
      if (currentUserNode) {
        const nextNodeStart = node.startMs;
        const turnSystemNodes = systemNodes.filter(
          s => s.startMs >= currentUserNode!.startMs && s.startMs < nextNodeStart
        );

        turns.push(createPipelineTurn(
          turnIndex,
          currentUserNode,
          null,
          turnSystemNodes,
          nextNodeStart
        ));
        turnIndex++;
      }
      currentUserNode = node;
    } else if (node.type === 'assistant_response' && currentUserNode) {
      // Complete the turn
      const nextNodeStart = conversationNodes[idx + 1]?.startMs ?? totalDurationMs;
      const turnSystemNodes = systemNodes.filter(
        s => s.startMs >= currentUserNode!.startMs && s.startMs < nextNodeStart
      );

      turns.push(createPipelineTurn(
        turnIndex,
        currentUserNode,
        node,
        turnSystemNodes,
        node.startMs + node.durationMs
      ));
      turnIndex++;
      currentUserNode = null;
    }
  });

  // Handle remaining user node without response
  if (currentUserNode) {
    const turnSystemNodes = systemNodes.filter(
      s => s.startMs >= currentUserNode!.startMs
    );

    turns.push(createPipelineTurn(
      turnIndex,
      currentUserNode,
      null,
      turnSystemNodes,
      totalDurationMs
    ));
  }

  // POST-PROCESSING: Ensure all error nodes are associated with turns
  // Some error nodes may have timing that doesn't match any turn boundaries
  const allErrorNodes = nodes.filter(n => n.status === 'error');

  allErrorNodes.forEach(errorNode => {
    // Find which turn this error should belong to based on its startMs
    let targetTurnIndex = turns.findIndex(turn => {
      return errorNode.startMs >= turn.startMs && errorNode.startMs < turn.endMs;
    });

    // If not found, assign to the last turn as fallback
    if (targetTurnIndex === -1 && turns.length > 0) {
      targetTurnIndex = turns.length - 1;
    }

    // Mark the turn as having an error if not already marked
    if (targetTurnIndex >= 0 && !turns[targetTurnIndex].hasError) {
      turns[targetTurnIndex].hasError = true;
      turns[targetTurnIndex].errorNode = errorNode;
    }
  });

  return turns;
}

/**
 * Create a PipelineTurn object
 */
function createPipelineTurn(
  turnIndex: number,
  userInput: FlowNode | null,
  assistantResponse: FlowNode | null,
  systemNodes: FlowNode[],
  endMs: number
): PipelineTurn {
  // Group system nodes by layer - use more inclusive filtering
  // A node belongs to a layer based on either its layer property OR its type
  const layerNodes = {
    // L4 Flowise: LLM generation nodes
    flowise: systemNodes.filter(n =>
      n.layer === 'layer4_flowise' ||
      n.type === 'llm_generation'
    ),
    // L3 Tools: Tool decisions and tool-related API calls
    tools: systemNodes.filter(n =>
      n.layer === 'layer3_tools' ||
      n.type === 'tool_decision' ||
      // Also include api_calls that have tool-like names
      (n.type === 'api_call' && (
        n.label?.toLowerCase().includes('schedule') ||
        n.label?.toLowerCase().includes('patient') ||
        n.label?.toLowerCase().includes('tool') ||
        n.subtitle?.toLowerCase().includes('schedule') ||
        n.subtitle?.toLowerCase().includes('patient')
      ))
    ),
    // L2 Node-RED: API calls to Node-RED endpoints
    nodeRed: systemNodes.filter(n =>
      n.layer === 'layer2_nodered' ||
      (n.type === 'api_call' && (
        n.label?.toLowerCase().includes('ortho-prd') ||
        n.label?.toLowerCase().includes('nodered') ||
        n.label?.toLowerCase().includes('getlocation') ||
        n.label?.toLowerCase().includes('getappt') ||
        n.label?.toLowerCase().includes('createappt') ||
        n.subtitle?.toLowerCase().includes('ortho-prd')
      ))
    ),
    // L1 Cloud9: Direct Cloud9 API calls
    cloud9: systemNodes.filter(n =>
      n.layer === 'layer1_cloud9' ||
      (n.type === 'api_call' && (
        n.label?.toLowerCase().includes('cloud9') ||
        n.label?.toLowerCase().includes('getdata.ashx') ||
        n.label?.toLowerCase().includes('getonline') ||
        n.subtitle?.toLowerCase().includes('cloud9')
      ))
    ),
  };

  // For nodes not captured by specific layers, add to appropriate layer based on type
  const capturedIds = new Set([
    ...layerNodes.flowise.map(n => n.id),
    ...layerNodes.tools.map(n => n.id),
    ...layerNodes.nodeRed.map(n => n.id),
    ...layerNodes.cloud9.map(n => n.id),
  ]);

  // Uncaptured api_call nodes default to Node-RED layer
  const uncapturedApiCalls = systemNodes.filter(n =>
    !capturedIds.has(n.id) && n.type === 'api_call'
  );
  layerNodes.nodeRed.push(...uncapturedApiCalls);

  // Check for errors in ALL layer nodes (after they're fully populated)
  const allLayerNodes = [
    ...layerNodes.flowise,
    ...layerNodes.tools,
    ...layerNodes.nodeRed,
    ...layerNodes.cloud9,
  ];
  const errorNode = allLayerNodes.find(n => n.status === 'error') || null;
  const hasError = errorNode !== null;

  // Calculate start time
  const startMs = userInput?.startMs ??
    systemNodes[0]?.startMs ??
    assistantResponse?.startMs ?? 0;

  return {
    id: `pipeline-turn-${turnIndex}`,
    turnIndex,
    userInput,
    assistantResponse,
    layerNodes,
    hasError,
    errorNode,
    startMs,
    endMs,
  };
}

/**
 * Get the size of data in a human-readable format
 */
export function getDataSize(data: unknown): string {
  if (!data) return '0 B';

  const str = typeof data === 'string' ? data : JSON.stringify(data);
  const bytes = new Blob([str]).size;

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a node has meaningful input data
 */
export function hasInputData(node: FlowNode): boolean {
  const input = node.data.input;
  if (!input) return false;
  if (typeof input === 'object' && Object.keys(input as object).length === 0) return false;
  return true;
}

/**
 * Check if a node has meaningful output data
 */
export function hasOutputData(node: FlowNode): boolean {
  const output = node.data.output;
  if (!output) return false;
  if (typeof output === 'object' && Object.keys(output as object).length === 0) return false;
  return true;
}

/**
 * Get all nodes in a turn sorted by start time
 */
export function getAllTurnNodes(turn: PipelineTurn): FlowNode[] {
  const allNodes: FlowNode[] = [];

  if (turn.userInput) allNodes.push(turn.userInput);
  allNodes.push(...turn.layerNodes.flowise);
  allNodes.push(...turn.layerNodes.tools);
  allNodes.push(...turn.layerNodes.nodeRed);
  allNodes.push(...turn.layerNodes.cloud9);
  if (turn.assistantResponse) allNodes.push(turn.assistantResponse);

  return allNodes.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Check if a turn has any system processing (tools/API calls)
 */
export function hasSytemProcessing(turn: PipelineTurn): boolean {
  return (
    turn.layerNodes.flowise.length > 0 ||
    turn.layerNodes.tools.length > 0 ||
    turn.layerNodes.nodeRed.length > 0 ||
    turn.layerNodes.cloud9.length > 0
  );
}
