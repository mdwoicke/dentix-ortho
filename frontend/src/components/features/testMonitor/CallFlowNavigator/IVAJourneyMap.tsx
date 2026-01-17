/**
 * IVAJourneyMap Component
 * Interactive Voice Assistant Customer Journey Visualization
 *
 * Displays the call flow as a professional customer journey map with:
 * - Horizontal timeline progression
 * - Swim lanes for User, Agent, and System
 * - Journey stages (Connect, Understand, Process, Resolve)
 * - Artifact tracking (appointments, patient data, etc.)
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { cn } from '../../../../utils/cn';
import type { FlowNode, FlowLayer } from './types';
import { LAYER_CONFIG } from './types';
import { formatDuration } from './flowTransformers';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  User: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Bot: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Cpu: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  Tool: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Server: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  XCircle: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
  Flame: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
    </svg>
  ),
  Calendar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  UserSearch: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  ArrowRight: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface TimelineEvent {
  nodeId: string;
  timeMs: number;
  type: string;
}

interface IVAJourneyMapProps {
  nodes: FlowNode[];
  onNodeClick: (node: FlowNode) => void;
  currentTimeMs: number;
  activeNodeIds: Set<string>;
  completedNodeIds: Set<string>;
  totalDurationMs: number;
  // For stage navigation
  events?: TimelineEvent[];
  onJumpToStep?: (stepIndex: number) => void;
}

type JourneyStage = 'connect' | 'understand' | 'process' | 'resolve';

interface JourneyTurn {
  id: string;
  stage: JourneyStage;
  userNode?: FlowNode;
  agentNode?: FlowNode;
  systemNodes: FlowNode[];
  artifacts: string[];
  startMs: number;
  endMs: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function getStageInfo(stage: JourneyStage) {
  const stages = {
    connect: {
      label: 'Connect',
      icon: '1',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-500/10',
      textColor: 'text-blue-600 dark:text-blue-400',
      description: 'Initial contact',
    },
    understand: {
      label: 'Understand',
      icon: '2',
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-500/10',
      textColor: 'text-purple-600 dark:text-purple-400',
      description: 'Gather requirements',
    },
    process: {
      label: 'Process',
      icon: '3',
      color: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-500/10',
      textColor: 'text-amber-600 dark:text-amber-400',
      description: 'Execute actions',
    },
    resolve: {
      label: 'Resolve',
      icon: '4',
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-500/10',
      textColor: 'text-green-600 dark:text-green-400',
      description: 'Complete & confirm',
    },
  };
  return stages[stage];
}

function detectArtifacts(nodes: FlowNode[]): string[] {
  const artifacts: string[] = [];
  nodes.forEach(node => {
    const label = node.label.toLowerCase();
    const output = JSON.stringify(node.data.output || {}).toLowerCase();

    if (label.includes('patient') || label.includes('getrecords')) {
      artifacts.push('Patient Data');
    }
    if (label.includes('schedule') || label.includes('appointment') || label.includes('appt')) {
      if (output.includes('success') || output.includes('scheduled') || output.includes('booked')) {
        artifacts.push('Appointment Booked');
      } else {
        artifacts.push('Availability Checked');
      }
    }
    if (label.includes('location') || label.includes('provider')) {
      artifacts.push('Provider Info');
    }
  });
  return [...new Set(artifacts)];
}

function determineStage(turnIndex: number, totalTurns: number, hasToolCalls: boolean): JourneyStage {
  const progress = turnIndex / Math.max(totalTurns - 1, 1);

  if (turnIndex === 0) return 'connect';
  if (progress < 0.33) return 'understand';
  if (progress < 0.75 || hasToolCalls) return 'process';
  return 'resolve';
}

// ============================================================================
// JOURNEY CARD COMPONENTS
// ============================================================================

interface UserMessageCardProps {
  node: FlowNode;
  onClick: () => void;
  isActive: boolean;
  isCompleted: boolean;
}

function UserMessageCard({ node, onClick, isActive, isCompleted }: UserMessageCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative max-w-[320px] cursor-pointer transition-all duration-500 ease-out',
        'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-bl-sm',
        'hover:shadow-xl hover:shadow-blue-500/30',
        // Active state - smooth glow and scale (no constant pulse)
        isActive && [
          'ring-4 ring-blue-300 ring-offset-4 dark:ring-offset-gray-900',
          'shadow-2xl shadow-blue-500/50',
          'scale-105 z-10',
        ],
        // Completed state
        isCompleted && !isActive && 'shadow-lg shadow-blue-500/20',
        // Pending state
        !isCompleted && !isActive && 'opacity-40 scale-95 grayscale-[30%]',
      )}
    >
      <div className="relative p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300',
            isActive ? 'bg-white/30' : 'bg-white/20'
          )}>
            <Icons.User />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Caller</span>
          {isActive && (
            <span className="px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold">
              ACTIVE
            </span>
          )}
          <span className="ml-auto text-xs opacity-70">{formatDuration(node.durationMs)}</span>
        </div>
        <p className="text-sm leading-relaxed">
          {node.data.content || node.label}
        </p>
      </div>
    </div>
  );
}

interface AgentMessageCardProps {
  node: FlowNode;
  onClick: () => void;
  isActive: boolean;
  isCompleted: boolean;
}

function AgentMessageCard({ node, onClick, isActive, isCompleted }: AgentMessageCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative max-w-[360px] cursor-pointer transition-all duration-500 ease-out',
        'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
        'rounded-2xl rounded-br-sm',
        'hover:shadow-xl',
        // Active state - smooth glow and scale (no constant pulse)
        isActive && [
          'ring-4 ring-teal-400 ring-offset-4 dark:ring-offset-gray-900',
          'shadow-2xl shadow-teal-500/30',
          'scale-105 z-10',
          'border-teal-400'
        ],
        // Completed state
        isCompleted && !isActive && 'shadow-lg',
        // Pending state
        !isCompleted && !isActive && 'opacity-40 scale-95 grayscale-[30%]',
      )}
    >
      <div className="relative p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 text-white flex items-center justify-center">
            <Icons.Bot />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
            IVA Agent
          </span>
          {isActive && (
            <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full text-xs font-bold">
              RESPONDING
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400">{formatDuration(node.durationMs)}</span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {node.data.content || node.label}
        </p>
      </div>
    </div>
  );
}

interface SystemActionCardProps {
  nodes: FlowNode[];
  artifacts: string[];
  onClick: (node: FlowNode) => void;
  isActive: boolean;
  isCompleted: boolean;
}

function SystemActionCard({ nodes, artifacts, onClick, isActive, isCompleted }: SystemActionCardProps) {
  if (nodes.length === 0) return null;

  const hasError = nodes.some(n => n.status === 'error');
  const hasBottleneck = nodes.some(n => n.status === 'bottleneck');
  const totalDuration = nodes.reduce((sum, n) => sum + n.durationMs, 0);
  const activeNode = nodes.find(n => isActive);

  return (
    <div className={cn(
      'w-full max-w-[500px] transition-all duration-300',
      // Active state - dramatic glow and scale
      isActive && 'scale-[1.02] z-10',
      // Pending state
      !isCompleted && !isActive && 'opacity-40 scale-95 grayscale-[30%]',
    )}>
      {/* System Pipeline */}
      <div className={cn(
        'rounded-xl border-2 overflow-hidden',
        hasError ? 'border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-900/10' :
        hasBottleneck ? 'border-orange-400 dark:border-orange-600 bg-orange-50/50 dark:bg-orange-900/10' :
        isActive ? 'border-purple-400 dark:border-purple-500 bg-purple-50/50 dark:bg-purple-900/10' :
        'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
        isActive && 'shadow-2xl shadow-purple-500/30'
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 border-b transition-colors duration-300',
          isActive ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-400' :
          hasError ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800' :
          hasBottleneck ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800' :
          'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        )}>
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-300',
            isActive ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          )}>
            <Icons.Cpu />
          </div>
          <div className="flex-1">
            <span className={cn(
              'text-sm font-bold uppercase tracking-wide',
              isActive ? 'text-white' : 'text-gray-700 dark:text-gray-300'
            )}>
              System Processing
            </span>
            {isActive && (
              <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">
                EXECUTING
              </span>
            )}
          </div>
          <span className={cn(
            'text-xs font-mono',
            isActive ? 'text-white/80' : 'text-gray-400'
          )}>
            {nodes.length} steps | {formatDuration(totalDuration)}
          </span>
        </div>

        {/* Data Flow Pipeline */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2">
            {nodes.slice(0, 6).map((node, idx) => {
              const nodeIsActive = isActive && node.startMs <= (activeNode?.startMs || 0);
              return (
                <div key={node.id} className="flex items-center">
                  <div
                    onClick={() => onClick(node)}
                    className={cn(
                      'flex-shrink-0 cursor-pointer transition-all duration-200',
                      'px-3 py-2 rounded-lg border',
                      nodeIsActive && [
                        'ring-2 ring-offset-1 scale-105',
                        node.layer === 'layer4_flowise' && 'ring-blue-500 bg-blue-100 dark:bg-blue-900/50 border-blue-400',
                        node.layer === 'layer3_tools' && 'ring-amber-500 bg-amber-100 dark:bg-amber-900/50 border-amber-400',
                        node.layer === 'layer2_nodered' && 'ring-purple-500 bg-purple-100 dark:bg-purple-900/50 border-purple-400',
                        node.layer === 'layer1_cloud9' && 'ring-green-500 bg-green-100 dark:bg-green-900/50 border-green-400',
                      ],
                      !nodeIsActive && [
                        'hover:scale-105',
                        node.layer === 'layer4_flowise' && 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700',
                        node.layer === 'layer3_tools' && 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',
                        node.layer === 'layer2_nodered' && 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700',
                        node.layer === 'layer1_cloud9' && 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',
                      ],
                      node.status === 'error' && 'bg-red-100 dark:bg-red-900/50 border-red-400',
                      node.status === 'bottleneck' && 'bg-orange-100 dark:bg-orange-900/50 border-orange-400',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-[10px] font-bold uppercase',
                        node.layer === 'layer4_flowise' && 'text-blue-600 dark:text-blue-400',
                        node.layer === 'layer3_tools' && 'text-amber-600 dark:text-amber-400',
                        node.layer === 'layer2_nodered' && 'text-purple-600 dark:text-purple-400',
                        node.layer === 'layer1_cloud9' && 'text-green-600 dark:text-green-400',
                      )}>
                        {LAYER_CONFIG[node.layer].shortLabel}
                      </span>
                      {node.status === 'error' && <Icons.XCircle />}
                      {node.status === 'bottleneck' && <Icons.Flame />}
                    </div>
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">
                      {node.label}
                    </div>
                    <div className={cn(
                      'text-[10px] font-mono',
                      node.status === 'bottleneck' ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-gray-400'
                    )}>
                      {formatDuration(node.durationMs)}
                    </div>
                  </div>
                  {idx < Math.min(nodes.length - 1, 5) && (
                    <div className={cn(
                      'mx-1 transition-colors duration-300',
                      nodeIsActive ? 'text-purple-500' : 'text-gray-300 dark:text-gray-600'
                    )}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
            {nodes.length > 6 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 px-2">
                +{nodes.length - 6} more
              </span>
            )}
          </div>
        </div>

        {/* Artifacts / Data Output */}
        {artifacts.length > 0 && (
          <div className={cn(
            'px-4 py-3 border-t',
            isActive ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-300 dark:border-green-700' :
            'bg-gray-100/50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700'
          )}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                'text-[10px] uppercase font-bold',
                isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
              )}>
                📦 Output:
              </span>
              {artifacts.map((artifact, idx) => (
                <span
                  key={idx}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all',
                    artifact.includes('Booked') && 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
                    artifact.includes('Patient') && 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
                    artifact.includes('Provider') && 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
                    artifact.includes('Availability') && 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
                    !artifact.includes('Booked') && !artifact.includes('Patient') && !artifact.includes('Provider') && !artifact.includes('Availability') && 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
                    isActive && 'scale-105 ring-2 ring-offset-1 ring-green-400'
                  )}
                >
                  {artifact.includes('Booked') && '✅'}
                  {artifact.includes('Patient') && '👤'}
                  {artifact.includes('Provider') && '🏥'}
                  {artifact.includes('Availability') && '📅'}
                  {artifact}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function IVAJourneyMap({
  nodes,
  onNodeClick,
  currentTimeMs,
  activeNodeIds,
  completedNodeIds,
  totalDurationMs,
  events = [],
  onJumpToStep,
}: IVAJourneyMapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group nodes into conversation turns
  const journeyTurns = useMemo(() => {
    const turns: JourneyTurn[] = [];
    const sortedNodes = [...nodes].sort((a, b) => a.startMs - b.startMs);

    // Find conversation nodes (user/assistant)
    const conversationNodes = sortedNodes.filter(
      n => n.type === 'user_input' || n.type === 'assistant_response'
    );
    const systemNodes = sortedNodes.filter(
      n => n.type !== 'user_input' && n.type !== 'assistant_response'
    );

    // Pair user messages with agent responses
    let currentUserNode: FlowNode | undefined;
    let currentSystemNodes: FlowNode[] = [];
    let turnIndex = 0;

    conversationNodes.forEach((node, idx) => {
      if (node.type === 'user_input') {
        // Start new turn
        if (currentUserNode) {
          // Save previous turn
          const nextNodeStart = node.startMs;
          const turnSystemNodes = systemNodes.filter(
            s => s.startMs >= currentUserNode!.startMs && s.startMs < nextNodeStart
          );
          turns.push({
            id: `turn-${turnIndex}`,
            stage: determineStage(turnIndex, conversationNodes.length / 2, turnSystemNodes.length > 0),
            userNode: currentUserNode,
            agentNode: undefined,
            systemNodes: turnSystemNodes,
            artifacts: detectArtifacts(turnSystemNodes),
            startMs: currentUserNode.startMs,
            endMs: nextNodeStart,
          });
          turnIndex++;
        }
        currentUserNode = node;
        currentSystemNodes = [];
      } else if (node.type === 'assistant_response' && currentUserNode) {
        // Complete the turn
        const nextNodeStart = conversationNodes[idx + 1]?.startMs ?? totalDurationMs;
        const turnSystemNodes = systemNodes.filter(
          s => s.startMs >= currentUserNode!.startMs && s.startMs < nextNodeStart
        );
        turns.push({
          id: `turn-${turnIndex}`,
          stage: determineStage(turnIndex, conversationNodes.length / 2, turnSystemNodes.length > 0),
          userNode: currentUserNode,
          agentNode: node,
          systemNodes: turnSystemNodes,
          artifacts: detectArtifacts(turnSystemNodes),
          startMs: currentUserNode.startMs,
          endMs: node.startMs + node.durationMs,
        });
        turnIndex++;
        currentUserNode = undefined;
      }
    });

    // Handle any remaining user node
    if (currentUserNode) {
      const turnSystemNodes = systemNodes.filter(
        s => s.startMs >= currentUserNode!.startMs
      );
      turns.push({
        id: `turn-${turnIndex}`,
        stage: determineStage(turnIndex, conversationNodes.length / 2, turnSystemNodes.length > 0),
        userNode: currentUserNode,
        systemNodes: turnSystemNodes,
        artifacts: detectArtifacts(turnSystemNodes),
        startMs: currentUserNode.startMs,
        endMs: totalDurationMs,
      });
    }

    return turns;
  }, [nodes, totalDurationMs]);

  // Auto-scroll to active turn
  useEffect(() => {
    const activeTurn = journeyTurns.find(t =>
      (t.userNode && activeNodeIds.has(t.userNode.id)) ||
      (t.agentNode && activeNodeIds.has(t.agentNode.id)) ||
      t.systemNodes.some(n => activeNodeIds.has(n.id))
    );
    if (activeTurn && scrollRef.current) {
      const turnElement = scrollRef.current.querySelector(`[data-turn="${activeTurn.id}"]`);
      turnElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeNodeIds, journeyTurns]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Icons.Bot />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          No Journey Data
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          This trace doesn't have conversation data to visualize.
        </p>
      </div>
    );
  }

  // Group turns by stage
  const stageGroups = useMemo(() => {
    const groups: Record<JourneyStage, JourneyTurn[]> = {
      connect: [],
      understand: [],
      process: [],
      resolve: [],
    };
    journeyTurns.forEach(turn => {
      groups[turn.stage].push(turn);
    });
    return groups;
  }, [journeyTurns]);

  // Calculate which step index corresponds to the start of each stage
  const stageFirstStepIndex = useMemo(() => {
    const stageSteps: Record<JourneyStage, number> = {
      connect: 0,
      understand: 0,
      process: 0,
      resolve: 0,
    };

    // For each stage, find the first turn and then find its corresponding event index
    const stages: JourneyStage[] = ['connect', 'understand', 'process', 'resolve'];

    stages.forEach(stage => {
      const firstTurn = stageGroups[stage][0];
      if (firstTurn) {
        // Find the first node in this turn
        const firstNode = firstTurn.userNode || firstTurn.systemNodes[0] || firstTurn.agentNode;
        if (firstNode) {
          // Find the event index for this node
          const eventIndex = events.findIndex(e => e.nodeId === firstNode.id);
          if (eventIndex >= 0) {
            stageSteps[stage] = eventIndex;
          }
        }
      }
    });

    return stageSteps;
  }, [stageGroups, events]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      {/* Stage Header Navigation - Clickable to jump to stage */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          {(['connect', 'understand', 'process', 'resolve'] as JourneyStage[]).map((stage, idx) => {
            const stageInfo = getStageInfo(stage);
            const hasContent = stageGroups[stage].length > 0;
            const isActive = stageGroups[stage].some(t =>
              (t.userNode && activeNodeIds.has(t.userNode.id)) ||
              (t.agentNode && activeNodeIds.has(t.agentNode.id))
            );

            // Handler to scroll to stage
            const handleStageClick = () => {
              if (hasContent && scrollRef.current) {
                const stageElement = scrollRef.current.querySelector(`[data-stage="${stage}"]`);
                stageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            };

            return (
              <div key={stage} className="flex items-center">
                <button
                  onClick={handleStageClick}
                  disabled={!hasContent}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 rounded-xl transition-all',
                    hasContent ? stageInfo.bgColor : 'bg-gray-100 dark:bg-gray-800',
                    hasContent && 'cursor-pointer hover:scale-105 hover:shadow-lg',
                    !hasContent && 'cursor-not-allowed opacity-60',
                    isActive && 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900',
                    isActive && stage === 'connect' && 'ring-blue-500',
                    isActive && stage === 'understand' && 'ring-purple-500',
                    isActive && stage === 'process' && 'ring-amber-500',
                    isActive && stage === 'resolve' && 'ring-green-500',
                  )}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white',
                    hasContent ? `bg-gradient-to-br ${stageInfo.color}` : 'bg-gray-300 dark:bg-gray-600'
                  )}>
                    {stageInfo.icon}
                  </div>
                  <div className="text-left">
                    <div className={cn(
                      'text-sm font-semibold',
                      hasContent ? stageInfo.textColor : 'text-gray-400 dark:text-gray-500'
                    )}>
                      {stageInfo.label}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      {stageInfo.description}
                    </div>
                  </div>
                  {hasContent && (
                    <div className={cn(
                      'ml-2 px-2 py-0.5 rounded-full text-xs font-medium',
                      stageInfo.bgColor, stageInfo.textColor
                    )}>
                      {stageGroups[stage].length}
                    </div>
                  )}
                </button>
                {idx < 3 && (() => {
                  const nextStages: JourneyStage[] = ['understand', 'process', 'resolve', 'resolve'];
                  const nextStage = nextStages[idx];
                  const nextStageHasContent = stageGroups[nextStage].length > 0;

                  return (
                    <button
                      onClick={() => {
                        if (onJumpToStep && nextStageHasContent) {
                          onJumpToStep(stageFirstStepIndex[nextStage]);
                          // Also scroll to the stage
                          const stageElement = scrollRef.current?.querySelector(`[data-stage="${nextStage}"]`);
                          stageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      disabled={!nextStageHasContent || !onJumpToStep}
                      className={cn(
                        'mx-2 p-1 rounded-full transition-all',
                        nextStageHasContent && onJumpToStep
                          ? 'text-gray-400 hover:text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:scale-125 cursor-pointer'
                          : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      )}
                      title={nextStageHasContent ? `Jump to ${nextStage}` : 'No content in next stage'}
                    >
                      <Icons.ArrowRight />
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Journey Timeline */}
      <div className="p-6 space-y-8">
        {journeyTurns.map((turn, idx) => {
          const stageInfo = getStageInfo(turn.stage);
          const isUserActive = turn.userNode && activeNodeIds.has(turn.userNode.id);
          const isAgentActive = turn.agentNode && activeNodeIds.has(turn.agentNode.id);
          const isSystemActive = turn.systemNodes.some(n => activeNodeIds.has(n.id));
          const isUserCompleted = turn.userNode && (completedNodeIds.has(turn.userNode.id) || turn.userNode.startMs + turn.userNode.durationMs <= currentTimeMs);
          const isAgentCompleted = turn.agentNode && (completedNodeIds.has(turn.agentNode.id) || turn.agentNode.startMs + turn.agentNode.durationMs <= currentTimeMs);
          const isSystemCompleted = turn.systemNodes.every(n => completedNodeIds.has(n.id) || n.startMs + n.durationMs <= currentTimeMs);

          // Error and bottleneck detection for this turn
          const hasError = turn.systemNodes.some(n => n.status === 'error');
          const hasBottleneck = turn.systemNodes.some(n => n.status === 'bottleneck');
          const errorNode = turn.systemNodes.find(n => n.status === 'error');

          const showStageHeader = idx === 0 || journeyTurns[idx - 1].stage !== turn.stage;

          return (
            <div key={turn.id} data-turn={turn.id}>
              {/* Stage transition header - with data-stage for navigation */}
              {showStageHeader && (
                <div data-stage={turn.stage} className="flex items-center gap-3 mb-6 scroll-mt-20">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold',
                    `bg-gradient-to-br ${stageInfo.color}`
                  )}>
                    {stageInfo.icon}
                  </div>
                  <div>
                    <div className={cn('text-lg font-bold', stageInfo.textColor)}>
                      {stageInfo.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {stageInfo.description}
                    </div>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent ml-4" />
                </div>
              )}

              {/* Turn content - with error highlighting */}
              <div className={cn(
                'relative pl-8 pb-8 transition-all duration-300',
                // Error state - red border and background
                hasError && [
                  'ml-[-12px] pl-12 pr-4 py-4 -mt-2 -mb-2',
                  'bg-red-50/80 dark:bg-red-900/20',
                  'border-l-4 border-red-500',
                  'rounded-r-xl',
                  'shadow-lg shadow-red-500/20'
                ],
                // Bottleneck state - orange highlight
                !hasError && hasBottleneck && [
                  'ml-[-12px] pl-12 pr-4 py-4 -mt-2 -mb-2',
                  'bg-orange-50/50 dark:bg-orange-900/10',
                  'border-l-4 border-orange-500',
                  'rounded-r-xl'
                ]
              )}>
                {/* Error Banner */}
                {hasError && (
                  <div className="mb-4 flex items-center gap-3 p-3 bg-red-100 dark:bg-red-900/40 border-2 border-red-400 dark:border-red-600 rounded-lg shadow-lg shadow-red-500/20">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white">
                      <Icons.XCircle />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-red-700 dark:text-red-300">
                        ⚠️ ERROR OCCURRED
                      </div>
                      <div className="text-xs text-red-600 dark:text-red-400">
                        {errorNode?.label}: {errorNode?.data.statusMessage || 'An error occurred during processing'}
                      </div>
                    </div>
                    <button
                      onClick={() => errorNode && onNodeClick(errorNode)}
                      className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                )}

                {/* Bottleneck Warning */}
                {!hasError && hasBottleneck && (
                  <div className="mb-4 flex items-center gap-3 p-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white">
                      <Icons.Flame />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-orange-700 dark:text-orange-300">
                        🐢 Performance Bottleneck Detected
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline line */}
                <div className={cn(
                  'absolute top-3 bottom-0 w-0.5',
                  hasError ? 'left-[11px] bg-red-400 dark:bg-red-600' :
                  hasBottleneck ? 'left-[11px] bg-orange-400 dark:bg-orange-600' :
                  'left-3',
                  idx < journeyTurns.length - 1 ? (
                    hasError ? 'opacity-100' :
                    hasBottleneck ? 'opacity-100' :
                    `bg-gradient-to-b ${stageInfo.color} opacity-30`
                  ) : 'bg-transparent'
                )} />

                {/* Timeline dot - RED for errors, ORANGE for bottlenecks */}
                <div className={cn(
                  'absolute top-3 w-6 h-6 rounded-full border-2 bg-white dark:bg-gray-900',
                  hasError ? [
                    'left-[-1px] border-red-500 ring-4 ring-red-500/30 animate-pulse',
                    'shadow-lg shadow-red-500/50'
                  ] :
                  hasBottleneck ? [
                    'left-[-1px] border-orange-500 ring-2 ring-orange-500/30'
                  ] : [
                    'left-0',
                    `border-current ${stageInfo.textColor}`,
                    (isUserActive || isAgentActive || isSystemActive) && 'animate-pulse'
                  ]
                )}>
                  <div className={cn(
                    'w-full h-full rounded-full flex items-center justify-center',
                    hasError && 'bg-red-500 text-white',
                    !hasError && hasBottleneck && 'bg-orange-500 text-white',
                    !hasError && !hasBottleneck && (isUserCompleted || isAgentCompleted) && `bg-gradient-to-br ${stageInfo.color}`
                  )}>
                    {hasError && <Icons.XCircle />}
                    {!hasError && hasBottleneck && <Icons.Flame />}
                  </div>
                </div>

                {/* Conversation flow */}
                <div className="space-y-4">
                  {/* User message */}
                  {turn.userNode && (
                    <div className="flex justify-start">
                      <UserMessageCard
                        node={turn.userNode}
                        onClick={() => onNodeClick(turn.userNode!)}
                        isActive={isUserActive || false}
                        isCompleted={isUserCompleted || false}
                      />
                    </div>
                  )}

                  {/* System processing */}
                  {turn.systemNodes.length > 0 && (
                    <div className="flex justify-center py-2">
                      <SystemActionCard
                        nodes={turn.systemNodes}
                        artifacts={turn.artifacts}
                        onClick={onNodeClick}
                        isActive={isSystemActive}
                        isCompleted={isSystemCompleted}
                      />
                    </div>
                  )}

                  {/* Agent response */}
                  {turn.agentNode && (
                    <div className="flex justify-end">
                      <AgentMessageCard
                        node={turn.agentNode}
                        onClick={() => onNodeClick(turn.agentNode!)}
                        isActive={isAgentActive || false}
                        isCompleted={isAgentCompleted || false}
                      />
                    </div>
                  )}
                </div>

                {/* Turn timestamp */}
                <div className={cn(
                  "mt-2 text-[10px] font-mono",
                  hasError ? 'text-red-500 dark:text-red-400' :
                  hasBottleneck ? 'text-orange-500 dark:text-orange-400' :
                  'text-gray-400 dark:text-gray-500'
                )}>
                  +{formatDuration(turn.startMs)} - +{formatDuration(turn.endMs)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default IVAJourneyMap;
