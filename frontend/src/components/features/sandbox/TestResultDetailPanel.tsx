/**
 * TestResultDetailPanel Component
 * Slide-out panel showing detailed test results with tabbed interface
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import type { DetailedEndpointResult, GoalResult, TranscriptEntry, ConstraintViolation, TestIssue } from '../../../types/sandbox.types';

interface TestResultDetailPanelProps {
  testId: string;
  production: DetailedEndpointResult | null;
  sandboxA: DetailedEndpointResult | null;
  sandboxB: DetailedEndpointResult | null;
  onClose: () => void;
}

type TabKey = 'production' | 'sandboxA' | 'sandboxB';

const TAB_CONFIG: Record<TabKey, { label: string; color: string; bgColor: string; borderColor: string }> = {
  production: {
    label: 'Production',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-500',
  },
  sandboxA: {
    label: 'Sandbox A',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-500',
  },
  sandboxB: {
    label: 'Sandbox B',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-500',
  },
};

function GoalChecklist({ goals }: { goals: GoalResult[] }) {
  if (!goals || goals.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">No goals recorded</p>
    );
  }

  return (
    <ul className="space-y-2">
      {goals.map((goal, idx) => (
        <li key={goal.goalId || idx} className="flex items-start gap-2">
          <span className={cn(
            'flex-shrink-0 mt-0.5',
            goal.passed ? 'text-green-500' : 'text-red-500'
          )}>
            {goal.passed ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {goal.goalId}
            </span>
            {goal.message && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {goal.message}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface TranscriptViewProps {
  transcript: TranscriptEntry[];
  highlightedTurn?: number | null;
  onHighlightClear?: () => void;
}

function TranscriptView({ transcript, highlightedTurn, onHighlightClear }: TranscriptViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const turnRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate turn number for each entry (1-indexed, counting each message as a turn)
  const getTurnNumber = (idx: number) => idx + 1;

  // Auto-expand and scroll when highlightedTurn changes
  useEffect(() => {
    if (highlightedTurn !== null && highlightedTurn !== undefined && transcript.length > 0) {
      // Auto-expand if highlighted turn is beyond initial 4
      if (highlightedTurn > 4 && !isExpanded) {
        setIsExpanded(true);
      }

      // Use setTimeout to ensure DOM has updated after expansion
      setTimeout(() => {
        const targetRef = turnRefs.current.get(highlightedTurn);
        if (targetRef) {
          targetRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightedTurn, transcript.length, isExpanded]);

  // Clear highlight after a delay
  useEffect(() => {
    if (highlightedTurn !== null && highlightedTurn !== undefined && onHighlightClear) {
      const timer = setTimeout(() => {
        onHighlightClear();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedTurn, onHighlightClear]);

  if (!transcript || transcript.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">No transcript available</p>
    );
  }

  const displayedTranscript = isExpanded ? transcript : transcript.slice(0, 4);
  const hasMore = transcript.length > 4;

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="space-y-2">
        {displayedTranscript.map((entry, idx) => {
          const turnNumber = getTurnNumber(idx);
          const isHighlighted = highlightedTurn === turnNumber;

          return (
            <div
              key={`transcript-${idx}-${entry.role}`}
              ref={(el) => {
                if (el) {
                  turnRefs.current.set(turnNumber, el);
                } else {
                  turnRefs.current.delete(turnNumber);
                }
              }}
              id={`turn-${turnNumber}`}
              className={cn(
                'rounded-lg p-3 text-sm transition-all duration-300',
                entry.role === 'user'
                  ? 'bg-blue-50 dark:bg-blue-900/20 ml-4'
                  : 'bg-gray-50 dark:bg-gray-800 mr-4',
                isHighlighted && 'ring-2 ring-orange-400 ring-offset-2 dark:ring-offset-gray-900'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  'text-xs font-medium uppercase flex items-center gap-2',
                  entry.role === 'user'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400'
                )}>
                  {entry.role}
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                    Turn {turnNumber}
                  </span>
                </span>
                {entry.responseTimeMs && (
                  <span className="text-xs text-gray-400">
                    {(entry.responseTimeMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                {entry.content}
              </p>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {isExpanded ? 'Show less' : `Show ${transcript.length - 4} more messages`}
        </button>
      )}
    </div>
  );
}

interface TranscriptPopoutModalProps {
  transcript: TranscriptEntry[];
  constraintViolations?: (string | ConstraintViolation)[];
  issues?: (string | TestIssue)[];
  highlightedTurn: number | null;
  onHighlightClear: () => void;
  onJumpToTurn: (turnNumber: number) => void;
  onClose: () => void;
  testId?: string;
}

function TranscriptPopoutModal({
  transcript,
  constraintViolations,
  issues,
  highlightedTurn,
  onHighlightClear,
  onJumpToTurn,
  onClose,
  testId,
}: TranscriptPopoutModalProps) {
  const turnRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [showIssuesPanel, setShowIssuesPanel] = useState(true);

  const hasViolationsOrIssues = (constraintViolations && constraintViolations.length > 0) || (issues && issues.length > 0);

  // Calculate turn number for each entry (1-indexed)
  const getTurnNumber = (idx: number) => idx + 1;

  // Filter transcript based on search
  const filteredTranscript = searchQuery
    ? transcript.filter((entry) =>
        entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.role.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : transcript;

  // Auto-scroll when highlightedTurn changes
  useEffect(() => {
    if (highlightedTurn !== null && highlightedTurn !== undefined) {
      setTimeout(() => {
        const targetRef = turnRefs.current.get(highlightedTurn);
        if (targetRef) {
          targetRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightedTurn]);

  // Handle keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 dark:bg-black/80"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        "relative h-[90vh] mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300",
        hasViolationsOrIssues && showIssuesPanel ? "w-full max-w-6xl" : "w-full max-w-4xl"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Conversation Transcript
              </h2>
              {testId && (
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                  {testId}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle Issues Panel */}
            {hasViolationsOrIssues && (
              <button
                onClick={() => setShowIssuesPanel(!showIssuesPanel)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                  showIssuesPanel
                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                )}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {showIssuesPanel ? 'Hide Issues' : 'Show Issues'}
              </button>
            )}
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search transcript..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* Message count */}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredTranscript.length} / {transcript.length} messages
            </span>
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content with optional Issues sidebar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Issues Panel (Left Sidebar) */}
          {hasViolationsOrIssues && showIssuesPanel && (
            <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-y-auto">
              <div className="p-4 space-y-4">
                {/* Constraint Violations */}
                {constraintViolations && constraintViolations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Constraint Violations ({constraintViolations.length})
                    </h4>
                    <ul className="space-y-2">
                      {constraintViolations.map((violation, idx) => {
                        const isString = typeof violation === 'string';
                        const violationObj = violation as ConstraintViolation;
                        return (
                          <li key={idx} className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                            {isString ? (
                              violation
                            ) : (
                              <div>
                                <span className="font-medium">{violationObj.type || 'Violation'}</span>
                                {violationObj.description && (
                                  <p className="text-xs mt-1 text-red-500 dark:text-red-400/80">
                                    {violationObj.description}
                                  </p>
                                )}
                                {violationObj.turnNumber && (
                                  <button
                                    onClick={() => onJumpToTurn(violationObj.turnNumber!)}
                                    className="mt-2 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                    Jump to Turn {violationObj.turnNumber}
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Issues */}
                {issues && issues.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Issues ({issues.length})
                    </h4>
                    <ul className="space-y-2">
                      {issues.map((issue, idx) => {
                        const isString = typeof issue === 'string';
                        const issueObj = issue as TestIssue;
                        return (
                          <li key={idx} className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg px-3 py-2">
                            {isString ? (
                              issue
                            ) : (
                              <div>
                                <span className="font-medium">{issueObj.type || 'Issue'}</span>
                                {issueObj.description && (
                                  <p className="text-xs mt-1 text-yellow-500 dark:text-yellow-400/80">
                                    {issueObj.description}
                                  </p>
                                )}
                                {issueObj.turnNumber && (
                                  <button
                                    onClick={() => onJumpToTurn(issueObj.turnNumber!)}
                                    className="mt-2 text-xs text-yellow-500 hover:text-yellow-700 dark:hover:text-yellow-300 underline underline-offset-2 cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                    Jump to Turn {issueObj.turnNumber}
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transcript Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredTranscript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p>No messages match your search</p>
              </div>
            ) : (
              <div className="space-y-3 max-w-3xl mx-auto">
                {filteredTranscript.map((entry, idx) => {
                  // Find original index for turn number
                  const originalIdx = transcript.indexOf(entry);
                  const turnNumber = getTurnNumber(originalIdx);
                  const isHighlighted = highlightedTurn === turnNumber;

                  return (
                    <div
                      key={`popout-transcript-${originalIdx}-${entry.role}`}
                      ref={(el) => {
                        if (el) {
                          turnRefs.current.set(turnNumber, el);
                        } else {
                          turnRefs.current.delete(turnNumber);
                        }
                      }}
                      className={cn(
                        'rounded-xl p-4 transition-all duration-300',
                        entry.role === 'user'
                          ? 'bg-blue-50 dark:bg-blue-900/30 ml-12'
                          : 'bg-gray-100 dark:bg-gray-800 mr-12',
                        isHighlighted && 'ring-2 ring-orange-400 ring-offset-2 dark:ring-offset-gray-900'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-xs font-semibold uppercase px-2 py-0.5 rounded',
                            entry.role === 'user'
                              ? 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          )}>
                            {entry.role}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            Turn {turnNumber}
                          </span>
                        </div>
                        {entry.responseTimeMs && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {(entry.responseTimeMs / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                        {entry.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Esc</kbd> to close
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function EndpointResultContent({ result, tabKey, testId }: { result: DetailedEndpointResult | null; tabKey: TabKey; testId?: string }) {
  const config = TAB_CONFIG[tabKey];
  const [highlightedTurn, setHighlightedTurn] = useState<number | null>(null);
  const [isTranscriptPopoutOpen, setIsTranscriptPopoutOpen] = useState(false);

  const handleJumpToTurn = useCallback((turnNumber: number) => {
    setHighlightedTurn(turnNumber);
  }, []);

  const handleHighlightClear = useCallback(() => {
    setHighlightedTurn(null);
  }, []);

  if (!result) {
    return (
      <div className="py-8 text-center">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
        <p className="text-gray-500 dark:text-gray-400">This endpoint was not tested</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status & Metrics */}
      <div className={cn('p-4 rounded-lg border', config.bgColor, result.passed ? 'border-green-300 dark:border-green-700' : 'border-red-300 dark:border-red-700')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn(
              'px-3 py-1 text-sm font-bold rounded-full',
              result.passed
                ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
            )}>
              {result.passed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {result.turnCount} turns
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      {result.summary && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Summary</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            {result.summary}
          </p>
        </div>
      )}

      {/* Goals */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Goal Results
        </h4>
        <GoalChecklist goals={result.goalResults || []} />
      </div>

      {/* Constraint Violations */}
      {result.constraintViolations && result.constraintViolations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Constraint Violations
          </h4>
          <ul className="space-y-1">
            {result.constraintViolations.map((violation, idx) => {
              const isString = typeof violation === 'string';
              const violationObj = violation as ConstraintViolation;
              return (
                <li key={idx} className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
                  {isString ? (
                    violation
                  ) : (
                    <div>
                      <span className="font-medium">{violationObj.type || 'Violation'}</span>
                      {violationObj.description && (
                        <span className="ml-1">- {violationObj.description}</span>
                      )}
                      {violationObj.turnNumber && (
                        <button
                          onClick={() => handleJumpToTurn(violationObj.turnNumber!)}
                          className="text-xs ml-2 text-red-500 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 cursor-pointer inline-flex items-center gap-1"
                          title={`Jump to Turn ${violationObj.turnNumber}`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          (Turn {violationObj.turnNumber})
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Issues */}
      {result.issues && result.issues.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Issues
          </h4>
          <ul className="space-y-1">
            {result.issues.map((issue, idx) => {
              const isString = typeof issue === 'string';
              const issueObj = issue as TestIssue;
              return (
                <li key={idx} className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded px-3 py-2">
                  {isString ? (
                    issue
                  ) : (
                    <div>
                      <span className="font-medium">{issueObj.type || 'Issue'}</span>
                      {issueObj.description && (
                        <span className="ml-1">- {issueObj.description}</span>
                      )}
                      {issueObj.turnNumber && (
                        <button
                          onClick={() => handleJumpToTurn(issueObj.turnNumber!)}
                          className="text-xs ml-2 text-yellow-500 hover:text-yellow-700 dark:hover:text-yellow-300 underline underline-offset-2 cursor-pointer inline-flex items-center gap-1"
                          title={`Jump to Turn ${issueObj.turnNumber}`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          (Turn {issueObj.turnNumber})
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Transcript */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            Conversation Transcript
          </h4>
          {result.transcript && result.transcript.length > 0 && (
            <button
              onClick={() => setIsTranscriptPopoutOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Open transcript in fullscreen"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Expand
            </button>
          )}
        </div>
        <TranscriptView
          transcript={result.transcript || []}
          highlightedTurn={highlightedTurn}
          onHighlightClear={handleHighlightClear}
        />
      </div>

      {/* Transcript Popout Modal */}
      {isTranscriptPopoutOpen && result.transcript && (
        <TranscriptPopoutModal
          transcript={result.transcript}
          constraintViolations={result.constraintViolations}
          issues={result.issues}
          highlightedTurn={highlightedTurn}
          onHighlightClear={handleHighlightClear}
          onJumpToTurn={handleJumpToTurn}
          onClose={() => setIsTranscriptPopoutOpen(false)}
          testId={testId}
        />
      )}
    </div>
  );
}

export function TestResultDetailPanel({
  testId,
  production,
  sandboxA,
  sandboxB,
  onClose,
}: TestResultDetailPanelProps) {
  // Determine available tabs (only show tabs for endpoints that were tested)
  const availableTabs: TabKey[] = [];
  if (production) availableTabs.push('production');
  if (sandboxA) availableTabs.push('sandboxA');
  if (sandboxB) availableTabs.push('sandboxB');

  const [activeTab, setActiveTab] = useState<TabKey>(availableTabs[0] || 'production');

  // Reset active tab when current tab becomes unavailable
  // This handles edge cases where data changes but testId stays the same
  useEffect(() => {
    const isCurrentTabAvailable =
      (activeTab === 'production' && production) ||
      (activeTab === 'sandboxA' && sandboxA) ||
      (activeTab === 'sandboxB' && sandboxB);

    if (!isCurrentTabAvailable) {
      // Switch to first available tab
      if (production) setActiveTab('production');
      else if (sandboxA) setActiveTab('sandboxA');
      else if (sandboxB) setActiveTab('sandboxB');
    }
  }, [activeTab, production, sandboxA, sandboxB]);

  const getResult = (tab: TabKey): DetailedEndpointResult | null => {
    switch (tab) {
      case 'production': return production;
      case 'sandboxA': return sandboxA;
      case 'sandboxB': return sandboxB;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 shadow-xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Test Details
            </h2>
            <p className="text-sm font-mono text-gray-500 dark:text-gray-400">
              {testId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {(['production', 'sandboxA', 'sandboxB'] as TabKey[]).map((tab) => {
            const config = TAB_CONFIG[tab];
            const result = getResult(tab);
            const isActive = activeTab === tab;
            const isAvailable = availableTabs.includes(tab);

            return (
              <button
                key={tab}
                onClick={() => isAvailable && setActiveTab(tab)}
                disabled={!isAvailable}
                className={cn(
                  'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? cn(config.color, config.borderColor)
                    : isAvailable
                    ? 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                    : 'text-gray-300 dark:text-gray-600 border-transparent cursor-not-allowed'
                )}
              >
                <span className="flex items-center gap-2">
                  {config.label}
                  {result && (
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      result.passed ? 'bg-green-500' : 'bg-red-500'
                    )} />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <EndpointResultContent result={getResult(activeTab)} tabKey={activeTab} testId={testId} />
        </div>
      </div>
    </div>
  );
}
