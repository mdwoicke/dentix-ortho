/**
 * Test Run History Page
 * Analytics dashboard with trend charts and run history
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { PageHeader } from '../../components/layout';
import { Button, Card } from '../../components/ui';
import {
  fetchTestRuns,
  selectTestRuns,
  selectTestMonitorLoading,
} from '../../store/slices/testMonitorSlice';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

export function TestRunHistory() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const runs = useAppSelector(selectTestRuns);
  const loading = useAppSelector(selectTestMonitorLoading);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);

  // Fetch runs on mount
  useEffect(() => {
    dispatch(fetchTestRuns({}));
  }, [dispatch]);

  // Auto-poll test runs when any run is "running"
  useEffect(() => {
    const hasRunningRun = runs.some(run => run.status === 'running');
    const pollInterval = hasRunningRun ? 3000 : 30000; // 3s when running, 30s otherwise

    const intervalId = setInterval(() => {
      dispatch(fetchTestRuns({}));
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [dispatch, runs]);

  // Prepare trend data
  const trendData = runs
    .slice()
    .reverse()
    .map((run) => ({
      date: new Date(run.startedAt).toLocaleDateString(),
      runId: run.runId,
      passRate: run.totalTests > 0 ? Math.round((run.passed / run.totalTests) * 100) : 0,
      passed: run.passed,
      failed: run.failed,
      total: run.totalTests,
    }));

  // Calculate averages
  const avgPassRate = trendData.length > 0
    ? Math.round(trendData.reduce((acc, d) => acc + d.passRate, 0) / trendData.length)
    : 0;

  // Toggle run selection for comparison
  const toggleRunSelection = (runId: string) => {
    setSelectedRuns((prev) => {
      if (prev.includes(runId)) {
        return prev.filter((id) => id !== runId);
      }
      if (prev.length < 2) {
        return [...prev, runId];
      }
      return [prev[1], runId]; // Replace oldest selection
    });
  };

  // Handle view run
  const handleViewRun = (runId: string) => {
    navigate(`/test-monitor/run/${runId}`);
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <PageHeader
        title="Test Run History"
        subtitle="View trends and analyze test execution history"
      />

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        {/* Pass Rate Trend */}
        <Card>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Pass Rate Trend
            </h3>
            <div className="h-64">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--tooltip-bg, #1f2937)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'var(--tooltip-color, #fff)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="passRate"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981' }}
                      name="Pass Rate (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  No data available
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Results by Category */}
        <Card>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Results Distribution
            </h3>
            <div className="h-64">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData.slice(-10)}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--tooltip-bg, #1f2937)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'var(--tooltip-color, #fff)',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="passed" stackId="a" fill="#10b981" name="Passed" />
                    <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  No data available
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Card>
          <div className="p-4 text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{runs.length}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Runs</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{avgPassRate}%</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Avg Pass Rate</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {runs.filter((r) => r.status === 'completed' && r.passed === r.totalTests).length}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Perfect Runs</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {runs.filter((r) => r.status === 'failed').length}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Failed Runs</div>
          </div>
        </Card>
      </div>

      {/* Run History Table */}
      <Card className="mt-6 flex-1 min-h-0">
        <div className="p-4 h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Run History
            </h3>
            <div className="flex items-center gap-2">
              {selectedRuns.length === 2 && (
                <Button variant="secondary" size="sm">
                  Compare Selected
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No test runs yet
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Select
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Run ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Tests
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Pass Rate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Started
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {runs.map((run) => {
                    const passRate = run.totalTests > 0
                      ? Math.round((run.passed / run.totalTests) * 100)
                      : 0;
                    const isSelected = selectedRuns.includes(run.runId);

                    return (
                      <tr key={run.runId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRunSelection(run.runId)}
                            className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-gray-900 dark:text-white">
                            {run.runId.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full inline-flex items-center gap-1.5 ${
                            run.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            run.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                            run.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {run.status === 'running' && (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                              </span>
                            )}
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {run.passed}/{run.totalTests}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  passRate === 100 ? 'bg-green-500' :
                                  passRate >= 70 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${passRate}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-600 dark:text-gray-300">{passRate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {new Date(run.startedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewRun(run.runId)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
