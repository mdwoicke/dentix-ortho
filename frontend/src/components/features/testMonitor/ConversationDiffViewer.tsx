/**
 * ConversationDiffViewer Component
 *
 * Compares conversations between two test runs to show where they diverged.
 * Helps answer "What changed?" when a test starts failing.
 */

import { useState, useEffect, useMemo } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';
import type { ConversationTurn } from '../../../types/testMonitor.types';

interface ConversationDiffViewerProps {
  testId: string;
  baseRunId: string;
  compareRunId: string;
  onClose?: () => void;
}

interface DiffResult {
  turnNumber: number;
  baseContent: ConversationTurn | null;
  compareContent: ConversationTurn | null;
  changeType: 'same' | 'added' | 'removed' | 'modified';
  divergencePoint: boolean;
}

/**
 * Calculate text similarity using a simple diff approach
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  const union = new Set([...words1, ...words2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Generate diff between two conversation arrays
 */
function generateDiff(base: ConversationTurn[], compare: ConversationTurn[]): DiffResult[] {
  const results: DiffResult[] = [];
  const maxLen = Math.max(base.length, compare.length);
  let foundDivergence = false;

  for (let i = 0; i < maxLen; i++) {
    const baseTurn = base[i] || null;
    const compareTurn = compare[i] || null;

    let changeType: DiffResult['changeType'] = 'same';

    if (!baseTurn && compareTurn) {
      changeType = 'added';
    } else if (baseTurn && !compareTurn) {
      changeType = 'removed';
    } else if (baseTurn && compareTurn) {
      // Check if content is different
      const similarity = calculateSimilarity(baseTurn.content, compareTurn.content);
      if (similarity < 0.8 || baseTurn.role !== compareTurn.role) {
        changeType = 'modified';
      }
    }

    const isDivergencePoint = !foundDivergence && changeType !== 'same';
    if (isDivergencePoint) {
      foundDivergence = true;
    }

    results.push({
      turnNumber: i,
      baseContent: baseTurn,
      compareContent: compareTurn,
      changeType,
      divergencePoint: isDivergencePoint,
    });
  }

  return results;
}

export function ConversationDiffViewer({
  testId,
  baseRunId,
  compareRunId,
  onClose,
}: ConversationDiffViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseTranscript, setBaseTranscript] = useState<ConversationTurn[]>([]);
  const [compareTranscript, setCompareTranscript] = useState<ConversationTurn[]>([]);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  useEffect(() => {
    const fetchTranscripts = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch both transcripts in parallel
        const [baseRes, compareRes] = await Promise.all([
          fetch(`/api/test-monitor/tests/${testId}/transcript?runId=${baseRunId}`),
          fetch(`/api/test-monitor/tests/${testId}/transcript?runId=${compareRunId}`),
        ]);

        const baseData = await baseRes.json();
        const compareData = await compareRes.json();

        if (baseData.success && compareData.success) {
          setBaseTranscript(baseData.data?.transcript || []);
          setCompareTranscript(compareData.data?.transcript || []);
        } else {
          setError('Failed to fetch one or both transcripts');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    if (testId && baseRunId && compareRunId) {
      fetchTranscripts();
    }
  }, [testId, baseRunId, compareRunId]);

  const diffResults = useMemo(() => {
    return generateDiff(baseTranscript, compareTranscript);
  }, [baseTranscript, compareTranscript]);

  const divergenceIndex = diffResults.findIndex(r => r.divergencePoint);
  const changedCount = diffResults.filter(r => r.changeType !== 'same').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
        <span className="ml-2 text-sm text-gray-500">Comparing conversations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            Conversation Diff
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {changedCount === 0 ? (
              <span className="text-green-600 dark:text-green-400">No changes detected</span>
            ) : (
              <>
                <span className="text-red-600 dark:text-red-400">{changedCount} change{changedCount !== 1 ? 's' : ''}</span>
                {divergenceIndex >= 0 && (
                  <span className="ml-2">
                    (diverges at turn {divergenceIndex + 1})
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('unified')}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                viewMode === 'unified'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              Unified
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                viewMode === 'split'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              Split
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Run Labels */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 text-xs">
        <div className="flex-1 p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-center">
          Base: {baseRunId.slice(0, 8)}...
        </div>
        <div className="flex-1 p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-center">
          Compare: {compareRunId.slice(0, 8)}...
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {diffResults.map((diff, idx) => {
          const bgColor = {
            same: 'bg-white dark:bg-gray-900',
            added: 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500',
            removed: 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500',
            modified: 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500',
          }[diff.changeType];

          return (
            <div
              key={idx}
              className={cn(
                'rounded-lg p-3 transition-all',
                bgColor,
                diff.divergencePoint && 'ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-gray-900'
              )}
            >
              {/* Turn Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    Turn {idx + 1}
                  </span>
                  {diff.divergencePoint && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500 text-white font-medium">
                      DIVERGENCE POINT
                    </span>
                  )}
                  {diff.changeType !== 'same' && (
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded font-medium',
                      {
                        added: 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200',
                        removed: 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200',
                        modified: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200',
                      }[diff.changeType]
                    )}>
                      {diff.changeType.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {diff.baseContent?.role || diff.compareContent?.role}
                </span>
              </div>

              {/* Content Display */}
              {viewMode === 'unified' ? (
                <div className="space-y-2">
                  {diff.baseContent && diff.changeType !== 'added' && (
                    <div className={cn(
                      'text-sm p-2 rounded',
                      diff.changeType === 'removed'
                        ? 'bg-red-100 dark:bg-red-900/30 line-through'
                        : diff.changeType === 'modified'
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : 'bg-gray-50 dark:bg-gray-800'
                    )}>
                      <span className="text-xs text-red-600 dark:text-red-400 mr-2">−</span>
                      {diff.baseContent.content}
                    </div>
                  )}
                  {diff.compareContent && diff.changeType !== 'removed' && (
                    <div className={cn(
                      'text-sm p-2 rounded',
                      diff.changeType === 'added'
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : diff.changeType === 'modified'
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-gray-50 dark:bg-gray-800'
                    )}>
                      <span className="text-xs text-green-600 dark:text-green-400 mr-2">+</span>
                      {diff.compareContent.content}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className={cn(
                    'text-sm p-2 rounded min-h-[40px]',
                    diff.changeType === 'removed' || diff.changeType === 'modified'
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : 'bg-gray-50 dark:bg-gray-800'
                  )}>
                    {diff.baseContent?.content || (
                      <span className="text-gray-400 italic">Not present</span>
                    )}
                  </div>
                  <div className={cn(
                    'text-sm p-2 rounded min-h-[40px]',
                    diff.changeType === 'added' || diff.changeType === 'modified'
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-gray-50 dark:bg-gray-800'
                  )}>
                    {diff.compareContent?.content || (
                      <span className="text-gray-400 italic">Not present</span>
                    )}
                  </div>
                </div>
              )}

              {/* Validation Status Diff */}
              {(diff.baseContent?.validationPassed !== undefined ||
                diff.compareContent?.validationPassed !== undefined) && (
                <div className="mt-2 flex gap-4 text-xs">
                  {diff.baseContent && (
                    <span className={cn(
                      'px-1.5 py-0.5 rounded',
                      diff.baseContent.validationPassed
                        ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
                        : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                    )}>
                      Base: {diff.baseContent.validationPassed ? 'PASS' : 'FAIL'}
                    </span>
                  )}
                  {diff.compareContent && (
                    <span className={cn(
                      'px-1.5 py-0.5 rounded',
                      diff.compareContent.validationPassed
                        ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
                        : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                    )}>
                      Compare: {diff.compareContent.validationPassed ? 'PASS' : 'FAIL'}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {diffResults.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No conversation data available for comparison.
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationDiffViewer;
