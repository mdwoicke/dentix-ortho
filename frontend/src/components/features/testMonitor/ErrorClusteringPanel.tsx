/**
 * ErrorClusteringPanel Component
 *
 * Groups similar test failures together for easier debugging.
 * Enables debugging 10 similar failures as 1 pattern instead of individually.
 */

import { useState, useEffect } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';

interface Finding {
  id: number;
  runId: string;
  testId: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  affectedStep: string;
  agentQuestion: string;
  expectedBehavior: string;
  actualBehavior: string;
  recommendation: string;
  status: string;
  createdAt: string;
}

interface ErrorCluster {
  clusterId: string;
  pattern: string;
  patternType: 'timeout' | 'api_error' | 'validation' | 'prompt_issue' | 'tool_issue' | 'unknown';
  count: number;
  severity: string;
  affectedTests: string[];
  affectedTestNames: string[];
  sampleFinding: Finding;
  rootCauseHypothesis: string;
  suggestedAction: string;
  findings: Finding[];
}

interface ClusteringResult {
  runId: string;
  totalFindings: number;
  totalClusters: number;
  clusters: ErrorCluster[];
  unclustered: Finding[];
}

interface ErrorClusteringPanelProps {
  runId: string;
  onTestSelect?: (testId: string) => void;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700',
  low: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700',
};

const patternTypeLabels: Record<string, { label: string; icon: string; color: string }> = {
  timeout: { label: 'Timeout', icon: 'clock', color: 'text-red-600 dark:text-red-400' },
  api_error: { label: 'API Error', icon: 'server', color: 'text-orange-600 dark:text-orange-400' },
  validation: { label: 'Validation', icon: 'check-x', color: 'text-yellow-600 dark:text-yellow-400' },
  prompt_issue: { label: 'Prompt Issue', icon: 'message', color: 'text-purple-600 dark:text-purple-400' },
  tool_issue: { label: 'Tool Issue', icon: 'tool', color: 'text-blue-600 dark:text-blue-400' },
  unknown: { label: 'Unknown', icon: 'question', color: 'text-gray-600 dark:text-gray-400' },
};

export function ErrorClusteringPanel({ runId, onTestSelect }: ErrorClusteringPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clusteringResult, setClusteringResult] = useState<ClusteringResult | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchClusters = async () => {
      if (!runId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/test-monitor/runs/${runId}/error-clusters`);
        const data = await response.json();

        if (data.success) {
          setClusteringResult(data.data);
        } else {
          setError(data.error || 'Failed to fetch error clusters');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    fetchClusters();
  }, [runId]);

  const toggleCluster = (clusterId: string) => {
    setExpandedClusters(prev => ({ ...prev, [clusterId]: !prev[clusterId] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
        <span className="ml-2 text-sm text-gray-500">Analyzing error patterns...</span>
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

  if (!clusteringResult || clusteringResult.totalFindings === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No errors to cluster. All tests passed!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            Error Pattern Analysis
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {clusteringResult.totalFindings} finding{clusteringResult.totalFindings !== 1 ? 's' : ''} grouped into {clusteringResult.totalClusters} pattern{clusteringResult.totalClusters !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            {Math.round((1 - clusteringResult.totalClusters / Math.max(clusteringResult.totalFindings, 1)) * 100)}% reduction
          </span>
        </div>
      </div>

      {/* Clusters List */}
      <div className="space-y-3">
        {clusteringResult.clusters.map((cluster) => {
          const isExpanded = expandedClusters[cluster.clusterId];
          const patternInfo = patternTypeLabels[cluster.patternType];

          return (
            <div
              key={cluster.clusterId}
              className={cn(
                'border rounded-lg overflow-hidden transition-all',
                severityColors[cluster.severity]
              )}
            >
              {/* Cluster Header */}
              <div
                onClick={() => toggleCluster(cluster.clusterId)}
                className="flex items-center justify-between p-3 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Count Badge */}
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/50 dark:bg-black/20 font-bold text-lg">
                    {cluster.count}
                  </span>

                  <div className="min-w-0 flex-1">
                    {/* Pattern Type & Severity */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('text-xs font-medium', patternInfo.color)}>
                        {patternInfo.label}
                      </span>
                      <span className="text-xs font-medium uppercase px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20">
                        {cluster.severity}
                      </span>
                    </div>

                    {/* Pattern Title */}
                    <p className="font-medium text-sm truncate">
                      {cluster.pattern}
                    </p>
                  </div>
                </div>

                {/* Affected Tests Count */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {cluster.affectedTests.length} test{cluster.affectedTests.length !== 1 ? 's' : ''} affected
                  </span>
                  <span className="text-gray-600 dark:text-gray-300 text-xl">
                    {isExpanded ? '−' : '+'}
                  </span>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-3 bg-white/50 dark:bg-black/20 border-t border-current/20 space-y-4">
                  {/* Root Cause Hypothesis */}
                  <div>
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1 flex items-center gap-1">
                      <span>Root Cause Hypothesis</span>
                    </h4>
                    <p className="text-sm bg-white/30 dark:bg-black/10 p-2 rounded">
                      {cluster.rootCauseHypothesis}
                    </p>
                  </div>

                  {/* Suggested Action */}
                  <div>
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Suggested Action
                    </h4>
                    <p className="text-sm bg-white/30 dark:bg-black/10 p-2 rounded">
                      {cluster.suggestedAction}
                    </p>
                  </div>

                  {/* Affected Tests */}
                  <div>
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Affected Tests ({cluster.affectedTests.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {cluster.affectedTestNames.map((testName, idx) => (
                        <button
                          key={cluster.affectedTests[idx]}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTestSelect?.(cluster.affectedTests[idx]);
                          }}
                          className="text-xs px-2 py-1 rounded bg-white/50 dark:bg-black/20 hover:bg-white/70 dark:hover:bg-black/30 transition-colors truncate max-w-[200px]"
                          title={testName}
                        >
                          {testName}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sample Finding */}
                  <div>
                    <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                      Sample Finding
                    </h4>
                    <div className="text-sm bg-white/30 dark:bg-black/10 p-2 rounded space-y-2">
                      {cluster.sampleFinding.description && (
                        <div>
                          <span className="font-medium">Description: </span>
                          <span>{cluster.sampleFinding.description}</span>
                        </div>
                      )}
                      {cluster.sampleFinding.agentQuestion && (
                        <div>
                          <span className="font-medium">Agent Question: </span>
                          <span className="italic">"{cluster.sampleFinding.agentQuestion}"</span>
                        </div>
                      )}
                      {cluster.sampleFinding.actualBehavior && (
                        <div>
                          <span className="font-medium">Actual Behavior: </span>
                          <span>{cluster.sampleFinding.actualBehavior}</span>
                        </div>
                      )}
                      {cluster.sampleFinding.expectedBehavior && (
                        <div>
                          <span className="font-medium">Expected: </span>
                          <span>{cluster.sampleFinding.expectedBehavior}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* All Findings in Cluster (if more than 1) */}
                  {cluster.findings.length > 1 && (
                    <div>
                      <h4 className="text-xs font-medium uppercase opacity-70 mb-1">
                        All {cluster.findings.length} Findings in Pattern
                      </h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {cluster.findings.map((finding, idx) => (
                          <div
                            key={finding.id}
                            className="text-xs p-2 bg-white/30 dark:bg-black/10 rounded flex justify-between items-center"
                          >
                            <span className="truncate flex-1">
                              {idx + 1}. {finding.title}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onTestSelect?.(finding.testId);
                              }}
                              className="text-blue-600 dark:text-blue-400 hover:underline ml-2"
                            >
                              View Test
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ErrorClusteringPanel;
