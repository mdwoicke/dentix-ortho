/**
 * FlowViewPopout Component
 * Full-screen popout modal for the Call Flow Navigator
 * Provides a spacious, professional view of the call trace
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { cn } from '../../../../utils/cn';
import { copyToClipboard } from '../../../../utils/clipboard';
import type { FlowNode, FlowData } from './types';
import { LAYER_CONFIG } from './types';
import { formatDuration } from './flowTransformers';
import { DataPipelineView } from './DataPipelineView';
import { usePlaybackAnimation } from './usePlaybackAnimation';
import { ReplayPanel } from './ReplayPanel';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  X: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Phone: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Dollar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Server: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  Chip: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  Play: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
    </svg>
  ),
  Pause: () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  SkipBack: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
    </svg>
  ),
  SkipForward: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  QuestionMark: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Keyboard: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Expand: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  ),
  Replay: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface FlowViewPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  flowData: FlowData;
  totalDurationMs: number;
  langfuseHost?: string;
  traceId?: string;
  sessionId?: string;
}

// ============================================================================
// METRIC PILL COMPONENT
// ============================================================================

interface MetricPillProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'default' | 'success' | 'warning' | 'error';
  onClick?: () => void;
}

function MetricPill({ icon, label, value, subValue, color = 'default', onClick }: MetricPillProps) {
  const colorStyles = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    warning: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg',
        colorStyles[color],
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity'
      )}
    >
      <span className="opacity-70">{icon}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold">{value}</span>
        <span className="text-xs opacity-70">{label}</span>
        {subValue && <span className="text-xs opacity-50">({subValue})</span>}
      </div>
    </div>
  );
}

// ============================================================================
// NODE DETAIL SIDEBAR
// ============================================================================

interface NodeDetailSidebarProps {
  node: FlowNode | null;
  onClose: () => void;
  langfuseHost?: string;
  traceId?: string;
}

// Helper to determine if a node supports replay
function isReplayableNode(node: FlowNode): boolean {
  // Support Layer 3 (tools) and Layer 2 (Node-RED) nodes
  return node.layer === 'layer3_tools' || node.layer === 'layer2_nodered';
}

// Base URL for Node-RED endpoints
const NODERED_BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

// Endpoint map matching the actual tool scripts
const TOOL_ENDPOINTS: Record<string, Record<string, string>> = {
  chord_ortho_patient: {
    lookup: `${NODERED_BASE_URL}/ortho-prd/getPatientByFilter`,
    get: `${NODERED_BASE_URL}/ortho-prd/getPatient`,
    create: `${NODERED_BASE_URL}/ortho-prd/createPatient`,
    appointments: `${NODERED_BASE_URL}/ortho-prd/getPatientAppts`,
    clinic_info: `${NODERED_BASE_URL}/ortho-prd/getLocation`,
    edit_insurance: `${NODERED_BASE_URL}/ortho-prd/editInsurance`,
    confirm_appointment: `${NODERED_BASE_URL}/ortho-prd/confirmAppt`,
  },
  schedule_appointment_ortho: {
    slots: `${NODERED_BASE_URL}/ortho-prd/getApptSlots`,
    grouped_slots: `${NODERED_BASE_URL}/ortho-prd/getGroupedApptSlots`,
    book_child: `${NODERED_BASE_URL}/ortho-prd/createAppt`,
    cancel: `${NODERED_BASE_URL}/ortho-prd/cancelAppt`,
  },
};

// Helper to extract tool name and action from node
function extractToolInfo(node: FlowNode): { toolName: string; action: string; endpoint: string } | null {
  const name = node.label?.toLowerCase() || '';
  const type = node.type?.toLowerCase() || '';

  // PRIORITY 1: Try to extract action from node.data.input (most reliable)
  if (node.data?.input && typeof node.data.input === 'object') {
    const input = node.data.input as Record<string, unknown>;
    if (input.action && typeof input.action === 'string') {
      const action = input.action as string;

      // Patient tool actions
      const patientActions = ['lookup', 'get', 'create', 'appointments', 'clinic_info', 'edit_insurance', 'confirm_appointment'];
      if (patientActions.includes(action)) {
        return {
          toolName: 'chord_ortho_patient',
          action,
          endpoint: TOOL_ENDPOINTS.chord_ortho_patient[action] || `${NODERED_BASE_URL}/ortho-prd/${action}`
        };
      }

      // Scheduling tool actions
      const schedulingActions = ['slots', 'grouped_slots', 'book_child', 'cancel'];
      if (schedulingActions.includes(action)) {
        return {
          toolName: 'schedule_appointment_ortho',
          action,
          endpoint: TOOL_ENDPOINTS.schedule_appointment_ortho[action] || `${NODERED_BASE_URL}/ortho-prd/${action}`
        };
      }
    }
  }

  // PRIORITY 2: Map node names/types to tool names and actions
  if (name.includes('patient') || type.includes('patient')) {
    if (name.includes('lookup') || name.includes('filter')) {
      return { toolName: 'chord_ortho_patient', action: 'lookup', endpoint: TOOL_ENDPOINTS.chord_ortho_patient.lookup };
    }
    if (name.includes('create')) {
      return { toolName: 'chord_ortho_patient', action: 'create', endpoint: TOOL_ENDPOINTS.chord_ortho_patient.create };
    }
    if (name.includes('appt') || name.includes('appointment')) {
      return { toolName: 'chord_ortho_patient', action: 'appointments', endpoint: TOOL_ENDPOINTS.chord_ortho_patient.appointments };
    }
    if (name.includes('clinic') || name.includes('location')) {
      return { toolName: 'chord_ortho_patient', action: 'clinic_info', endpoint: TOOL_ENDPOINTS.chord_ortho_patient.clinic_info };
    }
    if (name.includes('insurance')) {
      return { toolName: 'chord_ortho_patient', action: 'edit_insurance', endpoint: TOOL_ENDPOINTS.chord_ortho_patient.edit_insurance };
    }
    if (name.includes('confirm')) {
      return { toolName: 'chord_ortho_patient', action: 'confirm_appointment', endpoint: TOOL_ENDPOINTS.chord_ortho_patient.confirm_appointment };
    }
    return { toolName: 'chord_ortho_patient', action: 'get', endpoint: TOOL_ENDPOINTS.chord_ortho_patient.get };
  }

  if (name.includes('schedule') || name.includes('appt') || name.includes('slot') || type.includes('schedule')) {
    if (name.includes('grouped') || name.includes('group')) {
      return { toolName: 'schedule_appointment_ortho', action: 'grouped_slots', endpoint: TOOL_ENDPOINTS.schedule_appointment_ortho.grouped_slots };
    }
    if (name.includes('slot') || name.includes('available')) {
      return { toolName: 'schedule_appointment_ortho', action: 'slots', endpoint: TOOL_ENDPOINTS.schedule_appointment_ortho.slots };
    }
    if (name.includes('book') || name.includes('create')) {
      return { toolName: 'schedule_appointment_ortho', action: 'book_child', endpoint: TOOL_ENDPOINTS.schedule_appointment_ortho.book_child };
    }
    if (name.includes('cancel')) {
      return { toolName: 'schedule_appointment_ortho', action: 'cancel', endpoint: TOOL_ENDPOINTS.schedule_appointment_ortho.cancel };
    }
  }

  return null;
}

function NodeDetailSidebar({ node, onClose, langfuseHost, traceId }: NodeDetailSidebarProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<'input' | 'output' | null>(null);
  const [showReplayPanel, setShowReplayPanel] = useState(false);

  // Check if this node supports replay
  const toolInfo = node ? extractToolInfo(node) : null;
  const canReplay = node && isReplayableNode(node) && node.data.input && toolInfo;

  const handleCopy = async (text: string, field: string) => {
    try {
      await copyToClipboard(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!node) return null;

  const layerConfig = LAYER_CONFIG[node.layer];
  const inputJson = node.data.input ? JSON.stringify(node.data.input, null, 2) : '';
  const outputJson = node.data.output ? JSON.stringify(node.data.output, null, 2) : '';

  return (
    <div className="w-[400px] xl:w-[500px] 2xl:w-[600px] h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-200">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Node Details
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {node.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Icons.X />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Layer & Status */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium',
              node.layer === 'layer4_flowise' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
              node.layer === 'layer3_tools' && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
              node.layer === 'layer2_nodered' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
              node.layer === 'layer1_cloud9' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
            )}>
              {layerConfig.label}
            </span>
            <span className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium capitalize',
              node.status === 'success' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
              node.status === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
              node.status === 'bottleneck' && 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
              node.status === 'pending' && 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
            )}>
              {node.status}
            </span>
          </div>
        </div>

        {/* Timing */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Timing</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Started</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">+{formatDuration(node.startMs)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
              <div className={cn(
                'text-sm font-medium',
                node.status === 'bottleneck' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'
              )}>
                {formatDuration(node.durationMs)}
              </div>
            </div>
          </div>
        </div>

        {/* Cost & Tokens */}
        {(node.data.cost != null || node.data.tokens) && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Usage</h4>
            <div className="grid grid-cols-2 gap-4">
              {node.data.cost != null && node.data.cost > 0 && (
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Cost</div>
                  <div className="text-sm font-medium text-green-600 dark:text-green-400">${node.data.cost.toFixed(4)}</div>
                </div>
              )}
              {node.data.tokens && (
                <>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Input Tokens</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{node.data.tokens.input?.toLocaleString() || '0'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Output Tokens</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{node.data.tokens.output?.toLocaleString() || '0'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {node.data.content && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Content</h4>
              <button
                onClick={() => handleCopy(node.data.content || '', 'content')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {copiedField === 'content' ? <Icons.CheckCircle /> : <Icons.Copy />}
                {copiedField === 'content' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-300 max-h-40 xl:max-h-52 2xl:max-h-64 overflow-y-auto">
              {node.data.content}
            </div>
          </div>
        )}

        {/* Input/Output */}
        {node.data.input && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Input</h4>
              <div className="flex items-center gap-2">
                {canReplay && (
                  <button
                    onClick={() => setShowReplayPanel(true)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                    title="Replay this API call"
                  >
                    <Icons.Replay />
                    Replay
                  </button>
                )}
                <button
                  onClick={() => setExpandedPanel('input')}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  title="Open in full view"
                >
                  <Icons.Expand />
                </button>
                <button
                  onClick={() => handleCopy(inputJson, 'input')}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {copiedField === 'input' ? <Icons.CheckCircle /> : <Icons.Copy />}
                  {copiedField === 'input' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 max-h-40 xl:max-h-52 2xl:max-h-64 overflow-auto font-mono">
              {inputJson}
            </pre>
          </div>
        )}

        {node.data.output && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Output</h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedPanel('output')}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  title="Open in full view"
                >
                  <Icons.Expand />
                </button>
                <button
                  onClick={() => handleCopy(outputJson, 'output')}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {copiedField === 'output' ? <Icons.CheckCircle /> : <Icons.Copy />}
                  {copiedField === 'output' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 max-h-40 xl:max-h-52 2xl:max-h-64 overflow-auto font-mono">
              {outputJson}
            </pre>
          </div>
        )}

        {/* Error Message */}
        {(node.data.errorMessage || node.data.statusMessage) && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Error Details</h4>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {node.data.errorMessage || node.data.statusMessage}
            </div>
          </div>
        )}

        {/* External Links */}
        {(langfuseHost && node.data.observationId) && (
          <div className="px-6 py-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Links</h4>
            <a
              href={`${langfuseHost}/project/*/traces/${traceId}?observation=${node.data.observationId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Icons.ExternalLink />
              View in Langfuse
            </a>
          </div>
        )}
      </div>

      {/* JSON Popout Modals */}
      {expandedPanel && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExpandedPanel(null)}
        >
          <div
            className={cn(
              'relative w-full max-w-6xl h-[85vh] flex flex-col rounded-xl shadow-2xl border-2',
              'bg-gray-50 dark:bg-gray-900',
              expandedPanel === 'input'
                ? 'border-blue-400 dark:border-blue-600'
                : 'border-green-400 dark:border-green-600'
            )}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={cn(
              'flex items-center justify-between px-5 py-3 border-b rounded-t-xl',
              expandedPanel === 'input'
                ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800'
                : 'bg-green-100 dark:bg-green-900/50 border-green-200 dark:border-green-800'
            )}>
              <div className="flex items-center gap-3">
                <span className={cn(
                  'text-lg font-bold uppercase',
                  expandedPanel === 'input'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-green-700 dark:text-green-300'
                )}>
                  {expandedPanel === 'input' ? 'Input' : 'Output'}
                </span>
                <span className={cn(
                  'text-sm font-mono',
                  expandedPanel === 'input'
                    ? 'text-blue-500 dark:text-blue-400'
                    : 'text-green-500 dark:text-green-400'
                )}>
                  {((expandedPanel === 'input' ? inputJson : outputJson).length / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const data = expandedPanel === 'input' ? inputJson : outputJson;
                    handleCopy(data, expandedPanel);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                    expandedPanel === 'input'
                      ? 'bg-blue-200 dark:bg-blue-800/50 hover:bg-blue-300 dark:hover:bg-blue-700/50 text-blue-700 dark:text-blue-300'
                      : 'bg-green-200 dark:bg-green-800/50 hover:bg-green-300 dark:hover:bg-green-700/50 text-green-700 dark:text-green-300'
                  )}
                >
                  {copiedField === expandedPanel ? <Icons.CheckCircle /> : <Icons.Copy />}
                  {copiedField === expandedPanel ? 'Copied!' : 'Copy All'}
                </button>
                <button
                  onClick={() => setExpandedPanel(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Icons.X />
                </button>
              </div>
            </div>

            {/* Content */}
            <pre className="flex-1 p-6 text-sm font-mono overflow-auto bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 leading-relaxed">
              {expandedPanel === 'input' ? inputJson : outputJson}
            </pre>
          </div>
        </div>
      )}

      {/* Replay Panel Modal */}
      {canReplay && toolInfo && (
        <ReplayPanel
          isOpen={showReplayPanel}
          onClose={() => setShowReplayPanel(false)}
          toolName={toolInfo.toolName}
          action={toolInfo.action}
          endpoint={toolInfo.endpoint}
          initialInput={node.data.input as Record<string, unknown>}
          observationId={node.data.observationId}
        />
      )}
    </div>
  );
}

// ============================================================================
// KEYBOARD SHORTCUTS MODAL
// ============================================================================

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', description: 'Play / Pause playback' },
    { key: '←', description: 'Step backward' },
    { key: '→', description: 'Step forward' },
    { key: 'Home', description: 'Jump to start' },
    { key: 'End', description: 'Jump to end' },
    { key: '1', description: 'Set speed to 0.5x' },
    { key: '2', description: 'Set speed to 1x' },
    { key: '3', description: 'Set speed to 2x' },
    { key: '4', description: 'Set speed to 4x' },
    { key: 'Esc', description: 'Close panel / Close modal' },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[400px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Icons.Keyboard />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Icons.X />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-4">
          <div className="space-y-2">
            {shortcuts.map(({ key, description }) => (
              <div
                key={key}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <span className="text-sm text-gray-600 dark:text-gray-300">{description}</span>
                <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 shadow-sm">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tip:</strong> Click anywhere on the progress bar to jump to that position.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FlowViewPopout({
  isOpen,
  onClose,
  flowData,
  totalDurationMs,
  langfuseHost,
  traceId,
  sessionId,
}: FlowViewPopoutProps) {
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [currentSearchMatchIndex, setCurrentSearchMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Playback animation - uses fixed visualization duration for smooth viewing
  const {
    isPlaying,
    currentTimeMs,
    speed,
    activeNodeIds,
    completedNodeIds,
    play,
    pause,
    stepForward,
    stepBackward,
    jumpToStart,
    jumpToEnd,
    jumpToProgress,
    setSpeed,
    canStepForward,
    canStepBackward,
    visualizationDurationMs,
    currentStepIndex,
    totalSteps,
    jumpToStep,
    events,
  } = usePlaybackAnimation({
    nodes: flowData.nodes,
    totalDurationMs,
  });

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNode) {
          setSelectedNode(null);
        } else {
          onClose();
        }
      }
      if (e.key === ' ' && !e.target?.toString().includes('input')) {
        e.preventDefault();
        isPlaying ? pause() : play();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, play, pause, onClose, selectedNode]);

  const handleNodeClick = useCallback((node: FlowNode) => {
    setSelectedNode(node);
  }, []);

  // Find first error/bottleneck for quick navigation
  const jumpToError = useCallback(() => {
    const errorNode = flowData.nodes.find(n => n.status === 'error');
    if (errorNode) setSelectedNode(errorNode);
  }, [flowData.nodes]);

  const jumpToBottleneck = useCallback(() => {
    const bottleneckNode = flowData.nodes.find(n => n.status === 'bottleneck');
    if (bottleneckNode) setSelectedNode(bottleneckNode);
  }, [flowData.nodes]);

  // Search matching node IDs
  const searchMatchingNodeIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();

    const query = searchQuery.toLowerCase().trim();
    const matchingIds = new Set<string>();

    flowData.nodes.forEach(node => {
      if (node.label.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
        return;
      }
      if (node.subtitle?.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
        return;
      }
      if (node.data.content?.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
        return;
      }
      if (node.data.errorMessage?.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
        return;
      }
      if (node.type.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
        return;
      }
      if (node.layer.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
        return;
      }
    });

    return matchingIds;
  }, [flowData.nodes, searchQuery]);

  // Sorted array of matching nodes for navigation
  const searchMatchingNodes = useMemo(() => {
    if (searchMatchingNodeIds.size === 0) return [];
    return flowData.nodes
      .filter(n => searchMatchingNodeIds.has(n.id))
      .sort((a, b) => a.startMs - b.startMs);
  }, [flowData.nodes, searchMatchingNodeIds]);

  // Current focused search match node ID
  const currentSearchMatchNodeId = useMemo(() => {
    if (searchMatchingNodes.length === 0) return null;
    const safeIndex = Math.min(currentSearchMatchIndex, searchMatchingNodes.length - 1);
    return searchMatchingNodes[safeIndex]?.id || null;
  }, [searchMatchingNodes, currentSearchMatchIndex]);

  // Reset search match index when search query changes
  useEffect(() => {
    setCurrentSearchMatchIndex(0);
  }, [searchQuery]);

  // Focus search input when search is shown
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Navigate to search match
  const jumpToSearchMatch = useCallback((index: number) => {
    if (searchMatchingNodes.length === 0) return;
    const wrappedIndex = ((index % searchMatchingNodes.length) + searchMatchingNodes.length) % searchMatchingNodes.length;
    setCurrentSearchMatchIndex(wrappedIndex);
    const matchNode = searchMatchingNodes[wrappedIndex];
    if (matchNode) {
      setSelectedNode(matchNode);
    }
  }, [searchMatchingNodes]);

  const jumpToPreviousSearchMatch = useCallback(() => {
    jumpToSearchMatch(currentSearchMatchIndex - 1);
  }, [jumpToSearchMatch, currentSearchMatchIndex]);

  const jumpToNextSearchMatch = useCallback(() => {
    jumpToSearchMatch(currentSearchMatchIndex + 1);
  }, [jumpToSearchMatch, currentSearchMatchIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[95vw] h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white">
                <Icons.Phone />
                <span className="font-bold text-sm uppercase tracking-wide">Call Flow Navigator</span>
              </div>
              {sessionId && (
                <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {sessionId}
                </span>
              )}
            </div>

            {/* Metrics - only show those with data */}
            <div className="flex items-center gap-2">
              <MetricPill icon={<Icons.Clock />} label="Duration" value={formatDuration(totalDurationMs)} />
              {flowData.totalCost > 0 && (
                <MetricPill
                  icon={<Icons.Dollar />}
                  label="Cost"
                  value={`$${flowData.totalCost.toFixed(4)}`}
                  color="success"
                />
              )}
              {flowData.apiCallCount > 0 && (
                <MetricPill icon={<Icons.Server />} label="API Calls" value={flowData.apiCallCount} />
              )}
              {flowData.tokenUsage.total > 0 && (
                <MetricPill
                  icon={<Icons.Chip />}
                  label="Tokens"
                  value={flowData.tokenUsage.total.toLocaleString()}
                  subValue={`${flowData.tokenUsage.input.toLocaleString()} / ${flowData.tokenUsage.output.toLocaleString()}`}
                />
              )}
              {flowData.errorCount > 0 && (
                <MetricPill
                  icon={<Icons.XCircle />}
                  label="Errors"
                  value={flowData.errorCount}
                  color="error"
                  onClick={jumpToError}
                />
              )}
              {flowData.bottleneckCount > 0 && (
                <MetricPill
                  icon={<Icons.Flame />}
                  label="Bottlenecks"
                  value={flowData.bottleneckCount}
                  color="warning"
                  onClick={jumpToBottleneck}
                />
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Icons.X />
            </button>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={jumpToStart}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Jump to start (Home)"
              >
                <Icons.SkipBack />
              </button>
              <button
                onClick={stepBackward}
                disabled={!canStepBackward}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  canStepBackward
                    ? "text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700"
                    : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                )}
                title="Previous step (←)"
              >
                <Icons.ChevronLeft />
              </button>
              <button
                onClick={isPlaying ? pause : play}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Icons.Pause /> : <Icons.Play />}
              </button>
              <button
                onClick={stepForward}
                disabled={!canStepForward}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  canStepForward
                    ? "text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700"
                    : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                )}
                title="Next step (→)"
              >
                <Icons.ChevronRight />
              </button>
              <button
                onClick={jumpToEnd}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Jump to end (End)"
              >
                <Icons.SkipForward />
              </button>
            </div>

            <div className="flex items-center gap-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Speed:</span>
              {([0.5, 1, 2, 4] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    'px-2 py-1 rounded text-sm font-medium transition-colors',
                    speed === s
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Step counter */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                Step {currentStepIndex + 1}
              </span>
              <span className="text-xs text-indigo-500 dark:text-indigo-400">
                of {totalSteps}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-3">
              {/* Animated progress bar - clickable for scrubbing */}
              <div
                className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  jumpToProgress(percent);
                }}
                title="Click to seek"
              >
                <div
                  className={cn(
                    "h-full transition-all duration-100 relative",
                    "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
                  )}
                  style={{ width: `${visualizationDurationMs > 0 ? (currentTimeMs / visualizationDurationMs) * 100 : 0}%` }}
                >
                  {/* Animated pulse at the leading edge */}
                  <div className={cn(
                    "absolute right-0 top-0 bottom-0 w-4 bg-white/30",
                    isPlaying && "animate-pulse"
                  )} />
                </div>
                {/* Step markers */}
                {totalSteps > 1 && totalSteps <= 30 && (
                  <div className="absolute inset-0 flex pointer-events-none">
                    {Array.from({ length: totalSteps - 1 }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 border-r border-gray-300 dark:border-gray-600"
                      />
                    ))}
                  </div>
                )}
                {/* Hover indicator */}
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none" />
              </div>
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400 min-w-[140px] text-right">
                {formatDuration(currentTimeMs)} / {formatDuration(visualizationDurationMs)}
              </span>
            </div>

            {/* Search Controls */}
            <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-3 ml-2">
              <button
                onClick={() => {
                  setShowSearch(!showSearch);
                  if (!showSearch) {
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }
                }}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  showSearch
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
                title="Search nodes (Ctrl+F)"
              >
                <Icons.Search />
              </button>

              {showSearch && (
                <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search nodes..."
                    className="px-2 py-1 text-xs bg-transparent outline-none w-32 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (e.shiftKey) {
                          jumpToPreviousSearchMatch();
                        } else {
                          jumpToNextSearchMatch();
                        }
                      }
                      if (e.key === 'Escape') {
                        setShowSearch(false);
                        setSearchQuery('');
                      }
                    }}
                  />
                  {searchQuery && searchMatchingNodes.length > 0 && (
                    <>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 px-1 whitespace-nowrap">
                        {currentSearchMatchIndex + 1}/{searchMatchingNodes.length}
                      </span>
                      <button
                        onClick={jumpToPreviousSearchMatch}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        title="Previous match (Shift+Enter)"
                      >
                        <Icons.ChevronLeft />
                      </button>
                      <button
                        onClick={jumpToNextSearchMatch}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        title="Next match (Enter)"
                      >
                        <Icons.ChevronRight />
                      </button>
                    </>
                  )}
                  {searchQuery && searchMatchingNodes.length === 0 && (
                    <span className="text-[10px] text-gray-400 px-2">No matches</span>
                  )}
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      title="Clear search"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowShortcutsHelp(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Show keyboard shortcuts"
            >
              <Icons.QuestionMark />
              <span className="hidden sm:inline">Shortcuts</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Data Pipeline View */}
          <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
            <DataPipelineView
              nodes={flowData.nodes}
              onNodeClick={handleNodeClick}
              currentTimeMs={currentTimeMs}
              activeNodeIds={activeNodeIds}
              completedNodeIds={completedNodeIds}
              totalDurationMs={totalDurationMs}
              events={events}
              onJumpToStep={jumpToStep}
              flowDebug={flowData._debug}
              searchMatchingNodeIds={searchMatchingNodeIds}
              focusedSearchNodeId={currentSearchMatchNodeId}
            />
          </div>

          {/* Detail Sidebar */}
          {selectedNode && (
            <NodeDetailSidebar
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              langfuseHost={langfuseHost}
              traceId={traceId}
            />
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </div>
  );
}

export default FlowViewPopout;
