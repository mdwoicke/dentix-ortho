/**
 * FixAnalytics Component
 * Display fix effectiveness metrics and root cause distribution
 * Part of Phase 6 of the Advanced Tuning Tab implementation
 */

import React, { useMemo, useState } from 'react';
import { Card } from '../../ui';
import type { GeneratedFix, VerificationSummary } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface FixAnalyticsProps {
  /** All fixes from test runs */
  fixes: GeneratedFix[];
  /** Historical verification results */
  verificationHistory?: VerificationSummary[];
  /** Loading state */
  loading?: boolean;
  /** Callback to filter fixes by classification (Phase 5) */
  onFilterByClassification?: (classification: 'all' | 'bot' | 'both' | 'test-agent') => void;
}

interface AnalyticsMetrics {
  totalFixes: number;
  appliedFixes: number;
  verifiedFixes: number;
  rejectedFixes: number;
  pendingFixes: number;
  effectivenessRate: number;
  byType: { prompt: number; tool: number };
  byPriority: { critical: number; high: number; medium: number; low: number };
  byRootCause: Record<string, number>;
  avgConfidence: number;
  highConfidenceFixes: number;
  // Phase 5: Classification metrics
  byClassification: {
    bot: number;
    both: number;
    'test-agent': number;
    unknown: number;
  };
  goldenRuleCompliance: number; // % of bot fixes applied before test-agent
  botFixesApplied: number;
  testAgentFixesApplied: number;
}

function calculateMetrics(fixes: GeneratedFix[], verificationHistory?: VerificationSummary[]): AnalyticsMetrics {
  const totalFixes = fixes.length;
  const appliedFixes = fixes.filter(f => f.status === 'applied').length;
  const verifiedFixes = fixes.filter(f => f.status === 'verified').length;
  const rejectedFixes = fixes.filter(f => f.status === 'rejected').length;
  const pendingFixes = fixes.filter(f => f.status === 'pending').length;

  // Calculate effectiveness from verification history
  let effectivenessRate = 0;
  if (verificationHistory && verificationHistory.length > 0) {
    const totalVerified = verificationHistory.reduce((sum, v) => sum + v.results.length, 0);
    const effectiveResults = verificationHistory.reduce(
      (sum, v) => sum + v.results.filter(r => r.effective).length,
      0
    );
    effectivenessRate = totalVerified > 0 ? Math.round((effectiveResults / totalVerified) * 100) : 0;
  } else if (verifiedFixes > 0 && appliedFixes > 0) {
    effectivenessRate = Math.round((verifiedFixes / (appliedFixes + verifiedFixes)) * 100);
  }

  // By type
  const byType = {
    prompt: fixes.filter(f => f.type === 'prompt').length,
    tool: fixes.filter(f => f.type === 'tool').length,
  };

  // By priority
  const byPriority = {
    critical: fixes.filter(f => f.priority === 'critical').length,
    high: fixes.filter(f => f.priority === 'high').length,
    medium: fixes.filter(f => f.priority === 'medium').length,
    low: fixes.filter(f => f.priority === 'low').length,
  };

  // By root cause
  const byRootCause: Record<string, number> = {};
  for (const fix of fixes) {
    if (fix.rootCause) {
      const causeType = fix.rootCause.type;
      byRootCause[causeType] = (byRootCause[causeType] || 0) + 1;
    }
  }

  // Average confidence
  const confidences = fixes.map(f => f.confidence);
  const avgConfidence = confidences.length > 0
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 0;

  const highConfidenceFixes = fixes.filter(f => f.confidence >= 80).length;

  // Phase 5: Classification metrics
  const byClassification = {
    bot: fixes.filter(f => f.classification?.issueLocation === 'bot').length,
    both: fixes.filter(f => f.classification?.issueLocation === 'both').length,
    'test-agent': fixes.filter(f => f.classification?.issueLocation === 'test-agent').length,
    unknown: fixes.filter(f => !f.classification?.issueLocation).length,
  };

  // Golden Rule Compliance: % of bot fixes applied before test-agent fixes
  // If all bot fixes are applied (or none exist), and test-agent fixes are applied, compliance is 100%
  // If test-agent fixes are applied while bot fixes are pending, compliance decreases
  const botFixes = fixes.filter(f =>
    f.classification?.issueLocation === 'bot' || f.classification?.issueLocation === 'both'
  );
  const testAgentFixes = fixes.filter(f => f.classification?.issueLocation === 'test-agent');

  const botFixesApplied = botFixes.filter(f => f.status === 'applied' || f.status === 'verified').length;
  const testAgentFixesApplied = testAgentFixes.filter(f => f.status === 'applied' || f.status === 'verified').length;
  const pendingBotFixes = botFixes.filter(f => f.status === 'pending').length;

  let goldenRuleCompliance = 100;
  if (testAgentFixesApplied > 0 && pendingBotFixes > 0) {
    // Reduce compliance based on ratio of pending bot fixes to test-agent fixes applied
    const violationRatio = Math.min(1, pendingBotFixes / testAgentFixesApplied);
    goldenRuleCompliance = Math.round((1 - violationRatio) * 100);
  } else if (botFixes.length === 0 && testAgentFixes.length > 0) {
    // No bot fixes to apply, compliance is N/A but we show 100%
    goldenRuleCompliance = 100;
  }

  return {
    totalFixes,
    appliedFixes,
    verifiedFixes,
    rejectedFixes,
    pendingFixes,
    effectivenessRate,
    byType,
    byPriority,
    byRootCause,
    avgConfidence,
    highConfidenceFixes,
    byClassification,
    goldenRuleCompliance,
    botFixesApplied,
    testAgentFixesApplied,
  };
}

const rootCauseLabels: Record<string, string> = {
  'prompt-gap': 'Prompt Gap',
  'missing-capability': 'Missing Capability',
  'incorrect-response': 'Incorrect Response',
  'tool-failure': 'Tool Failure',
  'context-loss': 'Context Loss',
  'misunderstanding': 'Misunderstanding',
  'api-error': 'API Error',
  'data-issue': 'Data Issue',
  'unknown': 'Unknown',
};

const rootCauseColors: Record<string, string> = {
  'prompt-gap': 'bg-purple-500',
  'missing-capability': 'bg-blue-500',
  'incorrect-response': 'bg-orange-500',
  'tool-failure': 'bg-red-500',
  'context-loss': 'bg-yellow-500',
  'misunderstanding': 'bg-pink-500',
  'api-error': 'bg-indigo-500',
  'data-issue': 'bg-teal-500',
  'unknown': 'bg-gray-500',
};

function StatCard({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: string;
}) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </div>
      <div className={cn('text-2xl font-bold mt-1', color || 'text-gray-900 dark:text-white')}>
        {value}
      </div>
      {sublabel && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {sublabel}
        </div>
      )}
    </div>
  );
}

function ProgressBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 dark:text-gray-400 w-24 truncate">
        {label}
      </span>
      <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-8 text-right">
        {value}
      </span>
    </div>
  );
}

export function FixAnalytics({
  fixes,
  verificationHistory,
  loading = false,
  onFilterByClassification,
}: FixAnalyticsProps) {
  const [expanded, setExpanded] = useState(false);

  const metrics = useMemo(() => calculateMetrics(fixes, verificationHistory), [fixes, verificationHistory]);

  if (fixes.length === 0 && !loading) {
    return null;
  }

  return (
    <Card>
      <div className="p-4">
        {/* Header */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Fix Analytics
            {metrics.effectivenessRate > 0 && (
              <span className={cn(
                'px-2 py-0.5 text-xs rounded-full',
                metrics.effectivenessRate >= 70
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : metrics.effectivenessRate >= 40
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}>
                {metrics.effectivenessRate}% effective
              </span>
            )}
          </h3>
          <span className="text-gray-500 dark:text-gray-400">
            {expanded ? '−' : '+'}
          </span>
        </div>

        {/* Summary Stats (always visible) */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          <StatCard
            label="Total Fixes"
            value={metrics.totalFixes}
          />
          <StatCard
            label="Applied"
            value={metrics.appliedFixes}
            color="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            label="Verified"
            value={metrics.verifiedFixes}
            color="text-green-600 dark:text-green-400"
          />
          <StatCard
            label="Effectiveness"
            value={`${metrics.effectivenessRate}%`}
            sublabel={`${metrics.highConfidenceFixes} high confidence`}
            color={metrics.effectivenessRate >= 70 ? 'text-green-600' : 'text-yellow-600'}
          />
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="mt-6 space-y-6">
            {/* Phase 5: Issue Distribution by Classification */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Issue Distribution (Golden Rule)
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {/* Bot Issues */}
                <button
                  onClick={() => onFilterByClassification?.('bot')}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all',
                    'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
                    onFilterByClassification && 'hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:border-purple-300 dark:hover:border-purple-700 cursor-pointer'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded-full" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Bot Issues</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-400 mt-1">
                    {metrics.byClassification.bot}
                  </div>
                  <div className="text-xs text-purple-600 dark:text-purple-500 mt-0.5">
                    {metrics.totalFixes > 0 ? Math.round((metrics.byClassification.bot / metrics.totalFixes) * 100) : 0}%
                  </div>
                </button>

                {/* Both Issues */}
                <button
                  onClick={() => onFilterByClassification?.('both')}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all',
                    'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
                    onFilterByClassification && 'hover:bg-red-100 dark:hover:bg-red-900/40 hover:border-red-300 dark:hover:border-red-700 cursor-pointer'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Both</span>
                  </div>
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">
                    {metrics.byClassification.both}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                    {metrics.totalFixes > 0 ? Math.round((metrics.byClassification.both / metrics.totalFixes) * 100) : 0}%
                  </div>
                </button>

                {/* Test Agent Issues */}
                <button
                  onClick={() => onFilterByClassification?.('test-agent')}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all',
                    'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
                    onFilterByClassification && 'hover:bg-orange-100 dark:hover:bg-orange-900/40 hover:border-orange-300 dark:hover:border-orange-700 cursor-pointer'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-500 rounded-full" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Test Agent</span>
                  </div>
                  <div className="text-2xl font-bold text-orange-700 dark:text-orange-400 mt-1">
                    {metrics.byClassification['test-agent']}
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                    {metrics.totalFixes > 0 ? Math.round((metrics.byClassification['test-agent'] / metrics.totalFixes) * 100) : 0}%
                  </div>
                </button>
              </div>
              {onFilterByClassification && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Click a category to filter fixes
                </p>
              )}
            </div>

            {/* Phase 5: Golden Rule Compliance */}
            <div className={cn(
              'p-4 rounded-lg border',
              metrics.goldenRuleCompliance >= 80
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : metrics.goldenRuleCompliance >= 50
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            )}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    Golden Rule Compliance
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Fix bot issues before test agent issues
                  </p>
                </div>
                <div className={cn(
                  'text-3xl font-bold',
                  metrics.goldenRuleCompliance >= 80
                    ? 'text-green-600 dark:text-green-400'
                    : metrics.goldenRuleCompliance >= 50
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                )}>
                  {metrics.goldenRuleCompliance}%
                </div>
              </div>
              <div className="mt-3 flex gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-purple-500 rounded-full" />
                  <span className="text-gray-600 dark:text-gray-400">
                    Bot fixes applied: <span className="font-medium text-gray-900 dark:text-white">{metrics.botFixesApplied}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-orange-500 rounded-full" />
                  <span className="text-gray-600 dark:text-gray-400">
                    Test agent applied: <span className="font-medium text-gray-900 dark:text-white">{metrics.testAgentFixesApplied}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Fix Type Distribution */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Fixes by Type
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Prompt Fixes</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-400 mt-1">
                    {metrics.byType.prompt}
                  </div>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tool Fixes</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">
                    {metrics.byType.tool}
                  </div>
                </div>
              </div>
            </div>

            {/* Priority Distribution */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Fixes by Priority
              </h4>
              <div className="space-y-2">
                <ProgressBar
                  value={metrics.byPriority.critical}
                  max={metrics.totalFixes}
                  color="bg-red-500"
                  label="Critical"
                />
                <ProgressBar
                  value={metrics.byPriority.high}
                  max={metrics.totalFixes}
                  color="bg-orange-500"
                  label="High"
                />
                <ProgressBar
                  value={metrics.byPriority.medium}
                  max={metrics.totalFixes}
                  color="bg-yellow-500"
                  label="Medium"
                />
                <ProgressBar
                  value={metrics.byPriority.low}
                  max={metrics.totalFixes}
                  color="bg-gray-400"
                  label="Low"
                />
              </div>
            </div>

            {/* Root Cause Distribution */}
            {Object.keys(metrics.byRootCause).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Root Cause Distribution
                </h4>
                <div className="space-y-2">
                  {Object.entries(metrics.byRootCause)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cause, count]) => (
                      <ProgressBar
                        key={cause}
                        value={count}
                        max={metrics.totalFixes}
                        color={rootCauseColors[cause] || 'bg-gray-500'}
                        label={rootCauseLabels[cause] || cause}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Confidence Distribution */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Confidence Metrics
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Avg. Confidence</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                    {metrics.avgConfidence}%
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400">High Confidence (≥80%)</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                    {metrics.highConfidenceFixes}
                  </div>
                </div>
              </div>
            </div>

            {/* Status Breakdown */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Status Breakdown
              </h4>
              <div className="flex gap-2">
                <div className="flex-1 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-center">
                  <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {metrics.pendingFixes}
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-500">Pending</div>
                </div>
                <div className="flex-1 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-center">
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
                    {metrics.appliedFixes}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-500">Applied</div>
                </div>
                <div className="flex-1 p-2 bg-green-50 dark:bg-green-900/20 rounded text-center">
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">
                    {metrics.verifiedFixes}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-500">Verified</div>
                </div>
                <div className="flex-1 p-2 bg-red-50 dark:bg-red-900/20 rounded text-center">
                  <div className="text-lg font-bold text-red-700 dark:text-red-400">
                    {metrics.rejectedFixes}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-500">Rejected</div>
                </div>
              </div>
            </div>

            {/* Help text */}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Analytics are calculated from all fixes in the current session.
              Effectiveness rate is based on verification results.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default FixAnalytics;
