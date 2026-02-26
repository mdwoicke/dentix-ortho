/**
 * Call Flow Navigator Types
 * Types for the interactive flow visualization component
 */

import type { ProductionTraceObservation, ConversationTurn } from '../../../../types/testMonitor.types';

// ============================================================================
// FLOW NODE TYPES
// ============================================================================

/**
 * Debug flow layers (matches debug-flow skill architecture)
 * Layer 4: Flowise/User Interaction → Layer 3: Tools → Layer 2: Node-RED → Layer 1: Cloud9
 */
export type FlowLayer =
  | 'layer4_flowise'      // User/Flowise interaction layer
  | 'layer3_tools'        // Flowise Tools layer
  | 'layer2_nodered'      // Node-RED middleware layer
  | 'layer1_cloud9';      // Cloud9 direct API layer

/**
 * Types of nodes in the flow diagram
 */
export type FlowNodeType =
  | 'user_input'           // User message (Layer 4)
  | 'llm_generation'       // LLM generation (Layer 4)
  | 'tool_decision'        // Tool call decision (Layer 3)
  | 'api_call'             // API call span (Layer 2/1)
  | 'assistant_response'   // Assistant message (Layer 4)
  | 'error_state';         // Error node

/**
 * Status of a flow node
 */
export type FlowNodeStatus = 'success' | 'error' | 'bottleneck' | 'pending';

/**
 * A node in the flow diagram
 */
export interface FlowNode {
  id: string;
  type: FlowNodeType;
  layer: FlowLayer;
  label: string;
  subtitle?: string;
  startMs: number;
  durationMs: number;
  status: FlowNodeStatus;
  parentId?: string;
  depth: number;
  data: {
    observationId?: string;
    input?: unknown;
    output?: unknown;
    model?: string;
    tokens?: { input: number | null; output: number | null; total: number | null; cacheRead: number | null };
    cost?: number | null;
    errorMessage?: string;
    statusMessage?: string;
    content?: string;
  };
}

/**
 * Position of a node in the layout
 */
export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Flow node with computed position
 */
export interface PositionedFlowNode extends FlowNode {
  position: NodePosition;
}

// ============================================================================
// FLOW CONNECTION TYPES
// ============================================================================

/**
 * Types of connections between nodes
 */
export type FlowConnectionType = 'sequential' | 'parent-child' | 'retry';

/**
 * A connection between two nodes
 */
export interface FlowConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: FlowConnectionType;
  animated?: boolean;
}

/**
 * Connection path points for SVG rendering
 */
export interface ConnectionPath {
  connection: FlowConnection;
  path: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

// ============================================================================
// FLOW DATA TYPES
// ============================================================================

/**
 * Complete flow data structure
 */
export interface FlowData {
  nodes: FlowNode[];
  connections: FlowConnection[];
  totalDurationMs: number;
  totalCost: number;
  errorCount: number;
  bottleneckCount: number;
  maxDepth: number;
  apiCallCount: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
    cacheRead: number;
  };
  // Debug info
  _debug?: {
    rawObservationCount: number;
    filteredObservationCount: number;
    transcriptTurnCount: number;
    observationNames: string[];
  };
}

/**
 * Layout dimensions and configuration
 */
export interface FlowLayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;
  verticalGap: number;
  padding: number;
}

/**
 * Canvas dimensions
 */
export interface CanvasDimensions {
  width: number;
  height: number;
  viewBox: string;
}

// ============================================================================
// PLAYBACK TYPES
// ============================================================================

/**
 * Playback speed options
 */
export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

/**
 * Playback state
 */
export interface PlaybackState {
  isPlaying: boolean;
  currentTimeMs: number;
  speed: PlaybackSpeed;
  activeNodeIds: Set<string>;
  completedNodeIds: Set<string>;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * Props for the main CallFlowNavigator component
 */
export interface CallFlowNavigatorProps {
  observations: ProductionTraceObservation[];
  transcript: ConversationTurn[];
  traceStartTime: string;
  traceDurationMs?: number;
  bottleneckThresholdMs?: number;
  langfuseHost?: string;
  langfuseProjectId?: string;
  traceId?: string;
}

/**
 * Props for FlowNode component
 */
export interface FlowNodeProps {
  node: PositionedFlowNode;
  isActive: boolean;
  isCompleted: boolean;
  onClick: (nodeId: string) => void;
}

/**
 * Props for FlowConnection component
 */
export interface FlowConnectionProps {
  connection: ConnectionPath;
  isActive: boolean;
  type: FlowConnectionType;
}

/**
 * Props for MetricsBar component
 */
export interface MetricsBarProps {
  totalDurationMs: number;
  totalCost: number;
  apiCallCount: number;
  errorCount: number;
  bottleneckCount: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
    cacheRead: number;
  };
  onJumpToError?: () => void;
  onJumpToBottleneck?: () => void;
}

/**
 * Props for TimelineRail component
 */
export interface TimelineRailProps {
  totalDurationMs: number;
  currentTimeMs: number;
  events: Array<{ timeMs: number; nodeId: string }>;
  onTimeClick: (timeMs: number) => void;
}

/**
 * Props for PlaybackControls component
 */
export interface PlaybackControlsProps {
  isPlaying: boolean;
  speed: PlaybackSpeed;
  canStepBackward: boolean;
  canStepForward: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

/**
 * Props for NodeDetailPanel component
 */
export interface NodeDetailPanelProps {
  node: FlowNode | null;
  onClose: () => void;
  langfuseHost?: string;
  langfuseProjectId?: string;
  traceId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default layout configuration
 */
export const DEFAULT_LAYOUT_CONFIG: FlowLayoutConfig = {
  nodeWidth: 170,
  nodeHeight: 100,
  horizontalGap: 60,
  verticalGap: 50,
  padding: 40,
};

/**
 * Node type display configuration
 */
export const NODE_TYPE_CONFIG: Record<FlowNodeType, {
  icon: string;
  lightBg: string;
  darkBg: string;
  lightBorder: string;
  darkBorder: string;
  lightText: string;
  darkText: string;
}> = {
  user_input: {
    icon: '👤',
    lightBg: 'bg-blue-100',
    darkBg: 'dark:bg-blue-900/40',
    lightBorder: 'border-blue-400',
    darkBorder: 'dark:border-blue-500',
    lightText: 'text-blue-800',
    darkText: 'dark:text-blue-200',
  },
  llm_generation: {
    icon: '🤖',
    lightBg: 'bg-purple-100',
    darkBg: 'dark:bg-purple-900/40',
    lightBorder: 'border-purple-400',
    darkBorder: 'dark:border-purple-500',
    lightText: 'text-purple-800',
    darkText: 'dark:text-purple-200',
  },
  tool_decision: {
    icon: '🔧',
    lightBg: 'bg-amber-100',
    darkBg: 'dark:bg-amber-900/40',
    lightBorder: 'border-amber-400',
    darkBorder: 'dark:border-amber-500',
    lightText: 'text-amber-800',
    darkText: 'dark:text-amber-200',
  },
  api_call: {
    icon: '📡',
    lightBg: 'bg-green-100',
    darkBg: 'dark:bg-green-900/40',
    lightBorder: 'border-green-400',
    darkBorder: 'dark:border-green-500',
    lightText: 'text-green-800',
    darkText: 'dark:text-green-200',
  },
  assistant_response: {
    icon: '💬',
    lightBg: 'bg-teal-100',
    darkBg: 'dark:bg-teal-900/40',
    lightBorder: 'border-teal-400',
    darkBorder: 'dark:border-teal-500',
    lightText: 'text-teal-800',
    darkText: 'dark:text-teal-200',
  },
  error_state: {
    icon: '❌',
    lightBg: 'bg-red-100',
    darkBg: 'dark:bg-red-900/40',
    lightBorder: 'border-red-400',
    darkBorder: 'dark:border-red-500',
    lightText: 'text-red-800',
    darkText: 'dark:text-red-200',
  },
};

/**
 * Status display configuration
 */
export const STATUS_CONFIG: Record<FlowNodeStatus, {
  glowColor: string;
  ringColor: string;
}> = {
  success: {
    glowColor: 'shadow-green-300 dark:shadow-green-700',
    ringColor: 'ring-green-500',
  },
  error: {
    glowColor: 'shadow-red-300 dark:shadow-red-700',
    ringColor: 'ring-red-500',
  },
  bottleneck: {
    glowColor: 'shadow-orange-300 dark:shadow-orange-700',
    ringColor: 'ring-orange-500',
  },
  pending: {
    glowColor: '',
    ringColor: 'ring-gray-300 dark:ring-gray-600',
  },
};

/**
 * Observation names to exclude (internal framework nodes)
 */
export const EXCLUDED_OBSERVATION_NAMES = [
  'RunnableMap',
  'RunnableLambda',
  'RunnableSequence',
  'RunnableParallel',
  'RunnableBranch',
  'RunnablePassthrough',
  'RunnableWithFallbacks',
  'StrOutputParser',
  'JsonOutputParser',
];

// ============================================================================
// PIPELINE VIEW TYPES (for DataPipelineView component)
// ============================================================================

/**
 * Tool action extracted from observation data
 * Provides more detail than just the tool name
 */
export interface ToolAction {
  toolName: string;           // "chord_ortho_patient", "schedule_appointment_ortho"
  action: string;             // "lookup", "slots", "book_child"
  displayLabel: string;       // "Patient Lookup", "Book Appointment"
}

/**
 * Pipeline turn structure (one user message → response cycle)
 * Groups all nodes that occur within a single conversation turn
 */
export interface PipelineTurn {
  id: string;
  turnIndex: number;
  userInput: FlowNode | null;
  assistantResponse: FlowNode | null;
  layerNodes: {
    flowise: FlowNode[];
    tools: FlowNode[];
    nodeRed: FlowNode[];
    cloud9: FlowNode[];
  };
  hasError: boolean;
  errorNode: FlowNode | null;
  startMs: number;
  endMs: number;
}

/**
 * Tool action configuration map
 * Maps tool names to their actions with human-readable labels
 */
export const TOOL_ACTION_MAP: Record<string, {
  tool: string;
  actions: Record<string, string>;
}> = {
  chord_ortho_patient: {
    tool: 'Patient Tool',
    actions: {
      lookup: 'Patient Lookup',
      get: 'Get Patient Details',
      create: 'Create Patient',
      update: 'Update Patient',
      search: 'Search Patients',
      find: 'Find Patient',
    }
  },
  chord_dso_patient: {
    tool: 'Patient Tool',
    actions: {
      lookup: 'Patient Lookup',
      get: 'Get Patient Details',
      create: 'Create Patient',
      update: 'Update Patient',
      search: 'Search Patients',
      find: 'Find Patient',
    }
  },
  schedule_appointment_ortho: {
    tool: 'Scheduling Tool',
    actions: {
      slots: 'Get Available Slots',
      grouped_slots: 'Get Grouped Slots',
      book_child: 'Book Appointment',
      book: 'Book Appointment',
      cancel: 'Cancel Appointment',
      reschedule: 'Reschedule Appointment',
      confirm: 'Confirm Appointment',
      get_existing: 'Get Existing Appointments',
      locations: 'Get Locations',
      providers: 'Get Providers',
      appointment_types: 'Get Appointment Types',
    }
  },
  schedule_appointment_dso: {
    tool: 'Scheduling Tool',
    actions: {
      slots: 'Get Available Slots',
      grouped_slots: 'Get Grouped Slots',
      book_child: 'Book Appointment',
      book: 'Book Appointment',
      cancel: 'Cancel Appointment',
      reschedule: 'Reschedule Appointment',
      confirm: 'Confirm Appointment',
      get_existing: 'Get Existing Appointments',
      locations: 'Get Locations',
      providers: 'Get Providers',
      appointment_types: 'Get Appointment Types',
    }
  },
  handle_escalation: {
    tool: 'Escalation Tool',
    actions: {
      escalate: 'Escalate to Human',
      transfer: 'Transfer Call',
    }
  },
  current_datetime: {
    tool: 'DateTime Tool',
    actions: {
      get: 'Get Current DateTime',
    }
  },
};

/**
 * Layer configuration for debug flow visualization
 * Maps to the 4-layer architecture from debug-flow skill
 */
export const LAYER_CONFIG: Record<FlowLayer, {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  darkColor: string;
  order: number;
}> = {
  layer4_flowise: {
    label: 'Layer 4: Flowise',
    shortLabel: 'L4 Flowise',
    description: 'User interaction and LLM processing',
    color: 'bg-blue-500',
    darkColor: 'dark:bg-blue-600',
    order: 4,
  },
  layer3_tools: {
    label: 'Layer 3: Tools',
    shortLabel: 'L3 Tools',
    description: 'Flowise tool decisions and invocations',
    color: 'bg-amber-500',
    darkColor: 'dark:bg-amber-600',
    order: 3,
  },
  layer2_nodered: {
    label: 'Layer 2: Node-RED',
    shortLabel: 'L2 Node-RED',
    description: 'Middleware endpoints and transformations',
    color: 'bg-purple-500',
    darkColor: 'dark:bg-purple-600',
    order: 2,
  },
  layer1_cloud9: {
    label: 'Layer 1: Cloud9',
    shortLabel: 'L1 Cloud9',
    description: 'Direct Cloud9 API calls',
    color: 'bg-green-500',
    darkColor: 'dark:bg-green-600',
    order: 1,
  },
};

/**
 * Get the display label for the L1 (API) layer based on tenant context.
 * Chord uses NexHealth; Ortho (default) uses Cloud9.
 */
export function getL1Labels(l1Label?: string): { label: string; shortLabel: string; description: string } {
  const name = l1Label || 'Cloud9';
  return {
    label: `Layer 1: ${name}`,
    shortLabel: `L1 ${name}`,
    description: `Direct ${name} API calls`,
  };
}
