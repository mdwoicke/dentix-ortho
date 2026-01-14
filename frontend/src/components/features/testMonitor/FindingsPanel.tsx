/**
 * FindingsPanel Component
 * Displays findings and issues discovered during test execution
 * Now with code navigation links for quick access to relevant files
 */

import { useState } from 'react';
import { Spinner } from '../../ui';
import type { Finding } from '../../../types/testMonitor.types';
import { cn } from '../../../utils/cn';

interface NavigationLink {
  type: 'system_prompt' | 'tool_code' | 'test_case' | 'nodered_flow';
  label: string;
  filePath: string;
  description: string;
}

interface FindingsPanelProps {
  findings: Finding[];
  loading?: boolean;
  onNavigate?: (filePath: string, searchPattern?: string) => void;
}

/**
 * Generate navigation links based on finding type
 */
function getNavigationLinks(finding: Finding): NavigationLink[] {
  const links: NavigationLink[] = [];

  switch (finding.type) {
    case 'prompt-issue':
      links.push({
        type: 'system_prompt',
        label: 'System Prompt',
        filePath: 'docs/v1/Chord_Cloud9_SystemPrompt.md',
        description: 'Edit the system prompt to fix this issue',
      });
      break;

    case 'tool-issue':
      links.push({
        type: 'tool_code',
        label: 'Scheduling Tool',
        filePath: 'docs/v1/schedule_appointment_dso_Tool.json',
        description: 'Edit the scheduling tool JavaScript',
      });
      links.push({
        type: 'tool_code',
        label: 'Patient Tool',
        filePath: 'docs/v1/chord_dso_patient_Tool.json',
        description: 'Edit the patient tool JavaScript',
      });
      break;

    case 'bug':
    case 'regression':
      links.push({
        type: 'system_prompt',
        label: 'System Prompt',
        filePath: 'docs/v1/Chord_Cloud9_SystemPrompt.md',
        description: 'Review the system prompt for this scenario',
      });
      links.push({
        type: 'nodered_flow',
        label: 'Node-RED Flow',
        filePath: 'docs/v1/nodered_Cloud9_flows.json',
        description: 'Check the API flow configuration',
      });
      break;

    case 'enhancement':
      links.push({
        type: 'system_prompt',
        label: 'System Prompt',
        filePath: 'docs/v1/Chord_Cloud9_SystemPrompt.md',
        description: 'Add new behavior to the system prompt',
      });
      break;
  }

  // Always add test case link if we have a test ID
  if (finding.testId) {
    links.push({
      type: 'test_case',
      label: 'Test Definition',
      filePath: `test-agent/src/tests/scenarios/`,
      description: 'View the test case definition',
    });
  }

  return links;
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

const linkTypeColors: Record<string, string> = {
  system_prompt: 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:hover:bg-purple-800',
  tool_code: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800',
  test_case: 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800',
  nodered_flow: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900 dark:text-orange-200 dark:hover:bg-orange-800',
};

const linkTypeIcons: Record<string, string> = {
  system_prompt: 'System Prompt',
  tool_code: 'Tool Code',
  test_case: 'Test',
  nodered_flow: 'Flow',
};

export function FindingsPanel({ findings, loading, onNavigate }: FindingsPanelProps) {
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
                      User Input
                    </h4>
                    <p className="text-sm bg-blue-50/50 dark:bg-blue-900/20 p-2 rounded border-l-2 border-blue-400">
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
                      Agent Response
                    </h4>
                    <p className="text-sm bg-green-50/50 dark:bg-green-900/20 p-2 rounded border-l-2 border-green-400">
                      {finding.actualBehavior}
                    </p>
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

                {/* Navigation Links */}
                {(() => {
                  const navLinks = getNavigationLinks(finding);
                  if (navLinks.length === 0) return null;

                  return (
                    <div className="mt-3 pt-3 border-t border-current/10">
                      <h4 className="text-xs font-medium uppercase opacity-70 mb-2">
                        Navigate to Code
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {navLinks.map((link, idx) => (
                          <button
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigate) {
                                onNavigate(link.filePath, finding.agentQuestion);
                              } else {
                                // Fallback: copy path to clipboard
                                navigator.clipboard.writeText(link.filePath);
                              }
                            }}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                              linkTypeColors[link.type]
                            )}
                            title={`${link.description}\n${link.filePath}`}
                          >
                            <span>{link.label}</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                        Click to view file content
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
