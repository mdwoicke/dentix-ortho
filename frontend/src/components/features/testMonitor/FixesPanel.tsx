/**
 * FixesPanel Component
 * Displays generated fixes with copy-to-clipboard functionality
 * Includes "Copy Full Prompt" dropdown and fix application flow
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Spinner } from '../../ui';
import type { GeneratedFix, PromptFile } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';
import { FixClassificationBadge } from './FixClassificationBadge';

// Classification filter type (by issue location: who needs to fix it)
export type ClassificationFilter = 'all' | 'bot' | 'both' | 'test-agent';

// Target category filter type (by target file: what type of file is being fixed)
export type TargetCategoryFilter = 'all' | 'prompt' | 'tool' | 'test-agent';

// Classification colors for left border
const classificationBorderColors: Record<string, string> = {
  'bot': 'border-l-4 border-l-purple-500',
  'both': 'border-l-4 border-l-red-500',
  'test-agent': 'border-l-4 border-l-orange-500',
  'unknown': 'border-l-4 border-l-gray-400',
};

// Fix category types for grouping by target file
type FixCategory = 'prompt' | 'tool' | 'test-agent';

/**
 * Categorize a fix by its target file path
 * - prompt: Flowise system prompts (docs/Chord_Cloud9_SystemPrompt*.md)
 * - tool: Flowise tools (docs/chord_dso_*.js)
 * - test-agent: Test agent code (test-agent/src/*)
 */
function getFixCategory(targetFile: string): FixCategory {
  const normalized = targetFile.toLowerCase();
  if (normalized.includes('systemprompt') || normalized.endsWith('.md')) return 'prompt';
  if (normalized.includes('chord_dso') || (normalized.includes('docs/') && normalized.endsWith('.js'))) return 'tool';
  if (normalized.includes('test-agent/')) return 'test-agent';
  return 'prompt'; // Default to prompt for bot-related fixes
}

// Category styling configuration
const categoryConfig: Record<FixCategory, {
  icon: string;
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  headerBg: string;
}> = {
  'prompt': {
    icon: '🟣',
    label: 'Flowise Prompt Fixes',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-800',
    headerBg: 'bg-purple-100 dark:bg-purple-900/40',
  },
  'tool': {
    icon: '🔵',
    label: 'Flowise Tool Fixes',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    headerBg: 'bg-blue-100 dark:bg-blue-900/40',
  },
  'test-agent': {
    icon: '🟠',
    label: 'Test Agent Fixes',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-200 dark:border-orange-800',
    headerBg: 'bg-orange-100 dark:bg-orange-900/40',
  },
};

interface FixesPanelProps {
  fixes: GeneratedFix[];
  loading?: boolean;
  promptFiles?: PromptFile[];
  onUpdateStatus?: (fixId: string, status: 'applied' | 'rejected') => void;
  onApplyFix?: (fixId: string, fileKey: string) => Promise<void>;
  onCopyFullPrompt?: (fileKey: string) => Promise<string | null>;
  onRunDiagnosis?: () => Promise<void>;
  diagnosisRunning?: boolean;
  hasFailedTests?: boolean;
  // Batch selection props
  selectedFixIds?: Set<string>;
  onSelectionChange?: (fixId: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onApplySelectedFixes?: () => Promise<void>;
  applyingBatch?: boolean;
  // Conflict resolution callback
  onResolveConflict?: (resolution: 'first' | 'second' | 'merge' | 'skip', fixIds: string[]) => void;
  // Phase 5: External classification filter control
  classificationFilter?: ClassificationFilter;
  onClassificationFilterChange?: (filter: ClassificationFilter) => void;
  // Target category filter (Flowise Prompt, Flowise Tool, Test Bot)
  targetCategoryFilter?: TargetCategoryFilter;
  onTargetCategoryFilterChange?: (filter: TargetCategoryFilter) => void;
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-700',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-700',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-700',
  low: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700',
};

const typeColors: Record<string, string> = {
  prompt: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
  tool: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
};

const statusColors: Record<string, string> = {
  pending: 'text-yellow-600 dark:text-yellow-400',
  applied: 'text-green-600 dark:text-green-400',
  rejected: 'text-gray-500 dark:text-gray-400',
  verified: 'text-blue-600 dark:text-blue-400',
};

// Conflict detection types
interface ConflictGroup {
  targetFile: string;
  location?: string;
  fixes: GeneratedFix[];
}

/**
 * Detect conflicting fixes (same targetFile and similar location)
 */
function detectConflicts(fixes: GeneratedFix[]): Map<string, ConflictGroup> {
  const conflicts = new Map<string, ConflictGroup>();
  const pendingFixes = fixes.filter(f => f.status === 'pending');

  // Group by targetFile + location
  const groups = new Map<string, GeneratedFix[]>();
  for (const fix of pendingFixes) {
    const locationKey = fix.location?.section || fix.location?.function || 'default';
    const key = `${fix.targetFile}::${locationKey}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(fix);
  }

  // Find groups with conflicts (>1 fix)
  for (const [key, groupFixes] of groups) {
    if (groupFixes.length > 1) {
      const [targetFile, location] = key.split('::');
      conflicts.set(key, {
        targetFile,
        location: location !== 'default' ? location : undefined,
        fixes: groupFixes,
      });
    }
  }

  return conflicts;
}

/**
 * Get conflict warning for a fix
 */
function getConflictWarning(fixId: string, conflicts: Map<string, ConflictGroup>): ConflictGroup | null {
  for (const group of conflicts.values()) {
    if (group.fixes.some(f => f.fixId === fixId)) {
      return group;
    }
  }
  return null;
}

interface ConflictResolutionModalProps {
  conflict: ConflictGroup;
  onResolve: (resolution: 'first' | 'second' | 'merge' | 'skip', fixIds: string[]) => void;
  onCancel: () => void;
}

function ConflictResolutionModal({ conflict, onResolve, onCancel }: ConflictResolutionModalProps) {
  const [selectedResolution, setSelectedResolution] = useState<'first' | 'second' | 'merge' | 'skip'>('first');

  const sortedFixes = [...conflict.fixes].sort((a, b) => b.confidence - a.confidence);
  const fixIds = sortedFixes.map(f => f.fixId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Conflicting Fixes Detected
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {conflict.fixes.length} fixes target the same location: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{conflict.targetFile}</code>
          {conflict.location && <> in <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{conflict.location}</code></>}
        </p>

        {/* Conflict preview */}
        <div className="mt-4 space-y-3">
          {sortedFixes.map((fix, index) => (
            <div
              key={fix.fixId}
              className={cn(
                'p-3 rounded-lg border',
                selectedResolution === 'first' && index === 0 ? 'border-green-500 bg-green-50 dark:bg-green-900/20' :
                selectedResolution === 'second' && index === 1 ? 'border-green-500 bg-green-50 dark:bg-green-900/20' :
                'border-gray-200 dark:border-gray-700'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">
                  Fix #{index + 1} ({Math.round(fix.confidence * 100)}% confidence)
                </span>
                <span className={cn('text-xs px-2 py-0.5 rounded', priorityColors[fix.priority])}>
                  {fix.priority}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {fix.changeDescription}
              </p>
              <pre className="mt-2 p-2 bg-gray-900 text-gray-100 text-xs rounded overflow-x-auto max-h-32">
                <code>{fix.changeCode.slice(0, 200)}...</code>
              </pre>
            </div>
          ))}
        </div>

        {/* Resolution options */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            How would you like to resolve this conflict?
          </h4>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="first"
                checked={selectedResolution === 'first'}
                onChange={() => setSelectedResolution('first')}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <span className="font-medium text-gray-900 dark:text-white">Keep Highest Confidence</span>
                <p className="text-xs text-gray-500">Apply Fix #1 ({Math.round(sortedFixes[0]?.confidence * 100)}% confidence), reject others</p>
              </div>
            </label>
            {sortedFixes.length > 1 && (
              <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value="second"
                  checked={selectedResolution === 'second'}
                  onChange={() => setSelectedResolution('second')}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Keep Second Best</span>
                  <p className="text-xs text-gray-500">Apply Fix #2 ({Math.round(sortedFixes[1]?.confidence * 100)}% confidence), reject others</p>
                </div>
              </label>
            )}
            <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="skip"
                checked={selectedResolution === 'skip'}
                onChange={() => setSelectedResolution('skip')}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <span className="font-medium text-gray-900 dark:text-white">Skip All</span>
                <p className="text-xs text-gray-500">Reject all conflicting fixes and decide later</p>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => onResolve(selectedResolution, fixIds)}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Apply Resolution
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Popout Modal for viewing full fix details
 */
interface FixDetailModalProps {
  fix: GeneratedFix;
  onClose: () => void;
  conflicts: Map<string, ConflictGroup>;
  fixIndex: number;
}

function FixDetailModal({ fix, onClose, conflicts, fixIndex }: FixDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const conflictGroup = getConflictWarning(fix.fixId, conflicts);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fix.changeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              Fix #{fixIndex + 1}
            </span>
            <span className={cn(
              'text-xs font-medium px-2 py-1 rounded-full',
              typeColors[fix.type]
            )}>
              {fix.type}
            </span>
            <span className={cn(
              'text-xs font-medium px-2 py-1 rounded-full border',
              priorityColors[fix.priority]
            )}>
              {fix.priority}
            </span>
            <span className={cn('text-sm font-medium px-2 py-1 rounded-full', statusColors[fix.status])}>
              {fix.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</h4>
            <p className="text-gray-900 dark:text-white">{fix.changeDescription}</p>
          </div>

          {/* Conflict Warning */}
          {conflictGroup && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h5 className="font-semibold text-amber-800 dark:text-amber-200">Conflict Detected</h5>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    This fix conflicts with <strong>{conflictGroup.fixes.length - 1} other fix{conflictGroup.fixes.length > 2 ? 'es' : ''}</strong> targeting the same location:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                    <li><strong>File:</strong> <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-800/50 rounded">{conflictGroup.targetFile}</code></li>
                    {conflictGroup.location && (
                      <li><strong>Section:</strong> <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-800/50 rounded">{conflictGroup.location}</code></li>
                    )}
                  </ul>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                    Conflicting fixes: {conflictGroup.fixes.filter(f => f.fixId !== fix.fixId).map((f, i) => (
                      <span key={f.fixId}>
                        {i > 0 && ', '}
                        <span className="font-medium">{f.changeDescription.slice(0, 40)}...</span>
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Target & Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Target File</h4>
              <code className="text-sm px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded block truncate">
                {fix.targetFile}
              </code>
            </div>
            {fix.location && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Location</h4>
                <div className="text-sm space-y-1">
                  {fix.location.section && (
                    <div><span className="text-gray-500">Section:</span> <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{fix.location.section}</code></div>
                  )}
                  {fix.location.function && (
                    <div><span className="text-gray-500">Function:</span> <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{fix.location.function}</code></div>
                  )}
                  {fix.location.afterLine && (
                    <div><span className="text-gray-500">After:</span> <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{fix.location.afterLine}</code></div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Confidence & Classification */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Confidence</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      fix.confidence >= 0.8 ? 'bg-green-500' :
                      fix.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${Math.round(fix.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {Math.round(fix.confidence * 100)}%
                </span>
              </div>
            </div>
            {fix.classification && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Classification</h4>
                <FixClassificationBadge classification={fix.classification} size="md" showTooltip={true} />
              </div>
            )}
          </div>

          {/* Decision Framework - Phase 4 Enhancement */}
          {fix.classification && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Decision Framework
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(Golden Rule Analysis)</span>
                </h4>
              </div>
              <div className="p-4 space-y-3">
                {/* Question 1: User behavior */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Would a real user say this?
                  </span>
                  <span className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                    fix.classification.userBehaviorRealistic
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  )}>
                    {fix.classification.userBehaviorRealistic ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Yes (realistic)
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        No (unrealistic)
                      </>
                    )}
                  </span>
                </div>

                {/* Question 2: Bot response */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Did the bot respond appropriately?
                  </span>
                  <span className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                    fix.classification.botResponseAppropriate
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  )}>
                    {fix.classification.botResponseAppropriate ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Yes (appropriate)
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        No (needs fix)
                      </>
                    )}
                  </span>
                </div>

                {/* Conclusion */}
                <div className="pt-2">
                  <div className={cn(
                    'flex items-start gap-3 p-3 rounded-lg',
                    fix.classification.issueLocation === 'bot'
                      ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
                      : fix.classification.issueLocation === 'test-agent'
                        ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                  )}>
                    <div className={cn(
                      'p-1.5 rounded-full shrink-0',
                      fix.classification.issueLocation === 'bot'
                        ? 'bg-purple-200 dark:bg-purple-800'
                        : fix.classification.issueLocation === 'test-agent'
                          ? 'bg-orange-200 dark:bg-orange-800'
                          : 'bg-red-200 dark:bg-red-800'
                    )}>
                      <svg className={cn(
                        'w-4 h-4',
                        fix.classification.issueLocation === 'bot'
                          ? 'text-purple-700 dark:text-purple-300'
                          : fix.classification.issueLocation === 'test-agent'
                            ? 'text-orange-700 dark:text-orange-300'
                            : 'text-red-700 dark:text-red-300'
                      )} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          Conclusion:
                        </span>
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          fix.classification.issueLocation === 'bot'
                            ? 'bg-purple-200 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200'
                            : fix.classification.issueLocation === 'test-agent'
                              ? 'bg-orange-200 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200'
                              : 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200'
                        )}>
                          Fix {fix.classification.issueLocation === 'bot' ? 'Bot/Flowise' : fix.classification.issueLocation === 'test-agent' ? 'Test Agent' : 'Both'}
                        </span>
                      </div>
                      {fix.classification.reasoning && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {fix.classification.reasoning}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Root Cause */}
          {fix.rootCause && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Root Cause</h4>
              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div className="text-sm text-gray-900 dark:text-white mb-2">
                  <span className="font-medium">Type:</span> {fix.rootCause.type}
                </div>
                {fix.rootCause.evidence && fix.rootCause.evidence.length > 0 && (
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Evidence:</span>
                    <ul className="mt-1 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      {fix.rootCause.evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-gray-400 mt-1">•</span>
                          <span>{e}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Affected Tests */}
          {fix.affectedTests && fix.affectedTests.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Affected Tests ({fix.affectedTests.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {fix.affectedTests.map(test => (
                  <span key={test} className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                    {test}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Code Change */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Suggested Code</h4>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy Code
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 bg-gray-900 text-gray-100 text-sm rounded-lg overflow-x-auto max-h-80">
              <code>{fix.changeCode}</code>
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function FixesPanel({
  fixes,
  loading,
  promptFiles = [],
  onUpdateStatus,
  onApplyFix,
  onCopyFullPrompt,
  onRunDiagnosis,
  diagnosisRunning,
  hasFailedTests,
  // Batch selection props
  selectedFixIds = new Set(),
  onSelectionChange,
  onSelectAll,
  onApplySelectedFixes,
  applyingBatch,
  // Conflict resolution
  onResolveConflict,
  // Phase 5: External classification filter control
  classificationFilter: externalFilter,
  onClassificationFilterChange,
  // Target category filter
  targetCategoryFilter: externalTargetFilter,
  onTargetCategoryFilterChange,
}: FixesPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedFullPromptId, setCopiedFullPromptId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [applyModalOpen, setApplyModalOpen] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState<ConflictGroup | null>(null);
  const [popoutFix, setPopoutFix] = useState<GeneratedFix | null>(null);
  const [internalFilter, setInternalFilter] = useState<ClassificationFilter>('all');
  const [internalTargetFilter, setInternalTargetFilter] = useState<TargetCategoryFilter>('all');

  // Use external filter if provided, otherwise use internal state
  const classificationFilter = externalFilter ?? internalFilter;
  const setClassificationFilter = onClassificationFilterChange ?? setInternalFilter;
  const targetCategoryFilter = externalTargetFilter ?? internalTargetFilter;
  const setTargetCategoryFilter = onTargetCategoryFilterChange ?? setInternalTargetFilter;
  // Section expand/collapse state - bot sections expanded by default, test-agent collapsed
  const [sectionExpanded, setSectionExpanded] = useState<Record<FixCategory, boolean>>({
    'prompt': true,
    'tool': true,
    'test-agent': false,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sort fixes by classification (bot first, then both, then test-agent)
  // Then by confidence within each classification group
  const sortedFixes = useMemo(() => {
    const classificationOrder: Record<string, number> = { 'bot': 0, 'both': 1, 'test-agent': 2, 'unknown': 3 };
    return [...fixes].sort((a, b) => {
      const aClass = a.classification?.issueLocation || 'unknown';
      const bClass = b.classification?.issueLocation || 'unknown';
      // First sort by classification priority
      if (classificationOrder[aClass] !== classificationOrder[bClass]) {
        return classificationOrder[aClass] - classificationOrder[bClass];
      }
      // Then by confidence (descending)
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }, [fixes]);

  // Filter fixes by classification AND target category
  const filteredFixes = useMemo(() => {
    return sortedFixes.filter(fix => {
      // Filter by classification (who needs to fix it)
      if (classificationFilter !== 'all') {
        const issueLocation = fix.classification?.issueLocation || 'unknown';
        if (issueLocation !== classificationFilter) return false;
      }
      // Filter by target category (what type of file)
      if (targetCategoryFilter !== 'all') {
        const category = getFixCategory(fix.targetFile);
        if (category !== targetCategoryFilter) return false;
      }
      return true;
    });
  }, [sortedFixes, classificationFilter, targetCategoryFilter]);

  // Count fixes by classification for filter badges
  const classificationCounts = useMemo(() => {
    return fixes.reduce((acc, fix) => {
      const loc = fix.classification?.issueLocation || 'unknown';
      acc[loc] = (acc[loc] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [fixes]);

  // Count fixes by target category for filter badges
  const targetCategoryCounts = useMemo(() => {
    return fixes.reduce((acc, fix) => {
      const category = getFixCategory(fix.targetFile);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [fixes]);

  // Group fixes by target file category (prompt, tool, test-agent)
  const groupedFixes = useMemo(() => {
    const groups: Record<FixCategory, GeneratedFix[]> = {
      'prompt': [],
      'tool': [],
      'test-agent': [],
    };

    for (const fix of filteredFixes) {
      const category = getFixCategory(fix.targetFile || '');
      groups[category].push(fix);
    }

    return groups;
  }, [filteredFixes]);

  // Toggle section expansion
  const toggleSection = (category: FixCategory) => {
    setSectionExpanded(prev => ({ ...prev, [category]: !prev[category] }));
  };

  // Check for Golden Rule violation: selecting test-agent fixes when bot fixes exist
  const pendingBotFixes = useMemo(() => {
    return fixes.filter(f =>
      f.status === 'pending' &&
      (f.classification?.issueLocation === 'bot' || f.classification?.issueLocation === 'both')
    );
  }, [fixes]);

  const selectedTestAgentFixes = useMemo(() => {
    return fixes.filter(f =>
      selectedFixIds.has(f.fixId) &&
      f.classification?.issueLocation === 'test-agent'
    );
  }, [fixes, selectedFixIds]);

  const showGoldenRuleWarning = selectedTestAgentFixes.length > 0 && pendingBotFixes.length > 0;

  // Detect conflicts
  const conflicts = detectConflicts(fixes);
  const hasConflicts = conflicts.size > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleExpand = (fixId: string) => {
    setExpanded(prev => ({ ...prev, [fixId]: !prev[fixId] }));
  };

  const handleCopy = async (fixId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(fixId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyFullPrompt = async (fixId: string, fileKey: string) => {
    if (!onCopyFullPrompt) return;

    try {
      const content = await onCopyFullPrompt(fileKey);
      if (content) {
        await navigator.clipboard.writeText(content);
        setCopiedFullPromptId(`${fixId}-${fileKey}`);
        setTimeout(() => setCopiedFullPromptId(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy full prompt:', err);
    }
    setDropdownOpen(null);
  };

  const handleApplyFix = async (fixId: string) => {
    if (!onApplyFix || !selectedFileKey) return;

    setApplying(true);
    try {
      await onApplyFix(fixId, selectedFileKey);
      setApplyModalOpen(null);
      setSelectedFileKey('');
    } catch (err) {
      console.error('Failed to apply fix:', err);
    } finally {
      setApplying(false);
    }
  };

  // Handle conflict resolution
  const handleResolveConflict = (resolution: 'first' | 'second' | 'merge' | 'skip', fixIds: string[]) => {
    if (onResolveConflict) {
      onResolveConflict(resolution, fixIds);
    } else if (onUpdateStatus) {
      // Default behavior: apply first/second, reject others
      const sortedFixes = fixIds.map(id => fixes.find(f => f.fixId === id)!).sort((a, b) => b.confidence - a.confidence);

      if (resolution === 'first') {
        onUpdateStatus(sortedFixes[0].fixId, 'applied');
        for (let i = 1; i < sortedFixes.length; i++) {
          onUpdateStatus(sortedFixes[i].fixId, 'rejected');
        }
      } else if (resolution === 'second' && sortedFixes.length > 1) {
        onUpdateStatus(sortedFixes[1].fixId, 'applied');
        onUpdateStatus(sortedFixes[0].fixId, 'rejected');
        for (let i = 2; i < sortedFixes.length; i++) {
          onUpdateStatus(sortedFixes[i].fixId, 'rejected');
        }
      } else if (resolution === 'skip') {
        for (const fix of sortedFixes) {
          onUpdateStatus(fix.fixId, 'rejected');
        }
      }
    }
    setConflictModalOpen(null);
  };

  const openApplyModal = (fixId: string, fix: GeneratedFix) => {
    // Smart file selection based on targetFile and fix type
    const targetLower = fix.targetFile?.toLowerCase() || '';

    // Find best matching file from available promptFiles
    let defaultFile = '';

    // 1. Try to match targetFile against promptFile fileKeys or displayNames
    if (promptFiles.length > 0) {
      // Check for scheduling-related files (schedule, scheduling, appointment)
      if (targetLower.includes('schedule') || targetLower.includes('appointment')) {
        const schedulingFile = promptFiles.find(f =>
          f.fileKey.includes('scheduling') ||
          f.fileKey.includes('schedule') ||
          f.displayName.toLowerCase().includes('scheduling')
        );
        if (schedulingFile) defaultFile = schedulingFile.fileKey;
      }
      // Check for patient-related files
      else if (targetLower.includes('patient')) {
        const patientFile = promptFiles.find(f =>
          f.fileKey.includes('patient') ||
          f.displayName.toLowerCase().includes('patient')
        );
        if (patientFile) defaultFile = patientFile.fileKey;
      }
    }

    // 2. If no match found, use fix type as fallback
    if (!defaultFile) {
      if (fix.type === 'tool') {
        // For tool fixes, try to find a tool file, not the system prompt
        const toolFile = promptFiles.find(f =>
          f.fileKey.includes('tool') ||
          f.displayName.toLowerCase().includes('tool')
        );
        defaultFile = toolFile?.fileKey || 'system_prompt';
      } else {
        defaultFile = 'system_prompt';
      }
    }

    // 3. Final fallback: use first available file
    if (!defaultFile && promptFiles.length > 0) {
      defaultFile = promptFiles[0].fileKey;
    }

    setSelectedFileKey(defaultFile);
    setApplyModalOpen(fixId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (fixes.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          No fixes generated.
          {hasFailedTests && ' Run diagnosis to analyze test failures.'}
          {!hasFailedTests && ' All tests passed - no failures to analyze.'}
        </p>
        {onRunDiagnosis && hasFailedTests && (
          <button
            onClick={onRunDiagnosis}
            disabled={diagnosisRunning}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              diagnosisRunning
                ? 'bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            {diagnosisRunning ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" /> Running Diagnosis...
              </span>
            ) : (
              '🔍 Run Diagnosis'
            )}
          </button>
        )}
      </div>
    );
  }

  // Calculate pending fixes for selection header (use filteredFixes for display)
  const pendingFixes = filteredFixes.filter(f => f.status === 'pending');
  const allPendingFixes = fixes.filter(f => f.status === 'pending'); // All pending for selection
  const allPendingSelected = pendingFixes.length > 0 && pendingFixes.every(f => selectedFixIds.has(f.fixId));
  const somePendingSelected = pendingFixes.some(f => selectedFixIds.has(f.fixId));
  const selectedCount = allPendingFixes.filter(f => selectedFixIds.has(f.fixId)).length;
  const showBatchControls = allPendingFixes.length > 0 && (onSelectionChange || onSelectAll || onApplySelectedFixes);

  // Calculate total conflicting fixes count
  const totalConflictingFixes = Array.from(conflicts.values()).reduce((sum, c) => sum + c.fixes.length, 0);

  // Helper to select all bot fixes
  const handleSelectAllBotFixes = () => {
    if (onSelectionChange) {
      pendingBotFixes.forEach(fix => {
        if (!selectedFixIds.has(fix.fixId)) {
          onSelectionChange(fix.fixId, true);
        }
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Classification Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Filter:</span>
        <button
          onClick={() => setClassificationFilter('all')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
            classificationFilter === 'all'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
          )}
        >
          All ({fixes.length})
        </button>
        <button
          onClick={() => setClassificationFilter('bot')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5',
            classificationFilter === 'bot'
              ? 'bg-purple-600 text-white'
              : 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-900/70'
          )}
        >
          <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
          Bot Issues ({classificationCounts['bot'] || 0})
        </button>
        <button
          onClick={() => setClassificationFilter('both')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5',
            classificationFilter === 'both'
              ? 'bg-red-600 text-white'
              : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/70'
          )}
        >
          <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
          Both ({classificationCounts['both'] || 0})
        </button>
        <button
          onClick={() => setClassificationFilter('test-agent')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5',
            classificationFilter === 'test-agent'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-900/70'
          )}
        >
          <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
          Test Agent ({classificationCounts['test-agent'] || 0})
        </button>
      </div>

      {/* Target Category Filter Buttons (Flowise Prompt, Tool, Test Bot) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Target:</span>
        <button
          onClick={() => setTargetCategoryFilter('all')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
            targetCategoryFilter === 'all'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
          )}
        >
          All ({fixes.length})
        </button>
        <button
          onClick={() => setTargetCategoryFilter('prompt')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5',
            targetCategoryFilter === 'prompt'
              ? 'bg-purple-600 text-white'
              : 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-900/70'
          )}
        >
          🟣 Flowise Prompt ({targetCategoryCounts['prompt'] || 0})
        </button>
        <button
          onClick={() => setTargetCategoryFilter('tool')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5',
            targetCategoryFilter === 'tool'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70'
          )}
        >
          🔵 Flowise Tool ({targetCategoryCounts['tool'] || 0})
        </button>
        <button
          onClick={() => setTargetCategoryFilter('test-agent')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5',
            targetCategoryFilter === 'test-agent'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-900/70'
          )}
        >
          🟠 Test Bot ({targetCategoryCounts['test-agent'] || 0})
        </button>
      </div>

      {/* Golden Rule Warning Banner */}
      {showGoldenRuleWarning && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-3">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
                Golden Rule: Fix the bot first!
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                You have <strong>{selectedTestAgentFixes.length}</strong> test-agent fix{selectedTestAgentFixes.length !== 1 ? 'es' : ''} selected,
                but there are <strong>{pendingBotFixes.length}</strong> bot fix{pendingBotFixes.length !== 1 ? 'es' : ''} pending.
                The bot serves users, not tests — apply bot fixes first.
              </p>
              <button
                onClick={handleSelectAllBotFixes}
                className="mt-2 px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Select All Bot Fixes ({pendingBotFixes.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Combined Header Bar: Batch Controls + Conflict Warning */}
      <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        {/* Left: Batch Selection */}
        <div className="flex items-center gap-4">
          {showBatchControls && onSelectAll && (
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={allPendingSelected}
                ref={(el) => {
                  if (el) el.indeterminate = somePendingSelected && !allPendingSelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {selectedCount > 0 ? (
                  <span className="font-medium text-blue-600 dark:text-blue-400">{selectedCount} selected</span>
                ) : (
                  `Select all ${pendingFixes.length}`
                )}
              </span>
            </label>
          )}

          {/* Conflict indicator (compact) */}
          {hasConflicts && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {conflicts.size} conflict{conflicts.size !== 1 ? 's' : ''} ({totalConflictingFixes} fixes)
              </span>
              <button
                onClick={() => setConflictModalOpen(Array.from(conflicts.values())[0])}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 underline underline-offset-2"
              >
                Resolve
              </button>
            </div>
          )}
        </div>

        {/* Right: Apply Button */}
        {showBatchControls && onApplySelectedFixes && selectedCount > 0 && (
          <button
            onClick={onApplySelectedFixes}
            disabled={applyingBatch}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm',
              applyingBatch
                ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 hover:shadow text-white'
            )}
          >
            {applyingBatch ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" /> Applying...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Apply {selectedCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Grouped Collapsible Sections by Target Type */}
      {(['prompt', 'tool', 'test-agent'] as FixCategory[]).map((category) => {
        const categoryFixes = groupedFixes[category];
        if (categoryFixes.length === 0) return null;

        const config = categoryConfig[category];
        const isOpen = sectionExpanded[category];
        // Calculate starting index for this section (for fix numbering)
        const startIndex = category === 'prompt' ? 0 :
          category === 'tool' ? groupedFixes['prompt'].length :
          groupedFixes['prompt'].length + groupedFixes['tool'].length;

        return (
          <div
            key={category}
            className={cn(
              'rounded-xl border overflow-hidden',
              config.borderColor
            )}
          >
            {/* Section Header */}
            <button
              onClick={() => toggleSection(category)}
              className={cn(
                'w-full flex items-center justify-between p-3 transition-colors',
                config.headerBg,
                'hover:opacity-90'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{config.icon}</span>
                <span className={cn('font-semibold', config.textColor)}>
                  {config.label}
                </span>
                <span className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  config.bgColor, config.textColor
                )}>
                  {categoryFixes.length}
                </span>
              </div>
              <svg
                className={cn(
                  'w-5 h-5 transition-transform',
                  config.textColor,
                  isOpen ? 'rotate-180' : ''
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Section Content */}
            {isOpen && (
              <div className={cn('p-3 space-y-3', config.bgColor)}>
                {categoryFixes.map((fix, idx) => {
                  const globalIndex = startIndex + idx;
                  const isExpanded = expanded[fix.fixId];
                  const isCopied = copiedId === fix.fixId;
                  const classificationClass = fix.classification?.issueLocation || 'unknown';
                  const isDropdownOpen = dropdownOpen === fix.fixId;
                  const isApplyModalOpen = applyModalOpen === fix.fixId;
                  const isSelected = selectedFixIds.has(fix.fixId);
                  const isPending = fix.status === 'pending';
                  const conflictGroup = getConflictWarning(fix.fixId, conflicts);
                  const hasConflict = conflictGroup !== null;

                  // Status-based card styling
                  const cardStyles = {
                    pending: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                    applied: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
                    rejected: 'bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700 opacity-60',
                    verified: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
                  };

                  return (
                    <div
                      key={fix.fixId}
                      className={cn(
                        'rounded-xl border overflow-hidden transition-all shadow-sm hover:shadow-md',
                        cardStyles[fix.status as keyof typeof cardStyles] || cardStyles.pending,
                        classificationBorderColors[classificationClass], // Left border color based on classification
                        isSelected && 'ring-2 ring-blue-500',
                        hasConflict && !isSelected && 'ring-2 ring-amber-400'
                      )}
                    >
            {/* Card Header */}
            <div
              onClick={() => toggleExpand(fix.fixId)}
              className="flex items-start gap-3 p-4 cursor-pointer"
            >
              {/* Checkbox */}
              {isPending && onSelectionChange && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSelectionChange(fix.fixId, e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
              )}

              {/* Main Content */}
              <div className="flex-1 min-w-0">
                {/* Title Row */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    #{globalIndex + 1}
                  </span>
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    typeColors[fix.type]
                  )}>
                    {fix.type}
                  </span>
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full border',
                    priorityColors[fix.priority]
                  )}>
                    {fix.priority}
                  </span>
                  {/* Conflict badge with description */}
                  {hasConflict && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConflictModalOpen(conflictGroup);
                      }}
                      className="flex items-center gap-1.5 text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors"
                      title={`Click to resolve: ${conflictGroup!.fixes.length} fixes target ${conflictGroup!.targetFile}${conflictGroup!.location ? ` in ${conflictGroup!.location}` : ''}`}
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{conflictGroup!.fixes.length - 1} conflict{conflictGroup!.fixes.length > 2 ? 's' : ''}</span>
                    </button>
                  )}
                </div>

                {/* Description */}
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 line-clamp-2">
                  {fix.changeDescription}
                </p>

                {/* Meta Row */}
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {/* Confidence bar */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          fix.confidence >= 0.8 ? 'bg-green-500' :
                          fix.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                        )}
                        style={{ width: `${Math.round(fix.confidence * 100)}%` }}
                      />
                    </div>
                    <span>{Math.round(fix.confidence * 100)}%</span>
                  </div>

                  <span className="text-gray-300 dark:text-gray-600">|</span>

                  {/* Status */}
                  <span className={cn('font-medium', statusColors[fix.status])}>
                    {fix.status}
                  </span>

                  <span className="text-gray-300 dark:text-gray-600">|</span>

                  {/* Classification */}
                  <FixClassificationBadge
                    classification={fix.classification}
                    size="sm"
                    showTooltip={true}
                  />

                  {/* Target file (truncated) */}
                  {fix.targetFile && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <span className="font-mono truncate max-w-[120px]" title={fix.targetFile}>
                        {fix.targetFile.split('/').pop()}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Popout button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPopoutFix(fix);
                  }}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="View full details"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>

                {/* Quick copy button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(fix.fixId, fix.changeCode);
                  }}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    isCopied
                      ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                  title="Copy code snippet"
                >
                  {isCopied ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>

                {/* Full prompt dropdown */}
                {promptFiles.length > 0 && onCopyFullPrompt && (
                  <div className="relative" ref={isDropdownOpen ? dropdownRef : undefined}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpen(isDropdownOpen ? null : fix.fixId);
                      }}
                      className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="Copy full prompt"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                    {isDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden min-w-[180px]">
                        <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          Copy full prompt
                        </div>
                        {promptFiles.map(file => {
                          const isCopiedFull = copiedFullPromptId === `${fix.fixId}-${file.fileKey}`;
                          return (
                            <button
                              key={file.fileKey}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyFullPrompt(fix.fixId, file.fileKey);
                              }}
                              className={cn(
                                'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between',
                                isCopiedFull && 'bg-green-50 dark:bg-green-900/30'
                              )}
                            >
                              <span className="text-gray-700 dark:text-gray-300">{file.displayName}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">v{file.version}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Expand indicator */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(fix.fixId);
                  }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg
                    className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-0 space-y-4 border-t border-gray-100 dark:border-gray-700">
                {/* Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Target File</span>
                    <p className="font-mono text-sm text-gray-900 dark:text-white mt-0.5 truncate" title={fix.targetFile}>
                      {fix.targetFile}
                    </p>
                  </div>
                  {fix.location && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Location</span>
                      <p className="font-mono text-sm text-gray-900 dark:text-white mt-0.5">
                        {fix.location.section || fix.location.function || 'N/A'}
                      </p>
                    </div>
                  )}
                  {fix.rootCause && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Root Cause</span>
                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                        <span className="font-medium">{fix.rootCause.type}</span>
                        {fix.rootCause.evidence.length > 0 && (
                          <span className="text-gray-500 ml-1">({fix.rootCause.evidence.length})</span>
                        )}
                      </p>
                    </div>
                  )}
                  {fix.affectedTests.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Affected Tests</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {fix.affectedTests.slice(0, 3).map(test => (
                          <span
                            key={test}
                            className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                          >
                            {test}
                          </span>
                        ))}
                        {fix.affectedTests.length > 3 && (
                          <span className="text-xs text-gray-500">+{fix.affectedTests.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Code Block */}
                <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Suggested Code</span>
                    <button
                      onClick={() => handleCopy(fix.fixId, fix.changeCode)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                        isCopied
                          ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      )}
                    >
                      {isCopied ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 bg-gray-900 text-gray-100 text-sm overflow-x-auto max-h-64">
                    <code>{fix.changeCode}</code>
                  </pre>
                </div>

                {/* Action Buttons */}
                {fix.status === 'pending' && (onUpdateStatus || onApplyFix) && (
                  <div className="flex gap-3 pt-2">
                    {onApplyFix && promptFiles.length > 0 ? (
                      <button
                        onClick={() => openApplyModal(fix.fixId, fix)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Apply Fix
                      </button>
                    ) : onUpdateStatus && (
                      <button
                        onClick={() => onUpdateStatus(fix.fixId, 'applied')}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Mark Applied
                      </button>
                    )}
                    {onUpdateStatus && (
                      <button
                        onClick={() => onUpdateStatus(fix.fixId, 'rejected')}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Reject
                      </button>
                    )}
                  </div>
                )}

                {/* Apply Fix Modal */}
                {isApplyModalOpen && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setApplyModalOpen(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                          <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Apply Fix</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Select target prompt file</p>
                        </div>
                      </div>
                      <select
                        value={selectedFileKey}
                        onChange={(e) => setSelectedFileKey(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg mb-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      >
                        {promptFiles.map(file => (
                          <option key={file.fileKey} value={file.fileKey}>
                            {file.displayName} (v{file.version})
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApplyFix(fix.fixId)}
                          disabled={applying || !selectedFileKey}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 font-medium rounded-lg transition-colors shadow-sm"
                        >
                          {applying ? (
                            <>
                              <Spinner size="sm" />
                              Applying...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Apply
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setApplyModalOpen(null)}
                          className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Already actioned badge */}
                {fix.status !== 'pending' && (
                  <div className={cn(
                    'flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium',
                    fix.status === 'applied' && 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
                    fix.status === 'rejected' && 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                    fix.status === 'verified' && 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  )}>
                    {fix.status === 'applied' && (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Fix applied
                      </>
                    )}
                    {fix.status === 'rejected' && (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Fix rejected
                      </>
                    )}
                    {fix.status === 'verified' && (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Verified working
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Conflict Resolution Modal (Phase 7) */}
      {conflictModalOpen && (
        <ConflictResolutionModal
          conflict={conflictModalOpen}
          onResolve={handleResolveConflict}
          onCancel={() => setConflictModalOpen(null)}
        />
      )}

      {/* Popout Fix Detail Modal */}
      {popoutFix && (
        <FixDetailModal
          fix={popoutFix}
          onClose={() => setPopoutFix(null)}
          conflicts={conflicts}
          fixIndex={fixes.findIndex(f => f.fixId === popoutFix.fixId)}
        />
      )}
    </div>
  );
}
