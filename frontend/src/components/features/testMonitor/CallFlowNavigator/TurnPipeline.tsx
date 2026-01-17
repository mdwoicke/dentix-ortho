/**
 * TurnPipeline Component
 * Renders one complete turn as a vertical data pipeline
 * User input at top → Layers → Assistant response at bottom
 */

import React from 'react';
import { cn } from '../../../../utils/cn';
import type { FlowNode, PipelineTurn } from './types';
import { formatDuration } from './flowTransformers';
import { PipelineNode } from './PipelineNode';
import { DataFlowArrow } from './DataFlowArrow';
import { LayerSection } from './LayerSection';
import { ErrorInline } from './ErrorInline';

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
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format assistant response content for pretty display
 * Handles line breaks, lists, and basic formatting
 */
function formatAssistantContent(content: string): React.ReactNode {
  if (!content) return null;

  // Split by double newlines for paragraphs, single newlines for line breaks
  const paragraphs = content.split(/\n\n+/);

  return paragraphs.map((paragraph, pIdx) => {
    // Check if this paragraph is a list (starts with - or *)
    const lines = paragraph.split('\n');
    const isList = lines.every(line => /^[\s]*[-*•]\s/.test(line) || line.trim() === '');

    if (isList) {
      const listItems = lines
        .filter(line => line.trim())
        .map((line, lIdx) => (
          <li key={lIdx} className="ml-4 pl-1">
            {line.replace(/^[\s]*[-*•]\s*/, '')}
          </li>
        ));
      return (
        <ul key={pIdx} className="list-disc list-outside my-2 space-y-1">
          {listItems}
        </ul>
      );
    }

    // Check if this paragraph is a numbered list
    const isNumberedList = lines.every(line => /^[\s]*\d+[.)]\s/.test(line) || line.trim() === '');

    if (isNumberedList) {
      const listItems = lines
        .filter(line => line.trim())
        .map((line, lIdx) => (
          <li key={lIdx} className="ml-4 pl-1">
            {line.replace(/^[\s]*\d+[.)]\s*/, '')}
          </li>
        ));
      return (
        <ol key={pIdx} className="list-decimal list-outside my-2 space-y-1">
          {listItems}
        </ol>
      );
    }

    // Regular paragraph - preserve line breaks within
    return (
      <p key={pIdx} className={pIdx > 0 ? 'mt-3' : ''}>
        {lines.map((line, lIdx) => (
          <span key={lIdx}>
            {lIdx > 0 && <br />}
            {formatInlineText(line)}
          </span>
        ))}
      </p>
    );
  });
}

/**
 * Format inline text - highlight dates, times, names, etc.
 */
function formatInlineText(text: string): React.ReactNode {
  // Patterns to highlight - using high contrast colors for dark mode
  const patterns = [
    // Dates like "January 15th", "01/15/2026", "2026-01-15"
    { regex: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g, className: 'font-semibold text-blue-700 dark:text-blue-300' },
    { regex: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi, className: 'font-semibold text-blue-700 dark:text-blue-300' },
    // Times like "9:00 AM", "14:30"
    { regex: /\b\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\b/g, className: 'font-semibold text-violet-700 dark:text-violet-300' },
    // Names in quotes
    { regex: /"([^"]+)"/g, className: 'font-semibold text-emerald-700 dark:text-emerald-300', wrap: true },
  ];

  let result: React.ReactNode[] = [text];
  let keyCounter = 0;

  patterns.forEach(({ regex, className, wrap }) => {
    const newResult: React.ReactNode[] = [];
    result.forEach((part) => {
      if (typeof part !== 'string') {
        newResult.push(part);
        return;
      }

      const matches = part.split(regex);
      const allMatches = part.match(regex) || [];
      let matchIdx = 0;

      matches.forEach((segment, idx) => {
        if (segment) {
          newResult.push(segment);
        }
        if (idx < matches.length - 1 && allMatches[matchIdx]) {
          const matchText = wrap ? allMatches[matchIdx] : allMatches[matchIdx];
          newResult.push(
            <span key={`hl-${keyCounter++}`} className={className}>
              {matchText}
            </span>
          );
          matchIdx++;
        }
      });
    });
    result = newResult;
  });

  return result;
}

// ============================================================================
// TYPES
// ============================================================================

interface TurnPipelineProps {
  turn: PipelineTurn;
  activeNodeIds: Set<string>;
  completedNodeIds: Set<string>;
  onNodeClick: (node: FlowNode) => void;
  showFullIO?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TurnPipeline({
  turn,
  activeNodeIds,
  completedNodeIds,
  onNodeClick,
  showFullIO = true,
}: TurnPipelineProps) {
  const hasFlowise = turn.layerNodes.flowise.length > 0;
  const hasTools = turn.layerNodes.tools.length > 0;
  const hasNodeRed = turn.layerNodes.nodeRed.length > 0;
  const hasCloud9 = turn.layerNodes.cloud9.length > 0;
  const hasSystemProcessing = hasFlowise || hasTools || hasNodeRed || hasCloud9;

  // Check if any node in this turn is active
  const isTurnActive =
    (turn.userInput && activeNodeIds.has(turn.userInput.id)) ||
    (turn.assistantResponse && activeNodeIds.has(turn.assistantResponse.id)) ||
    turn.layerNodes.flowise.some(n => activeNodeIds.has(n.id)) ||
    turn.layerNodes.tools.some(n => activeNodeIds.has(n.id)) ||
    turn.layerNodes.nodeRed.some(n => activeNodeIds.has(n.id)) ||
    turn.layerNodes.cloud9.some(n => activeNodeIds.has(n.id));

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 overflow-hidden transition-all duration-300',
        // Error state
        turn.hasError && [
          'border-red-300 dark:border-red-700',
          'bg-red-50/30 dark:bg-red-950/20',
        ],
        // Active state
        !turn.hasError && isTurnActive && [
          'border-blue-300 dark:border-blue-700',
          'bg-blue-50/30 dark:bg-blue-950/20',
          'shadow-xl shadow-blue-500/10',
        ],
        // Normal state
        !turn.hasError && !isTurnActive && [
          'border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-900',
        ],
      )}
      data-turn={turn.id}
    >
      {/* Turn Header */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2 border-b',
        turn.hasError && 'border-red-200 dark:border-red-800 bg-red-100/50 dark:bg-red-900/30',
        !turn.hasError && isTurnActive && 'border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30',
        !turn.hasError && !isTurnActive && 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50',
      )}>
        <div className="flex items-center gap-2">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-bold',
            turn.hasError && 'bg-red-200 dark:bg-red-800/50 text-red-700 dark:text-red-300',
            !turn.hasError && isTurnActive && 'bg-blue-200 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300',
            !turn.hasError && !isTurnActive && 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
          )}>
            TURN {turn.turnIndex + 1}
          </span>
          {isTurnActive && (
            <span className="px-2 py-0.5 bg-green-200 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full text-[10px] font-bold animate-pulse">
              ACTIVE
            </span>
          )}
        </div>
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
          +{formatDuration(turn.startMs)} - +{formatDuration(turn.endMs)}
        </span>
      </div>

      {/* Turn Content - Vertical Pipeline */}
      <div className="p-4 space-y-2">
        {/* USER INPUT */}
        {turn.userInput && (
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center">
                <Icons.User />
              </div>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                User Input
              </span>
            </div>
            <div className={cn(
              'ml-9 p-3 rounded-xl rounded-tl-sm',
              'bg-gradient-to-br from-blue-500 to-blue-600 text-white',
              activeNodeIds.has(turn.userInput.id) && 'ring-2 ring-offset-2 ring-blue-400 dark:ring-offset-gray-900',
            )}>
              <p className="text-sm">
                {turn.userInput.data.content || turn.userInput.label}
              </p>
              <span className="text-[10px] opacity-70 mt-1 block">
                {formatDuration(turn.userInput.durationMs)}
              </span>
            </div>
          </div>
        )}

        {/* Data flow arrow (if there's system processing) */}
        {turn.userInput && hasSystemProcessing && (
          <DataFlowArrow
            direction="down"
            isActive={isTurnActive}
            label="processing"
          />
        )}

        {/* No system processing indicator */}
        {turn.userInput && !hasSystemProcessing && turn.assistantResponse && (
          <div className="flex items-center justify-center py-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs">No observation data for this turn</span>
            </div>
          </div>
        )}

        {/* LAYER 4: FLOWISE (LLM) */}
        {hasFlowise && (
          <LayerSection
            layer="layer4_flowise"
            isActive={turn.layerNodes.flowise.some(n => activeNodeIds.has(n.id))}
            hasError={turn.layerNodes.flowise.some(n => n.status === 'error')}
          >
            {turn.layerNodes.flowise.map(node => (
              <PipelineNode
                key={node.id}
                node={node}
                isActive={activeNodeIds.has(node.id)}
                isCompleted={completedNodeIds.has(node.id)}
                onClick={() => onNodeClick(node)}
                showIO={showFullIO}
              />
            ))}
          </LayerSection>
        )}

        {/* Arrow between Flowise and Tools */}
        {hasFlowise && hasTools && (
          <DataFlowArrow
            direction="down"
            isActive={turn.layerNodes.tools.some(n => activeNodeIds.has(n.id))}
          />
        )}

        {/* LAYER 3: TOOLS */}
        {hasTools && (
          <LayerSection
            layer="layer3_tools"
            isActive={turn.layerNodes.tools.some(n => activeNodeIds.has(n.id))}
            hasError={turn.layerNodes.tools.some(n => n.status === 'error')}
          >
            {turn.layerNodes.tools.map(node => (
              <PipelineNode
                key={node.id}
                node={node}
                isActive={activeNodeIds.has(node.id)}
                isCompleted={completedNodeIds.has(node.id)}
                onClick={() => onNodeClick(node)}
                showIO={showFullIO}
              />
            ))}
          </LayerSection>
        )}

        {/* Arrow between Tools and Node-RED */}
        {hasTools && hasNodeRed && (
          <DataFlowArrow
            direction="down"
            isActive={turn.layerNodes.nodeRed.some(n => activeNodeIds.has(n.id))}
          />
        )}

        {/* LAYER 2: NODE-RED */}
        {hasNodeRed && (
          <LayerSection
            layer="layer2_nodered"
            isActive={turn.layerNodes.nodeRed.some(n => activeNodeIds.has(n.id))}
            hasError={turn.layerNodes.nodeRed.some(n => n.status === 'error')}
          >
            {turn.layerNodes.nodeRed.map(node => (
              <PipelineNode
                key={node.id}
                node={node}
                isActive={activeNodeIds.has(node.id)}
                isCompleted={completedNodeIds.has(node.id)}
                onClick={() => onNodeClick(node)}
                showIO={showFullIO}
              />
            ))}
          </LayerSection>
        )}

        {/* Arrow between Node-RED and Cloud9 */}
        {hasNodeRed && hasCloud9 && (
          <DataFlowArrow
            direction="down"
            isActive={turn.layerNodes.cloud9.some(n => activeNodeIds.has(n.id))}
          />
        )}

        {/* LAYER 1: CLOUD9 */}
        {hasCloud9 && (
          <LayerSection
            layer="layer1_cloud9"
            isActive={turn.layerNodes.cloud9.some(n => activeNodeIds.has(n.id))}
            hasError={turn.layerNodes.cloud9.some(n => n.status === 'error')}
          >
            {turn.layerNodes.cloud9.map(node => (
              <PipelineNode
                key={node.id}
                node={node}
                isActive={activeNodeIds.has(node.id)}
                isCompleted={completedNodeIds.has(node.id)}
                onClick={() => onNodeClick(node)}
                showIO={showFullIO}
              />
            ))}
          </LayerSection>
        )}

        {/* Error inline banner if there's an error */}
        {turn.hasError && turn.errorNode && (
          <ErrorInline
            errorNode={turn.errorNode}
            onClick={() => onNodeClick(turn.errorNode!)}
            className="my-3"
          />
        )}

        {/* Arrow before assistant response */}
        {hasSystemProcessing && turn.assistantResponse && (
          <DataFlowArrow
            direction="up"
            isActive={activeNodeIds.has(turn.assistantResponse.id)}
            label="response"
          />
        )}

        {/* ASSISTANT RESPONSE */}
        {turn.assistantResponse && (
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 text-white flex items-center justify-center">
                <Icons.Bot />
              </div>
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                Assistant Response
              </span>
            </div>
            <div className={cn(
              'ml-9 p-4 rounded-xl rounded-tr-sm',
              'bg-white dark:bg-gray-900',
              'border border-gray-200 dark:border-gray-600',
              'shadow-sm',
              activeNodeIds.has(turn.assistantResponse.id) && 'ring-2 ring-offset-2 ring-teal-400 dark:ring-offset-gray-900',
            )}>
              {/* Formatted response content */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                  {formatAssistantContent(turn.assistantResponse.data.content || turn.assistantResponse.label || '')}
                </div>
              </div>
              <span className="text-[10px] text-gray-400 mt-1 block">
                {formatDuration(turn.assistantResponse.durationMs)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TurnPipeline;
