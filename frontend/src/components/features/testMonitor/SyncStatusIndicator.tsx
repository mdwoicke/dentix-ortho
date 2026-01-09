/**
 * SyncStatusIndicator Component
 * Track local vs deployed prompt state for Flowise sync
 * Part of Phase 5 & 6 of the Advanced Tuning Tab implementation
 *
 * Phase 6 enhancements:
 * - Prominent visual indicator for pending changes
 * - Deploy to Flowise CTA after applying fixes
 * - Compact mode for inline display
 */

import { useState, useCallback } from 'react';
import { Card } from '../../ui';
import { Spinner } from '../../ui';
import type { PromptFile, PromptContext } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';
import { EnvironmentBadge } from './EnvironmentSelector';

interface PromptSyncStatus {
  fileKey: string;
  displayName: string;
  localVersion: number;
  deployedVersion: number | null;
  syncStatus: 'synced' | 'pending' | 'unknown';
  lastDeployedAt?: string;
}

interface SyncStatusIndicatorProps {
  /** Prompt files with version info */
  promptFiles: PromptFile[];
  /** Deployed version tracking (fileKey -> version) */
  deployedVersions?: Record<string, number>;
  /** Callback to mark a prompt as deployed */
  onMarkDeployed?: (fileKey: string, version: number) => Promise<void>;
  /** Callback to copy full prompt content */
  onCopyPrompt?: (fileKey: string) => Promise<string | null>;
  /** Whether actions are loading */
  loading?: boolean;
  /** Whether fixes were recently applied (triggers prominent CTA) */
  hasRecentlyAppliedFixes?: boolean;
  /** Number of bot fixes applied (for display) */
  appliedBotFixesCount?: number;
  /** Current environment context (for display) */
  environment?: PromptContext;
}

const statusStyles = {
  synced: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    label: 'Synced',
  },
  pending: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-400',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'Pending',
  },
  unknown: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'Unknown',
  },
};

export function SyncStatusIndicator({
  promptFiles,
  deployedVersions = {},
  onMarkDeployed,
  onCopyPrompt,
  loading = false,
  hasRecentlyAppliedFixes = false,
  appliedBotFixesCount = 0,
  environment = 'production',
}: SyncStatusIndicatorProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyingKey, setCopyingKey] = useState<string | null>(null);
  const [copyErrorKey, setCopyErrorKey] = useState<string | null>(null);
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Compute sync status for each file
  const syncStatuses: PromptSyncStatus[] = promptFiles.map(file => {
    const deployedVersion = deployedVersions[file.fileKey] ?? null;
    let syncStatus: 'synced' | 'pending' | 'unknown';

    if (deployedVersion === null) {
      syncStatus = 'unknown';
    } else if (deployedVersion === file.version) {
      syncStatus = 'synced';
    } else {
      syncStatus = 'pending';
    }

    return {
      fileKey: file.fileKey,
      displayName: file.displayName,
      localVersion: file.version,
      deployedVersion,
      syncStatus,
      lastDeployedAt: file.updatedAt,
    };
  });

  // Count statuses
  const pendingCount = syncStatuses.filter(s => s.syncStatus === 'pending').length;
  const unknownCount = syncStatuses.filter(s => s.syncStatus === 'unknown').length;

  // Handle copy prompt
  const handleCopy = useCallback(async (fileKey: string) => {
    if (!onCopyPrompt || copyingKey) return;

    setCopyingKey(fileKey);
    setCopyErrorKey(null);

    try {
      const content = await onCopyPrompt(fileKey);
      if (!content) {
        console.error('No content returned for prompt:', fileKey);
        setCopyErrorKey(fileKey);
        setTimeout(() => setCopyErrorKey(null), 3000);
        return;
      }

      await navigator.clipboard.writeText(content);
      setCopiedKey(fileKey);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
      setCopyErrorKey(fileKey);
      setTimeout(() => setCopyErrorKey(null), 3000);
    } finally {
      setCopyingKey(null);
    }
  }, [onCopyPrompt, copyingKey]);

  // Handle mark deployed
  const handleMarkDeployed = useCallback(async (fileKey: string, version: number) => {
    if (!onMarkDeployed) return;

    setMarkingKey(fileKey);
    try {
      await onMarkDeployed(fileKey, version);
    } catch (err) {
      console.error('Failed to mark as deployed:', err);
    } finally {
      setMarkingKey(null);
    }
  }, [onMarkDeployed]);

  if (promptFiles.length === 0) {
    return null;
  }

  // Determine if we should show the prominent alert
  const showProminentAlert = pendingCount > 0 || hasRecentlyAppliedFixes;
  const allSynced = pendingCount === 0 && unknownCount < syncStatuses.length;

  return (
    <Card className={cn(
      "h-full w-full flex flex-col",
      showProminentAlert && "ring-2 ring-yellow-400 dark:ring-yellow-500"
    )}>
      <div className="p-4 flex-1 flex flex-col">
        {/* Phase 6: Prominent Alert Banner for Pending Changes */}
        {showProminentAlert && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                  {hasRecentlyAppliedFixes
                    ? `Deploy Changes to Flowise`
                    : `${pendingCount} Prompt${pendingCount > 1 ? 's' : ''} Pending Deployment`
                  }
                </h4>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  {hasRecentlyAppliedFixes && appliedBotFixesCount > 0
                    ? `${appliedBotFixesCount} bot fix${appliedBotFixesCount > 1 ? 'es were' : ' was'} applied. Copy prompts below and deploy to Flowise to complete the tuning workflow.`
                    : 'Local prompt versions differ from deployed versions. Deploy to Flowise to sync.'
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* All Synced Banner */}
        {allSynced && !showProminentAlert && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-green-800 dark:text-green-300">
                All prompts synced with Flowise
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Flowise Sync Status
            <EnvironmentBadge environment={environment} />
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">
                {pendingCount} pending
              </span>
            )}
            {unknownCount > 0 && unknownCount === syncStatuses.length && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-full">
                Not tracked
              </span>
            )}
          </h3>
          <span className="text-gray-500 dark:text-gray-400">
            {expanded ? '−' : '+'}
          </span>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="mt-4 space-y-3">
            {syncStatuses.map((status) => {
              const style = statusStyles[status.syncStatus];
              const isCopied = copiedKey === status.fileKey;
              const isCopying = copyingKey === status.fileKey;
              const hasCopyError = copyErrorKey === status.fileKey;
              const isMarking = markingKey === status.fileKey;

              return (
                <div
                  key={status.fileKey}
                  className={cn(
                    'p-3 rounded-lg border',
                    style.bg,
                    'border-gray-200 dark:border-gray-700'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={style.text}>{style.icon}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {status.displayName}
                      </span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded', style.bg, style.text)}>
                        {style.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Version info */}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Local: v{status.localVersion}
                        {status.deployedVersion !== null && (
                          <> | Deployed: v{status.deployedVersion}</>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-2">
                    {/* Copy prompt button */}
                    {onCopyPrompt && (
                      <button
                        onClick={() => handleCopy(status.fileKey)}
                        disabled={loading || isCopying}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                          isCopied
                            ? 'bg-green-500 text-white'
                            : hasCopyError
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300',
                          (loading || isCopying) && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {isCopying ? (
                          <span className="flex items-center gap-1">
                            <Spinner size="sm" />
                            Copying...
                          </span>
                        ) : isCopied ? (
                          '✓ Copied!'
                        ) : hasCopyError ? (
                          '✗ Failed'
                        ) : (
                          'Copy for Flowise'
                        )}
                      </button>
                    )}

                    {/* Mark deployed button */}
                    {onMarkDeployed && status.syncStatus !== 'synced' && (
                      <button
                        onClick={() => handleMarkDeployed(status.fileKey, status.localVersion)}
                        disabled={loading || isMarking}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
                      >
                        {isMarking ? (
                          <span className="flex items-center gap-1">
                            <Spinner size="sm" />
                            Marking...
                          </span>
                        ) : (
                          'Mark as Deployed'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Help text */}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Use "Copy for Flowise" to copy the full prompt, then paste it into Flowise.
              After deploying, click "Mark as Deployed" to track the version.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default SyncStatusIndicator;
