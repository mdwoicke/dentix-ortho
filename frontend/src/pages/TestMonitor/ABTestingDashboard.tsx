/**
 * A/B Testing Dashboard Page
 * Monitor and manage A/B experiments for prompt and tool variants
 */

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '../../components/layout';
import { Card, Button, Spinner } from '../../components/ui';
import { API_CONFIG } from '../../utils/constants';

// Types
interface ABExperiment {
  experimentId: string;
  name: string;
  description?: string;
  hypothesis: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'aborted';
  experimentType: string;
  variants: Array<{ variantId: string; role: string; weight: number }>;
  testIds: string[];
  minSampleSize: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  winningVariantId?: string;
  conclusion?: string;
}

interface ABVariant {
  variantId: string;
  variantType: string;
  targetFile: string;
  name: string;
  description?: string;
  isBaseline: boolean;
  createdAt: string;
  createdBy: string;
}

interface ABStats {
  experiments: {
    total: number;
    byStatus: Record<string, number>;
  };
  variants: number;
  runs: number;
  recentExperiments: Array<{
    experimentId: string;
    name: string;
    status: string;
    createdAt: string;
  }>;
}

interface VariantStats {
  variantId: string;
  variantRole: string;
  totalRuns: number;
  passedRuns: number;
  passRate: number;
  avgTurns: number;
  avgDurationMs: number;
}

interface ExperimentAnalysis {
  controlPassRate: number;
  treatmentPassRate: number;
  lift: number;
  liftPercent: number;
  pValue: number;
  isSignificant: boolean;
  confidenceLevel: number;
  controlSamples: number;
  treatmentSamples: number;
  minSampleSize: number;
  hasEnoughSamples: boolean;
}

interface ExperimentDetail {
  experiment: ABExperiment;
  variantStats: VariantStats[];
  analysis: ExperimentAnalysis | null;
}

// Status badge colors
const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  aborted: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

export function ABTestingDashboard() {
  const [stats, setStats] = useState<ABStats | null>(null);
  const [experiments, setExperiments] = useState<ABExperiment[]>([]);
  const [variants, setVariants] = useState<ABVariant[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'experiments' | 'variants'>('experiments');

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/test-monitor/ab/stats`);
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch A/B stats:', err);
    }
  }, []);

  // Fetch experiments
  const fetchExperiments = useCallback(async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/test-monitor/ab/experiments`);
      const data = await response.json();
      if (data.success) {
        setExperiments(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch experiments:', err);
      setError('Failed to load experiments');
    }
  }, []);

  // Fetch variants
  const fetchVariants = useCallback(async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/test-monitor/ab/variants`);
      const data = await response.json();
      if (data.success) {
        setVariants(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch variants:', err);
    }
  }, []);

  // Fetch experiment detail
  const fetchExperimentDetail = useCallback(async (experimentId: string) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/test-monitor/ab/experiments/${experimentId}`);
      const data = await response.json();
      if (data.success) {
        setSelectedExperiment(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch experiment detail:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchExperiments(), fetchVariants()]);
      setLoading(false);
    };
    loadData();
  }, [fetchStats, fetchExperiments, fetchVariants]);

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  // Format duration
  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading A/B Testing data...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <PageHeader
        title="Advanced"
        subtitle="Statistical experiments and CLI-driven testing"
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Experiments</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats?.experiments.total || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Running</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats?.experiments.byStatus?.running || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Variants</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats?.variants || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Runs</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats?.runs || 0}
          </div>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('experiments')}
          className={`pb-2 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'experiments'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Experiments ({experiments.length})
        </button>
        <button
          onClick={() => setActiveTab('variants')}
          className={`pb-2 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'variants'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Variants ({variants.length})
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Experiments List / Variants List */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {activeTab === 'experiments' ? 'Experiments' : 'Variants'}
          </h3>

          {activeTab === 'experiments' ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {experiments.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p>No experiments yet.</p>
                  <p className="text-sm mt-2">
                    Create one via CLI: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">npm run ab-create --fix &lt;fixId&gt;</code>
                  </p>
                </div>
              ) : (
                experiments.map((exp) => (
                  <div
                    key={exp.experimentId}
                    onClick={() => fetchExperimentDetail(exp.experimentId)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedExperiment?.experiment.experimentId === exp.experimentId
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {exp.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {exp.experimentId}
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[exp.status]}`}>
                        {exp.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                      {exp.hypothesis}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
                      <span>Tests: {exp.testIds.join(', ')}</span>
                      <span>{formatDate(exp.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {variants.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No variants created yet.
                </div>
              ) : (
                variants.map((variant) => (
                  <div
                    key={variant.variantId}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {variant.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                          {variant.variantId}
                        </div>
                      </div>
                      {variant.isBaseline && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                          Baseline
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      {variant.targetFile}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
                      <span>Type: {variant.variantType}</span>
                      <span>By: {variant.createdBy}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>

        {/* Experiment Detail */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Experiment Details
          </h3>

          {!selectedExperiment ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Select an experiment to view details
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {selectedExperiment.experiment.name}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedExperiment.experiment.hypothesis}
                </p>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[selectedExperiment.experiment.status]}`}>
                  {selectedExperiment.experiment.status}
                </span>
                {selectedExperiment.experiment.startedAt && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Started: {formatDate(selectedExperiment.experiment.startedAt)}
                  </span>
                )}
              </div>

              {/* Variant Stats */}
              {selectedExperiment.variantStats.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Variant Performance
                  </h5>
                  <div className="space-y-2">
                    {selectedExperiment.variantStats.map((vs) => (
                      <div
                        key={vs.variantId}
                        className="p-3 rounded bg-gray-50 dark:bg-gray-800"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-900 dark:text-white capitalize">
                            {vs.variantRole}
                          </span>
                          <span className={`font-bold ${vs.passRate >= 80 ? 'text-green-600' : vs.passRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {vs.passRate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span>{vs.passedRuns}/{vs.totalRuns} passed</span>
                          <span>Avg turns: {vs.avgTurns.toFixed(1)}</span>
                          <span>Avg time: {formatDuration(vs.avgDurationMs)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis */}
              {selectedExperiment.analysis && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Statistical Analysis
                  </h5>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded bg-gray-50 dark:bg-gray-800">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Control</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {selectedExperiment.analysis.controlPassRate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedExperiment.analysis.controlSamples}/{selectedExperiment.analysis.minSampleSize} samples
                      </div>
                    </div>
                    <div className="p-3 rounded bg-gray-50 dark:bg-gray-800">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Treatment</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {selectedExperiment.analysis.treatmentPassRate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedExperiment.analysis.treatmentSamples}/{selectedExperiment.analysis.minSampleSize} samples
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 p-3 rounded bg-gray-50 dark:bg-gray-800">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">Lift</span>
                      <span className={`font-bold ${selectedExperiment.analysis.lift >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedExperiment.analysis.lift >= 0 ? '+' : ''}{selectedExperiment.analysis.lift.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-700 dark:text-gray-300">p-value</span>
                      <span className="font-mono text-sm text-gray-900 dark:text-white">
                        {selectedExperiment.analysis.pValue.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-700 dark:text-gray-300">Significant</span>
                      <span className={`font-bold ${selectedExperiment.analysis.isSignificant ? 'text-green-600' : 'text-gray-500'}`}>
                        {selectedExperiment.analysis.isSignificant ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-700 dark:text-gray-300">Confidence</span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {selectedExperiment.analysis.confidenceLevel.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {!selectedExperiment.analysis.hasEnoughSamples && (
                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded text-sm">
                      Need more samples. Run more iterations via CLI:
                      <code className="block mt-1 bg-yellow-100 dark:bg-yellow-900/40 px-2 py-1 rounded text-xs">
                        npx ts-node src/index.ts ab-run {selectedExperiment.experiment.experimentId} -n 10 -c 3
                      </code>
                    </div>
                  )}
                </div>
              )}

              {/* Conclusion */}
              {selectedExperiment.experiment.conclusion && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Conclusion
                  </h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedExperiment.experiment.conclusion}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchExperimentDetail(selectedExperiment.experiment.experimentId)}
                >
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* CLI Commands Reference */}
      <Card className="mt-6 p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          CLI Commands
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <code className="text-primary-600 dark:text-primary-400">ab-create --fix &lt;fixId&gt;</code>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Create experiment from a fix</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <code className="text-primary-600 dark:text-primary-400">ab-run &lt;experimentId&gt; -n 10 -c 3</code>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Run iterations (-n count, -c concurrency, -r retries)</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <code className="text-primary-600 dark:text-primary-400">ab-status &lt;experimentId&gt;</code>
            <p className="text-gray-600 dark:text-gray-400 mt-1">View experiment status</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <code className="text-primary-600 dark:text-primary-400">ab-conclude &lt;experimentId&gt; --adopt</code>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Conclude and adopt winner</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
