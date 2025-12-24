/**
 * FindingsPanel Component
 * Displays findings and issues discovered during test execution
 */

import React, { useState } from 'react';
import { Spinner } from '../../ui';
import type { Finding } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface FindingsPanelProps {
  findings: Finding[];
  loading?: boolean;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700',
  low: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700',
};

const typeIcons: Record<string, string> = {
  bug: 'Bug',
  enhancement: 'Enhancement',
  'prompt-issue': 'Prompt',
  'tool-issue': 'Tool',
  regression: 'Regression',
};

export function FindingsPanel({ findings, loading }: FindingsPanelProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggleExpand = (id: number) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No findings recorded.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {findings.map((finding) => {
        const isExpanded = expanded[finding.id];

        return (
          <div
            key={finding.id}
            className={cn(
              'border rounded-lg overflow-hidden',
              severityColors[finding.severity]
            )}
          >
            <div
              onClick={() => toggleExpand(finding.id)}
              className="flex items-center justify-between p-3 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20">
                  {finding.severity}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20">
                  {typeIcons[finding.type] || finding.type}
                </span>
                <span className="font-medium text-sm">
                  {finding.title}
                </span>
              </div>
              <span className="text-gray-600 dark:text-gray-300">
                {isExpanded ? '−' : '+'}
              </span>
            </div>

            {isExpanded && (
              <div className="p-3 bg-white/50 dark:bg-black/20 border-t border-current/20">
                {finding.description && (
                  <div className="mb-2">
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Description
                    </h4>
                    <p className="text-sm">{finding.description}</p>
                  </div>
                )}

                {finding.affectedStep && (
                  <div className="mb-2">
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Affected Step
                    </h4>
                    <p className="text-sm font-mono">{finding.affectedStep}</p>
                  </div>
                )}

                {finding.agentQuestion && (
                  <div className="mb-2">
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Agent Question
                    </h4>
                    <p className="text-sm bg-white/30 dark:bg-black/20 p-2 rounded italic">
                      "{finding.agentQuestion}"
                    </p>
                  </div>
                )}

                {finding.expectedBehavior && (
                  <div className="mb-2">
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Expected
                    </h4>
                    <p className="text-sm">{finding.expectedBehavior}</p>
                  </div>
                )}

                {finding.actualBehavior && (
                  <div className="mb-2">
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Actual
                    </h4>
                    <p className="text-sm">{finding.actualBehavior}</p>
                  </div>
                )}

                {finding.recommendation && (
                  <div className="mt-3 p-2 bg-white/70 dark:bg-black/30 rounded">
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Recommendation
                    </h4>
                    <p className="text-sm">{finding.recommendation}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
