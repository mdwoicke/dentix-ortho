/**
 * FixPreviewModal Component
 *
 * Shows a preview of what a fix will change before applying it.
 * Includes diff view, validation results, and conflict warnings.
 */

import { useState, useEffect } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

interface FixConflict {
  fix1Id: string;
  fix2Id: string;
  conflictType: 'overlapping_lines' | 'same_section' | 'semantic_conflict';
  description: string;
  resolution: string;
}

interface FixPreview {
  fixId: string;
  targetFile: string;
  currentContent: string;
  proposedContent: string;
  diffHunks: DiffHunk[];
  diffStats: {
    additions: number;
    deletions: number;
    changes: number;
  };
  validationResult: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  conflictingFixes: FixConflict[];
  impactedTests: string[];
  estimatedRiskLevel: 'low' | 'medium' | 'high';
}

interface FixPreviewModalProps {
  fixId: string;
  fixDescription?: string;
  onClose: () => void;
  onApply: (fixId: string) => void;
}

const riskColors = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export function FixPreviewModal({ fixId, fixDescription, onClose, onApply }: FixPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FixPreview | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'full'>('diff');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/test-monitor/fixes/${fixId}/preview`, {
          method: 'POST',
        });
        const data = await response.json();

        if (data.success) {
          setPreview(data.data);
        } else {
          setError(data.error || 'Failed to generate preview');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [fixId]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply(fixId);
      onClose();
    } catch (err) {
      setError('Failed to apply fix');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[90vw] max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Fix Preview
            </h2>
            {fixDescription && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {fixDescription}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
              <span className="ml-3 text-gray-500">Generating preview...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500 dark:text-red-400">
              {error}
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Summary Bar */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Target: </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {preview.targetFile}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-600 dark:text-green-400">
                      +{preview.diffStats.additions}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      -{preview.diffStats.deletions}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2 py-1 rounded text-xs font-medium',
                    riskColors[preview.estimatedRiskLevel]
                  )}>
                    {preview.estimatedRiskLevel.toUpperCase()} RISK
                  </span>
                </div>
              </div>

              {/* Validation Errors */}
              {!preview.validationResult.valid && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <h3 className="font-medium text-red-800 dark:text-red-200 mb-2">
                    Validation Errors
                  </h3>
                  <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                    {preview.validationResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation Warnings */}
              {preview.validationResult.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    Warnings
                  </h3>
                  <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                    {preview.validationResult.warnings.map((warn, idx) => (
                      <li key={idx}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Conflicts */}
              {preview.conflictingFixes.length > 0 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <h3 className="font-medium text-orange-800 dark:text-orange-200 mb-2">
                    Potential Conflicts with Other Fixes
                  </h3>
                  <ul className="space-y-2 text-sm text-orange-700 dark:text-orange-300">
                    {preview.conflictingFixes.map((conflict, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="mt-1 w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                        <span>{conflict.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">View:</span>
                <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('diff')}
                    className={cn(
                      'px-3 py-1 text-sm rounded transition-colors',
                      viewMode === 'diff'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    )}
                  >
                    Diff
                  </button>
                  <button
                    onClick={() => setViewMode('full')}
                    className={cn(
                      'px-3 py-1 text-sm rounded transition-colors',
                      viewMode === 'full'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    )}
                  >
                    Full Preview
                  </button>
                </div>
              </div>

              {/* Diff View */}
              {viewMode === 'diff' ? (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                    Changes ({preview.diffStats.changes} lines)
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {preview.diffHunks.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                        No changes detected
                      </div>
                    ) : (
                      <pre className="text-xs font-mono p-3 bg-gray-50 dark:bg-gray-900">
                        {preview.diffHunks.map((hunk, hunkIdx) => (
                          <div key={hunkIdx} className="mb-4">
                            <div className="text-blue-600 dark:text-blue-400 mb-1">
                              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                            </div>
                            {hunk.lines.map((line, lineIdx) => {
                              const isAddition = line.startsWith('+') && !line.startsWith('+++');
                              const isDeletion = line.startsWith('-') && !line.startsWith('---');
                              const isContext = !isAddition && !isDeletion;

                              return (
                                <div
                                  key={lineIdx}
                                  className={cn(
                                    'whitespace-pre-wrap',
                                    isAddition && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
                                    isDeletion && 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
                                    isContext && 'text-gray-600 dark:text-gray-400'
                                  )}
                                >
                                  {line}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                    Proposed Content
                  </div>
                  <pre className="text-xs font-mono p-3 bg-gray-50 dark:bg-gray-900 max-h-80 overflow-y-auto whitespace-pre-wrap">
                    {preview.proposedContent}
                  </pre>
                </div>
              )}

              {/* Impacted Tests */}
              {preview.impactedTests.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                    Impacted Tests ({preview.impactedTests.length})
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {preview.impactedTests.slice(0, 10).map((testId, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded text-xs"
                      >
                        {testId}
                      </span>
                    ))}
                    {preview.impactedTests.length > 10 && (
                      <span className="px-2 py-0.5 text-blue-600 dark:text-blue-400 text-xs">
                        +{preview.impactedTests.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {preview && !preview.validationResult.valid && (
              <span className="text-red-600 dark:text-red-400">
                Cannot apply: validation errors detected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!preview || !preview.validationResult.valid || applying}
              className={cn(
                'px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2',
                preview?.validationResult.valid && !applying
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              )}
            >
              {applying && <Spinner size="sm" />}
              Apply Fix
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FixPreviewModal;
