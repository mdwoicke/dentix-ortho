/**
 * TestHealthWidget Component
 * Displays goal test health metrics on the Dashboard
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui';
import { Button } from '../../ui';
import { ROUTES } from '../../../utils/constants';
import { get } from '../../../services/api/client';

interface DashboardStats {
  lastRun: {
    runId: string;
    status: 'running' | 'completed' | 'failed' | 'aborted';
    passRate: number;
    passed: number;
    failed: number;
    total: number;
    completedAt: string | null;
  } | null;
  recentFailures: Array<{
    testId: string;
    testName: string;
    runId: string;
    failedAt: string;
  }>;
  trend: {
    direction: 'up' | 'down' | 'stable';
    changePercent: number;
  };
  isExecutionActive: boolean;
}

export function TestHealthWidget() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats();
    // Refresh every 30 seconds to catch any running executions
    const interval = setInterval(fetchDashboardStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await get<{ success: boolean; data: DashboardStats }>(
        '/test-monitor/dashboard-stats'
      );
      setStats(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load test stats');
      console.error('Failed to fetch dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!stats?.lastRun) return 'bg-gray-100 dark:bg-gray-700';
    if (stats.isExecutionActive) return 'bg-blue-100 dark:bg-blue-900/30';
    if (stats.lastRun.status === 'failed' || stats.lastRun.passRate < 50) {
      return 'bg-red-100 dark:bg-red-900/30';
    }
    if (stats.lastRun.passRate < 80) {
      return 'bg-yellow-100 dark:bg-yellow-900/30';
    }
    return 'bg-green-100 dark:bg-green-900/30';
  };

  const getStatusIcon = () => {
    if (!stats?.lastRun) return '?';
    if (stats.isExecutionActive) return (
      <span className="inline-block animate-spin">&#9696;</span>
    );
    if (stats.lastRun.passRate >= 80) return '✓';
    if (stats.lastRun.passRate >= 50) return '!';
    return '✗';
  };

  const getStatusText = () => {
    if (!stats?.lastRun) return 'No tests run yet';
    if (stats.isExecutionActive) return 'Tests running...';
    return `${stats.lastRun.passRate.toFixed(0)}% pass rate`;
  };

  const getTrendIndicator = () => {
    if (!stats?.trend) return null;
    const { direction, changePercent } = stats.trend;
    if (direction === 'stable') return null;

    const arrow = direction === 'up' ? '↑' : '↓';
    const color = direction === 'up' ? 'text-green-600' : 'text-red-600';
    return (
      <span className={`text-xs ${color} ml-2`}>
        {arrow} {changePercent.toFixed(0)}%
      </span>
    );
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'In progress';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <Card className={`${getStatusColor()} border-none`}>
        <div className="text-center py-4">
          <div className="animate-pulse">
            <div className="h-8 w-8 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2"></div>
            <div className="h-4 w-24 bg-gray-300 dark:bg-gray-600 rounded mx-auto mb-2"></div>
            <div className="h-3 w-32 bg-gray-300 dark:bg-gray-600 rounded mx-auto"></div>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-gray-100 dark:bg-gray-700 border-none">
        <div className="text-center py-4">
          <div className="text-2xl mb-2">!</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Test Health
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {error}
          </p>
          <Button size="sm" variant="ghost" onClick={fetchDashboardStats}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${getStatusColor()} border-none transition-colors duration-300`}>
      <div className="text-center py-4">
        <div className="text-3xl mb-2">{getStatusIcon()}</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Test Health
          {getTrendIndicator()}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          {getStatusText()}
        </p>
        {stats?.lastRun && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
            {stats.lastRun.passed}/{stats.lastRun.total} passed
            {' · '}
            {formatRelativeTime(stats.lastRun.completedAt)}
          </p>
        )}

        {/* Recent failures preview */}
        {stats?.recentFailures && stats.recentFailures.length > 0 && (
          <div className="text-left mt-3 mb-3 px-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Recent failures:
            </p>
            {stats.recentFailures.slice(0, 2).map((failure, idx) => (
              <p
                key={idx}
                className="text-xs text-gray-600 dark:text-gray-400 truncate"
                title={failure.testName}
              >
                • {failure.testName}
              </p>
            ))}
            {stats.recentFailures.length > 2 && (
              <p className="text-xs text-gray-500 dark:text-gray-500">
                +{stats.recentFailures.length - 2} more
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-center">
          <Button
            size="sm"
            onClick={() => navigate(ROUTES.TEST_MONITOR_GOAL_CASES)}
          >
            {stats?.isExecutionActive ? 'View Progress' : 'Run Tests'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(ROUTES.TEST_MONITOR_HISTORY)}
          >
            History
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default TestHealthWidget;
