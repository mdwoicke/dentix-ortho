/**
 * Flow Transformers
 * Transform Langfuse observations and transcript data into flow diagram structures
 */

import type { ProductionTraceObservation, ConversationTurn } from '../../../../types/testMonitor.types';
import type { FlowNode, FlowConnection, FlowData, FlowNodeType, FlowLayer } from './types';
import { EXCLUDED_OBSERVATION_NAMES } from './types';

/**
 * Parse a timestamp string to milliseconds from a base time
 */
export function parseTimestampToMs(timestamp: string, baseTime: Date): number {
  try {
    const time = new Date(timestamp);
    return Math.max(0, time.getTime() - baseTime.getTime());
  } catch {
    return 0;
  }
}

/**
 * Format milliseconds as readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return '-';
  return `$${cost.toFixed(4)}`;
}

/**
 * Determine the layer for a node based on type and observation data
 * Maps to the 4-layer architecture from debug-flow skill:
 * Layer 4: Flowise/User → Layer 3: Tools → Layer 2: Node-RED → Layer 1: Cloud9
 */
function determineLayer(type: FlowNodeType, obs?: ProductionTraceObservation): FlowLayer {
  // User/Assistant messages and LLM are Layer 4 (Flowise)
  if (type === 'user_input' || type === 'assistant_response' || type === 'llm_generation') {
    return 'layer4_flowise';
  }

  // Tool decisions are Layer 3
  if (type === 'tool_decision') {
    return 'layer3_tools';
  }

  // Get name and check input/output for additional context
  const name = obs?.name?.toLowerCase() || '';
  const inputStr = JSON.stringify(obs?.input || {}).toLowerCase();
  const outputStr = JSON.stringify(obs?.output || {}).toLowerCase();
  const model = obs?.model?.toLowerCase() || '';

  // Cloud9 direct API patterns (Layer 1) - most specific first
  const cloud9Patterns = [
    'cloud9', 'c9api', 'getdata.ashx', 'setdata.ashx',
    'setpatient', 'setappointment', 'getlocations', 'getproviders',
    'getappttypes', 'getonlinereservations', 'getpatientinfo',
    'getappointmentlist', 'getrecords', 'getallrecords',
    'us-ea1-partner', 'partnertest.cloud9', 'partner.cloud9',
    'getportalpatient', 'getinsurance', 'getledger', 'getpayments',
    'getresponsibleparties', 'getbirthday', 'getscheduleview',
    'confirmapt', 'cancelapt',
  ];

  // Node-RED middleware patterns (Layer 2)
  const nodeRedPatterns = [
    'ortho-prd', 'nodered', 'node-red', 'n8n',
    'getlocation', 'getpatientbyfilter', 'getapptslots', 'getappt',
    'createpatient', 'createappt', 'updatepatient', 'updateappt',
    '/api/', 'webhook', 'flow', 'http request', 'http response',
    'function node', 'switch node', 'change node',
    'flowise-', 'langchain-', 'middleware',
    'getavailable', 'bookappointment', 'searchpatient',
  ];

  // Tool/Function call patterns (Layer 3)
  const toolPatterns = [
    'schedule_appointment', 'chord_dso', 'chord_ortho',
    'chord_patient', 'chord_scheduling', // Chord (NexHealth) tool prefixes
    'handle_escalation', 'handleescalation', 'current_datetime', 'current_date', 'currentdatetime',
    'patient_tool', 'scheduling_tool', 'tool_call', 'function_call',
    'tool:', 'action:', 'slots', 'book_child', 'lookup',
    'get_existing', 'grouped_slots', 'reschedule', 'cancel',
    'structuredtool', 'dynamictool', 'zapier', 'serp',
  ];

  // Error states - determine based on where they occurred
  if (type === 'error_state') {
    if (cloud9Patterns.some(p => name.includes(p) || inputStr.includes(p))) return 'layer1_cloud9';
    if (nodeRedPatterns.some(p => name.includes(p) || inputStr.includes(p))) return 'layer2_nodered';
    if (toolPatterns.some(p => name.includes(p) || inputStr.includes(p))) return 'layer3_tools';
    return 'layer4_flowise';
  }

  // Check for Cloud9 layer
  if (cloud9Patterns.some(p => name.includes(p) || inputStr.includes(p) || outputStr.includes(p))) {
    return 'layer1_cloud9';
  }

  // Check for Tool layer - also check input for action field
  if (toolPatterns.some(p => name.includes(p) || inputStr.includes(p))) {
    return 'layer3_tools';
  }

  // Check input for tool-like structure (has "action" field)
  if (obs?.input && typeof obs.input === 'object') {
    const input = obs.input as Record<string, unknown>;
    if (input.action || input.tool || input.function || input.toolName) {
      return 'layer3_tools';
    }
  }

  // Check for Node-RED layer
  if (nodeRedPatterns.some(p => name.includes(p) || inputStr.includes(p))) {
    return 'layer2_nodered';
  }

  // Check if it's an HTTP/API call based on output structure
  if (obs?.output && typeof obs.output === 'object') {
    const output = obs.output as Record<string, unknown>;
    if (output.statusCode || output.status || output.response || output.data) {
      return 'layer2_nodered';
    }
  }

  // If it's a SPAN type, default to Node-RED (API calls)
  if (obs?.type === 'SPAN') {
    return 'layer2_nodered';
  }

  // Default to Flowise for unknown types
  return 'layer4_flowise';
}

/**
 * Determine the node type from an observation
 */
function mapObservationType(obs: ProductionTraceObservation): FlowNodeType {
  // Check for errors first
  if (obs.level === 'ERROR' || obs.statusMessage?.toLowerCase().includes('error')) {
    return 'error_state';
  }

  // Check observation type - GENERATION is always LLM
  if (obs.type === 'GENERATION') {
    return 'llm_generation';
  }

  // Get name and input for pattern matching
  const name = obs.name?.toLowerCase() || '';
  const inputStr = JSON.stringify(obs.input || {}).toLowerCase();

  // Tool patterns - expanded list
  const toolPatterns = [
    'schedule_appointment', 'chord_dso', 'chord_ortho',
    'handle_escalation', 'current_datetime', 'current_date',
    'patient_tool', 'scheduling_tool', 'patient',
    'tool_call', 'function_call', 'structuredtool', 'dynamictool',
    'zapier', 'serp', 'calculator', 'search_tool',
    'lookup', 'book_child', 'get_existing', 'grouped_slots',
  ];

  // Check if it's a tool call
  if (toolPatterns.some(p => name.includes(p))) {
    return 'tool_decision';
  }

  // Check input for tool-like structure
  if (obs.input && typeof obs.input === 'object') {
    const input = obs.input as Record<string, unknown>;
    // Has action field = tool call
    if (input.action || input.tool || input.function || input.toolName) {
      return 'tool_decision';
    }
    // Flowise tool structure
    if (input.tool_input || input.tool_name) {
      return 'tool_decision';
    }
  }

  // Check name for tool indicators
  if (name.includes('tool') && !name.includes('http')) {
    return 'tool_decision';
  }

  // Default to api_call for spans
  if (obs.type === 'SPAN') {
    return 'api_call';
  }

  // EVENT type
  if (obs.type === 'EVENT') {
    return 'api_call';
  }

  return 'api_call';
}

/**
 * Format the node label from an observation
 */
function formatNodeLabel(obs: ProductionTraceObservation): string {
  if (!obs.name) return 'Unknown';

  // Shorten common long names
  const name = obs.name;
  if (name.includes('schedule_appointment_ortho')) return 'Schedule Appt';
  if (name.includes('chord_scheduling_v0')) return 'Schedule Appt';
  if (name.includes('chord_dso_patient')) return 'Patient Tool';
  if (name.includes('chord_ortho_patient')) return 'Patient Tool';
  if (name.includes('chord_patient_v0')) return 'Patient Tool';
  if (name.includes('handle_escalation') || name.includes('HandleEscalation')) return 'Escalation';
  if (name.includes('current_datetime') || name === 'CurrentDateTime') return 'Get DateTime';
  if (name.includes('claude-')) return 'LLM Generation';
  if (name.includes('gpt-')) return 'LLM Generation';

  // Truncate long names
  if (name.length > 20) {
    return name.substring(0, 17) + '...';
  }

  return name;
}

/**
 * Calculate the depth of an observation in the hierarchy
 */
function calculateDepth(
  obs: ProductionTraceObservation,
  observations: ProductionTraceObservation[],
  memo: Map<string, number> = new Map()
): number {
  if (memo.has(obs.observationId)) {
    return memo.get(obs.observationId)!;
  }

  if (!obs.parentObservationId) {
    memo.set(obs.observationId, 0);
    return 0;
  }

  const parent = observations.find(o => o.observationId === obs.parentObservationId);
  if (!parent) {
    memo.set(obs.observationId, 0);
    return 0;
  }

  const depth = calculateDepth(parent, observations, memo) + 1;
  memo.set(obs.observationId, depth);
  return depth;
}

/**
 * Check if an observation should be filtered out
 */
function shouldExcludeObservation(obs: ProductionTraceObservation): boolean {
  if (!obs.name) return false;
  return EXCLUDED_OBSERVATION_NAMES.some(excluded =>
    obs.name!.includes(excluded)
  );
}

/**
 * Debug call from tool's _debug_calls array
 */
interface DebugCall {
  id: number;
  layer: string;
  endpoint: string;
  method: string;
  requestBody: unknown;
  startTime: string;
  durationMs: number | null;
  status: number | null;
  response: unknown;
  error: string | null;
}

/**
 * Extract _debug_calls from tool observation output
 * These are the nested API calls made by Flowise tools
 */
function extractDebugCalls(obs: ProductionTraceObservation): DebugCall[] {
  if (!obs.output) return [];

  try {
    // Output might be a string or object
    let outputObj: Record<string, unknown>;

    if (typeof obs.output === 'string') {
      outputObj = JSON.parse(obs.output);
    } else {
      outputObj = obs.output as Record<string, unknown>;
    }

    // Check for _debug_calls array
    if (Array.isArray(outputObj._debug_calls)) {
      return outputObj._debug_calls as DebugCall[];
    }

    // Check nested in output field
    if (outputObj.output && typeof outputObj.output === 'object') {
      const nested = outputObj.output as Record<string, unknown>;
      if (Array.isArray(nested._debug_calls)) {
        return nested._debug_calls as DebugCall[];
      }
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Determine layer from debug call info
 */
function getLayerFromDebugCall(call: DebugCall): FlowLayer {
  const endpoint = call.endpoint?.toLowerCase() || '';
  const layer = call.layer?.toLowerCase() || '';

  // Check explicit layer marker
  if (layer.includes('cloud9') || layer.includes('l1')) {
    return 'layer1_cloud9';
  }
  if (layer.includes('nodered') || layer.includes('l2')) {
    return 'layer2_nodered';
  }

  // Check endpoint patterns for Cloud9
  if (endpoint.includes('cloud9') || endpoint.includes('getdata.ashx') ||
      endpoint.includes('setdata.ashx') || endpoint.includes('us-ea1-partner')) {
    return 'layer1_cloud9';
  }

  // Check endpoint patterns for Node-RED
  if (endpoint.includes('ortho-prd') || endpoint.includes('nodered') ||
      endpoint.includes('/api/') || endpoint.includes(':1880')) {
    return 'layer2_nodered';
  }

  // Default to Node-RED for HTTP calls
  return 'layer2_nodered';
}

/**
 * Format label for debug call
 */
function formatDebugCallLabel(call: DebugCall): string {
  const endpoint = call.endpoint || '';

  // Extract meaningful part of URL
  try {
    const url = new URL(endpoint);
    const path = url.pathname;

    // Get last path segment
    const segments = path.split('/').filter(s => s);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      // Truncate if too long
      return lastSegment.length > 20 ? lastSegment.substring(0, 17) + '...' : lastSegment;
    }

    return url.hostname.split('.')[0];
  } catch {
    // Fallback for relative URLs
    const segments = endpoint.split('/').filter(s => s);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      return lastSegment.length > 20 ? lastSegment.substring(0, 17) + '...' : lastSegment;
    }
    return call.method || 'API Call';
  }
}

/**
 * Transform observations and transcript into FlowData
 */
export function transformToFlowData(
  observations: ProductionTraceObservation[],
  transcript: ConversationTurn[],
  traceStartTime: string,
  bottleneckThresholdMs: number = 2000
): FlowData {
  const baseTime = new Date(traceStartTime);
  const nodes: FlowNode[] = [];
  const connections: FlowConnection[] = [];
  const depthMemo = new Map<string, number>();

  let errorCount = 0;
  let bottleneckCount = 0;
  let maxDepth = 0;
  let totalCost = 0;
  let apiCallCount = 0;
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let totalTokens = 0;
  let totalCacheRead = 0;

  // 1. Add transcript nodes (user inputs, assistant responses)
  transcript.forEach((turn, idx) => {
    const startMs = turn.timestamp
      ? parseTimestampToMs(turn.timestamp, baseTime)
      : idx * 1000; // Fallback estimate
    const durationMs = turn.responseTimeMs || 100;

    const isUser = turn.role === 'user';
    const nodeId = `turn-${idx}`;
    const nodeType = isUser ? 'user_input' as const : 'assistant_response' as const;

    nodes.push({
      id: nodeId,
      type: nodeType,
      layer: determineLayer(nodeType),
      label: isUser ? 'User Message' : 'Assistant Response',
      subtitle: undefined,
      startMs,
      durationMs,
      status: 'success',
      depth: 0,
      data: {
        content: turn.content,
      },
    });

    // Connect to previous turn
    if (idx > 0) {
      connections.push({
        id: `conn-turn-${idx - 1}-${idx}`,
        sourceId: `turn-${idx - 1}`,
        targetId: nodeId,
        type: 'sequential',
      });
    }
  });

  // 2. Filter and transform observations
  const filteredObs = observations.filter(obs => !shouldExcludeObservation(obs));

  filteredObs.forEach(obs => {
    const startMs = parseTimestampToMs(obs.startedAt, baseTime);
    const durationMs = obs.latencyMs || 0;
    const isBottleneck = durationMs > bottleneckThresholdMs;

    // Check for errors in multiple ways:
    // 1. level === 'ERROR'
    // 2. statusMessage contains 'error'
    // 3. output contains "success":false (tool errors)
    // 4. output contains _debug_error
    const outputStr = obs.output ? (typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output)) : '';
    const hasOutputError = outputStr.includes('"success":false') ||
                           outputStr.includes('"success": false') ||
                           outputStr.includes('_debug_error');
    const isError = obs.level === 'ERROR' ||
                    obs.statusMessage?.toLowerCase().includes('error') ||
                    hasOutputError;

    // Extract error message from output if available
    // Try extraction whenever isError is true, not just hasOutputError
    let errorMessage: string | undefined;
    if (isError && obs.output) {
      try {
        if (typeof obs.output === 'string') {
          // Check if output is a raw error string (e.g., "Error: {...}")
          if (obs.output.startsWith('Error:') || obs.output.startsWith('error:')) {
            errorMessage = obs.output;
          } else {
            // Try to parse as JSON
            const outputObj = JSON.parse(obs.output);
            const extracted = outputObj._debug_error || outputObj.error || outputObj.message || outputObj.errorMessage;
            errorMessage = typeof extracted === 'object' ? JSON.stringify(extracted) : extracted;
          }
        } else {
          const outputObj = obs.output as Record<string, unknown>;
          const extracted = outputObj._debug_error || outputObj.error || outputObj.message || outputObj.errorMessage;
          errorMessage = typeof extracted === 'object' ? JSON.stringify(extracted) : extracted as string | undefined;
        }
      } catch {
        // If JSON parse fails and output is a string, use it directly for error nodes
        if (typeof obs.output === 'string' && obs.output.length < 2000) {
          errorMessage = obs.output;
        }
      }
    }
    // Fallback to statusMessage if no errorMessage extracted
    if (!errorMessage && isError && obs.statusMessage) {
      errorMessage = obs.statusMessage;
    }

    if (isError) errorCount++;
    if (isBottleneck) bottleneckCount++;

    const depth = calculateDepth(obs, observations, depthMemo);
    maxDepth = Math.max(maxDepth, depth);

    if (obs.cost) totalCost += obs.cost;

    // Count API calls (tool decisions and actual API calls)
    const nodeType = mapObservationType(obs);
    if (nodeType === 'tool_decision' || nodeType === 'api_call') {
      apiCallCount++;
    }

    // Sum up token usage
    if (obs.usage) {
      if (obs.usage.input) totalTokensInput += obs.usage.input;
      if (obs.usage.output) totalTokensOutput += obs.usage.output;
      if (obs.usage.total) totalTokens += obs.usage.total;
      if (obs.usage.cacheRead) totalCacheRead += obs.usage.cacheRead;
    }

    nodes.push({
      id: obs.observationId,
      type: nodeType,
      layer: determineLayer(nodeType, obs),
      label: formatNodeLabel(obs),
      subtitle: obs.model || obs.name || undefined,
      startMs,
      durationMs,
      status: isError ? 'error' : isBottleneck ? 'bottleneck' : 'success',
      parentId: obs.parentObservationId || undefined,
      depth,
      data: {
        observationId: obs.observationId,
        input: obs.input,
        output: obs.output,
        model: obs.model || undefined,
        tokens: obs.usage ? {
          input: obs.usage.input,
          output: obs.usage.output,
          total: obs.usage.total,
          cacheRead: obs.usage.cacheRead,
        } : undefined,
        cost: obs.cost,
        statusMessage: obs.statusMessage || undefined,
        errorMessage: errorMessage,
      },
    });

    // Extract _debug_calls from tool observations and create nested nodes
    if (nodeType === 'tool_decision') {
      const debugCalls = extractDebugCalls(obs);

      debugCalls.forEach((call, callIdx) => {
        const callId = `${obs.observationId}-debug-${call.id || callIdx}`;
        const callLayer = getLayerFromDebugCall(call);
        const callStartMs = call.startTime
          ? parseTimestampToMs(call.startTime, baseTime)
          : startMs + (callIdx * 100); // Estimate if no timestamp
        const callDurationMs = call.durationMs || 50;
        // Check for errors in multiple ways:
        // 1. call.error is set
        // 2. HTTP status >= 400
        // 3. Response contains success: false
        const responseStr = call.response ? (typeof call.response === 'string' ? call.response : JSON.stringify(call.response)) : '';
        const hasResponseError = responseStr.includes('"success":false') ||
                                 responseStr.includes('"success": false') ||
                                 responseStr.includes('_debug_error');
        const callIsError = call.error !== null ||
                           (call.status !== null && call.status >= 400) ||
                           hasResponseError;

        if (callIsError) errorCount++;
        apiCallCount++;

        // Extract error message from debug call
        let callErrorMessage: string | undefined;
        if (callIsError) {
          // Direct error field takes priority
          if (call.error) {
            callErrorMessage = call.error;
          } else if (call.response) {
            try {
              const respObj = typeof call.response === 'string' ? JSON.parse(call.response as string) : call.response;
              const extracted = respObj._debug_error || respObj.error || respObj.message || respObj.errorMessage;
              callErrorMessage = typeof extracted === 'object' ? JSON.stringify(extracted) : extracted;
            } catch {
              // If response is a string, use it directly
              if (typeof call.response === 'string' && (call.response as string).length < 2000) {
                callErrorMessage = call.response as string;
              }
            }
          }
          // Fallback: note the HTTP status
          if (!callErrorMessage && call.status && call.status >= 400) {
            callErrorMessage = `HTTP ${call.status} error`;
          }
        }

        nodes.push({
          id: callId,
          type: 'api_call',
          layer: callLayer,
          label: formatDebugCallLabel(call),
          subtitle: `${call.method || 'GET'} ${call.status || ''}`,
          startMs: callStartMs,
          durationMs: callDurationMs,
          status: callIsError ? 'error' : 'success',
          parentId: obs.observationId,
          depth: depth + 1,
          data: {
            observationId: callId,
            input: call.requestBody,
            output: call.response,
            endpoint: call.endpoint,
            method: call.method,
            httpStatus: call.status,
            statusMessage: call.error || undefined,
            errorMessage: callErrorMessage,
          },
        });

        // Create connection from parent tool to this debug call
        connections.push({
          id: `conn-debug-${obs.observationId}-${callId}`,
          sourceId: obs.observationId,
          targetId: callId,
          type: 'parent-child',
        });

        maxDepth = Math.max(maxDepth, depth + 1);
      });
    }
  });

  // 3. Build connections based on timing and parent relationships
  // First, create parent-child connections
  filteredObs.forEach(obs => {
    if (obs.parentObservationId) {
      const parentExists = nodes.some(n => n.id === obs.parentObservationId);
      if (parentExists) {
        connections.push({
          id: `conn-parent-${obs.parentObservationId}-${obs.observationId}`,
          sourceId: obs.parentObservationId,
          targetId: obs.observationId,
          type: 'parent-child',
        });
      }
    }
  });

  // Sort nodes by startMs to find sequential relationships
  const sortedObsNodes = nodes
    .filter(n => !n.id.startsWith('turn-'))
    .sort((a, b) => a.startMs - b.startMs);

  // Create sequential connections for nodes without parents (top-level)
  let prevTopLevelNode: FlowNode | null = null;
  sortedObsNodes.forEach(node => {
    if (!node.parentId) {
      if (prevTopLevelNode && !connections.some(c =>
        c.targetId === node.id && c.type === 'sequential'
      )) {
        connections.push({
          id: `conn-seq-${prevTopLevelNode.id}-${node.id}`,
          sourceId: prevTopLevelNode.id,
          targetId: node.id,
          type: 'sequential',
        });
      }
      prevTopLevelNode = node;
    }
  });

  // Calculate total duration
  const allEndTimes = nodes.map(n => n.startMs + n.durationMs);
  const totalDurationMs = allEndTimes.length > 0 ? Math.max(...allEndTimes) : 0;

  return {
    nodes,
    connections,
    totalDurationMs,
    totalCost,
    errorCount,
    bottleneckCount,
    maxDepth,
    apiCallCount,
    tokenUsage: {
      input: totalTokensInput,
      output: totalTokensOutput,
      total: totalTokens || (totalTokensInput + totalTokensOutput),
      cacheRead: totalCacheRead,
    },
    _debug: {
      rawObservationCount: observations.length,
      filteredObservationCount: filteredObs.length,
      transcriptTurnCount: transcript.length,
      observationNames: observations.slice(0, 20).map(o => o.name || 'unnamed'),
    },
  };
}

/**
 * Find the first error node
 */
export function findFirstError(nodes: FlowNode[]): FlowNode | null {
  const errorNodes = nodes
    .filter(n => n.status === 'error')
    .sort((a, b) => a.startMs - b.startMs);
  return errorNodes.length > 0 ? errorNodes[0] : null;
}

/**
 * Find the first bottleneck node
 */
export function findFirstBottleneck(nodes: FlowNode[]): FlowNode | null {
  const bottleneckNodes = nodes
    .filter(n => n.status === 'bottleneck')
    .sort((a, b) => a.startMs - b.startMs);
  return bottleneckNodes.length > 0 ? bottleneckNodes[0] : null;
}

/**
 * Get timeline events from nodes
 */
export function getTimelineEvents(nodes: FlowNode[]): Array<{ timeMs: number; nodeId: string }> {
  return nodes
    .map(n => ({ timeMs: n.startMs, nodeId: n.id }))
    .sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Get active nodes at a given time
 */
export function getActiveNodesAtTime(nodes: FlowNode[], timeMs: number): Set<string> {
  const active = new Set<string>();
  nodes.forEach(node => {
    if (node.startMs <= timeMs && node.startMs + node.durationMs >= timeMs) {
      active.add(node.id);
    }
  });
  return active;
}

/**
 * Get completed nodes at a given time
 */
export function getCompletedNodesAtTime(nodes: FlowNode[], timeMs: number): Set<string> {
  const completed = new Set<string>();
  nodes.forEach(node => {
    if (node.startMs + node.durationMs < timeMs) {
      completed.add(node.id);
    }
  });
  return completed;
}
