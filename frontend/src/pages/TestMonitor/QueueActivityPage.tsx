/**
 * QueueActivityPage - Async Queue Operations Viewer
 * Displays queue_activity_log data grouped by operation with detail views
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import type { QueueOperation, QueueEvent, QueueStats } from '../../services/api/testMonitorApi';

// ============================================================================
// TIMEZONE CONSTANTS
// ============================================================================

interface TimezoneOption {
  value: string;
  label: string;
  abbrev: string;
}

const US_TIMEZONES: TimezoneOption[] = [
  { value: 'America/Chicago', label: 'Central Time', abbrev: 'CT' },
  { value: 'America/New_York', label: 'Eastern Time', abbrev: 'ET' },
  { value: 'America/Denver', label: 'Mountain Time', abbrev: 'MT' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', abbrev: 'PT' },
  { value: 'America/Anchorage', label: 'Alaska Time', abbrev: 'AKT' },
  { value: 'America/Honolulu', label: 'Hawaii Time', abbrev: 'HT' },
  { value: 'UTC', label: 'UTC', abbrev: 'UTC' },
];

const QUEUE_ACTIVITY_TIMEZONE_STORAGE_KEY = 'queue_activity_timezone';

function getStoredTimezone(): string {
  try {
    const stored = localStorage.getItem(QUEUE_ACTIVITY_TIMEZONE_STORAGE_KEY);
    if (stored && US_TIMEZONES.some(tz => tz.value === stored)) {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  // Default to Central Time
  return 'America/Chicago';
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    expired: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  const icons: Record<string, string> = {
    completed: '\u2705',
    failed: '\u274C',
    pending: '\u23F3',
    expired: '\u23F0',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${colors[status] || 'bg-gray-100'}`}>
      {icons[status]} {status.toUpperCase()}
    </span>
  );
}

// ============================================================================
// EVENT TYPE BADGE COMPONENT
// ============================================================================

function EventTypeBadge({ eventType }: { eventType: string }) {
  const colors: Record<string, string> = {
    queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    retry_attempt: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    expired: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[eventType] || 'bg-gray-100'}`}>
      {eventType.replace('_', ' ')}
    </span>
  );
}

// ============================================================================
// OPERATION CARD COMPONENT
// ============================================================================

interface OperationCardProps {
  operation: QueueOperation;
  isSelected: boolean;
  onClick: () => void;
  timezone: string;
}

function OperationCard({ operation, isSelected, onClick, timezone }: OperationCardProps) {
  const truncatedId = operation.operationId.length > 20
    ? `${operation.operationId.slice(0, 10)}...${operation.operationId.slice(-6)}`
    : operation.operationId;

  return (
    <div
      onClick={onClick}
      className={`
        p-4 border rounded-lg cursor-pointer transition-all
        ${isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="font-mono text-xs text-gray-500 dark:text-gray-400" title={operation.operationId}>
          {truncatedId}
        </span>
        <StatusBadge status={operation.finalStatus} />
      </div>

      <div className="mb-2">
        <div className="font-medium text-gray-900 dark:text-white truncate">
          {operation.patientName || 'Unknown Patient'}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Queued: {operation.startedAt ? formatTimestamp(operation.startedAt, timezone) : 'N/A'}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{operation.totalAttempts} attempt{operation.totalAttempts !== 1 ? 's' : ''}</span>
        <span>{operation.eventCount} event{operation.eventCount !== 1 ? 's' : ''}</span>
      </div>

      {operation.durationMs != null && (
        <div className="mt-1 text-xs text-gray-400">
          Duration: {formatDuration(operation.durationMs)}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// OPERATION DETAIL PANEL
// ============================================================================

interface OperationDetailPanelProps {
  operation: QueueOperation;
  events: QueueEvent[];
  loading: boolean;
  onViewFullLog: () => void;
  timezone: string;
}

function OperationDetailPanel({ operation, events, loading, onViewFullLog, timezone }: OperationDetailPanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // Helper to render a detail row with optional copy
  const DetailRow = ({ label, value, copyable = false, mono = false }: {
    label: string;
    value: string | number | null | undefined;
    copyable?: boolean;
    mono?: boolean;
  }) => {
    if (value === null || value === undefined || value === '') return null;
    const displayValue = String(value);
    const fieldKey = `${label}-${displayValue}`;

    return (
      <div className="flex justify-between items-start py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}:</span>
        <div className="flex items-center gap-1 ml-2 min-w-0">
          <span
            className={`text-xs text-gray-900 dark:text-white text-right break-all ${mono ? 'font-mono' : ''} ${copyable ? 'cursor-pointer hover:text-primary-600' : ''}`}
            onClick={copyable ? () => copyToClipboard(displayValue, fieldKey) : undefined}
            title={copyable ? `Click to copy: ${displayValue}` : displayValue}
          >
            {displayValue}
          </span>
          {copyable && copiedField === fieldKey && (
            <span className="text-xs text-green-600">Copied!</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900 dark:text-white">Operation Detail</h3>
          <StatusBadge status={operation.finalStatus} />
        </div>

        {/* Operation Summary */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-1">
          <DetailRow label="Operation ID" value={operation.operationId} copyable mono />
          <DetailRow label="Patient Name" value={operation.patientName} />
          <DetailRow label="Patient GUID" value={operation.patientGuid} copyable mono />
          <DetailRow label="Appointment Date" value={operation.appointmentDatetime} />
          <DetailRow label="Appointment GUID" value={operation.appointmentGuid} copyable mono />
          <DetailRow label="Attempts" value={`${operation.totalAttempts} / ${operation.maxAttempts}`} />
          <DetailRow label="Events" value={operation.eventCount} />
          <DetailRow label="Queued At" value={operation.startedAt ? formatTimestamp(operation.startedAt, timezone) : null} />
          <DetailRow label="Ended At" value={operation.endedAt ? formatTimestamp(operation.endedAt, timezone) : null} />
          <DetailRow label="Duration" value={operation.durationMs != null ? formatDuration(operation.durationMs) : null} />
        </div>

        {operation.finalError && (
          <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300 max-h-24 overflow-auto">
            <strong>Final Error:</strong>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px]">{operation.finalError}</pre>
          </div>
        )}
      </div>

      {/* Event Timeline */}
      <div className="flex-1 overflow-auto p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">
          Event Timeline ({events.length} events)
        </h4>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border-l-4 border-l-gray-300 dark:border-l-gray-600"
                style={{
                  borderLeftColor: event.eventType === 'completed' ? '#22c55e' :
                                   event.eventType === 'failed' ? '#ef4444' :
                                   event.eventType === 'expired' ? '#6b7280' :
                                   event.eventType === 'queued' ? '#3b82f6' :
                                   event.eventType === 'retry_attempt' ? '#f97316' : undefined
                }}
              >
                {/* Event Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <EventTypeBadge eventType={event.eventType} />
                    {event.attemptNumber > 0 && (
                      <span className="text-xs text-gray-500">#{event.attemptNumber}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 font-mono">
                    {formatTimestamp(event.eventTimestamp, timezone)}
                  </span>
                </div>

                {/* Event Details Grid */}
                <div className="grid grid-cols-1 gap-0.5 text-xs">
                  {/* Record Info */}
                  <DetailRow label="Record ID" value={event.id} mono />
                  <DetailRow label="Max Attempts" value={event.maxAttempts} />

                  {/* Patient & Appointment Info (if different from operation level) */}
                  {event.patientName && (
                    <DetailRow label="Patient Name" value={event.patientName} />
                  )}
                  {event.appointmentDatetime && (
                    <DetailRow label="Appt DateTime" value={event.appointmentDatetime} />
                  )}

                  {/* GUIDs */}
                  {event.patientGuid && (
                    <DetailRow label="Patient GUID" value={event.patientGuid} copyable mono />
                  )}
                  {event.appointmentGuid && (
                    <DetailRow label="Appt GUID" value={event.appointmentGuid} copyable mono />
                  )}
                  {event.scheduleViewGuid && (
                    <DetailRow label="Schedule View" value={event.scheduleViewGuid} copyable mono />
                  )}
                  {event.scheduleColumnGuid && (
                    <DetailRow label="Schedule Column" value={event.scheduleColumnGuid} copyable mono />
                  )}
                  {event.appointmentTypeGuid && (
                    <DetailRow label="Appt Type GUID" value={event.appointmentTypeGuid} copyable mono />
                  )}

                  {/* Timing */}
                  {event.backoffMs != null && event.backoffMs > 0 && (
                    <DetailRow label="Backoff" value={formatDuration(event.backoffMs)} />
                  )}
                  {event.nextRetryAt && (
                    <DetailRow label="Next Retry" value={formatTimestamp(event.nextRetryAt, timezone)} />
                  )}
                  {event.durationMs != null && event.durationMs > 0 && (
                    <DetailRow label="Duration" value={formatDuration(event.durationMs)} />
                  )}
                  {event.createdAt && (
                    <DetailRow label="Created At" value={formatTimestamp(event.createdAt, timezone)} />
                  )}

                  {/* Metadata */}
                  {event.uui && (
                    <DetailRow label="UUI" value={event.uui} copyable mono />
                  )}
                  {event.sessionId && (
                    <DetailRow label="Session ID" value={event.sessionId} copyable mono />
                  )}
                  {event.source && (
                    <DetailRow label="Source" value={event.source} />
                  )}

                  {/* Error */}
                  {event.errorMessage && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 rounded text-xs text-red-700 dark:text-red-300">
                      <strong>Error:</strong>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] max-h-20 overflow-auto">
                        {event.errorMessage}
                      </pre>
                    </div>
                  )}

                  {/* Cloud9 Response */}
                  {event.cloud9Response && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded text-xs text-blue-700 dark:text-blue-300">
                      <strong>Cloud9 Response:</strong>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] max-h-20 overflow-auto">
                        {event.cloud9Response}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onViewFullLog}
          className="w-full px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/30"
        >
          View Full JSON Log
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// FULL LOG MODAL
// ============================================================================

interface FullLogModalProps {
  operation: QueueOperation;
  events: QueueEvent[];
  onClose: () => void;
}

function FullLogModal({ operation, events, onClose }: FullLogModalProps) {
  const [copied, setCopied] = useState(false);

  const copyJson = () => {
    const data = { operation, events };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Full Operation Log
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={copyJson}
              className="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded"
            >
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded overflow-x-auto">
            {JSON.stringify({ operation, events }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimestamp(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function QueueActivityPage() {
  // State
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [operations, setOperations] = useState<QueueOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedOperation, setSelectedOperation] = useState<QueueOperation | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<QueueEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [hoursFilter, setHoursFilter] = useState<number | undefined>(undefined);
  const [patientFilter, setPatientFilter] = useState('');

  // Modal state
  const [showFullLog, setShowFullLog] = useState(false);

  // Timezone state
  const [timezone, setTimezone] = useState<string>(getStoredTimezone);

  // Handle timezone change
  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
    try {
      localStorage.setItem(QUEUE_ACTIVITY_TIMEZONE_STORAGE_KEY, newTimezone);
    } catch {
      // Ignore localStorage errors
    }
  };

  // Get current timezone info for display
  const currentTimezoneInfo = US_TIMEZONES.find(tz => tz.value === timezone) || US_TIMEZONES[0];

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsData, opsData] = await Promise.all([
        testMonitorApi.getQueueStats(hoursFilter),
        testMonitorApi.getQueueOperations({
          status: statusFilter as any || undefined,
          hours: hoursFilter,
          patientName: patientFilter || undefined,
          limit: 100,
        }),
      ]);

      setStats(statsData);
      setOperations(opsData.operations);
      setTotal(opsData.total);

      // Auto-select first operation if none selected
      if (opsData.operations.length > 0 && !selectedOperation) {
        handleSelectOperation(opsData.operations[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch queue activity');
    } finally {
      setLoading(false);
    }
  }, [hoursFilter, statusFilter, patientFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle operation selection
  const handleSelectOperation = async (operation: QueueOperation) => {
    setSelectedOperation(operation);
    setDetailLoading(true);

    try {
      const detail = await testMonitorApi.getQueueOperationDetail(operation.operationId);
      setSelectedEvents(detail.events);
    } catch (err: any) {
      console.error('Failed to fetch operation detail:', err);
      setSelectedEvents([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // Render loading state
  if (loading && operations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Queue Activity</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Monitor async booking queue operations and retries
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Timezone Selector */}
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <select
              value={timezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {US_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {tz.label} ({tz.abbrev})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-6 gap-4 mb-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalOperations}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400">Completed</div>
            <div className="text-xl font-bold text-green-600">{stats.completedOperations}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400">Failed</div>
            <div className="text-xl font-bold text-red-600">{stats.failedOperations}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400">Pending</div>
            <div className="text-xl font-bold text-yellow-600">{stats.pendingOperations}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400">Success Rate</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{stats.successRate}%</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400">Avg Attempts</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{stats.averageAttempts}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
        </select>

        <select
          value={hoursFilter || ''}
          onChange={(e) => setHoursFilter(e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="">All Time</option>
          <option value="1">Last Hour</option>
          <option value="6">Last 6 Hours</option>
          <option value="24">Last 24 Hours</option>
          <option value="72">Last 3 Days</option>
          <option value="168">Last Week</option>
        </select>

        <input
          type="text"
          value={patientFilter}
          onChange={(e) => setPatientFilter(e.target.value)}
          placeholder="Filter by patient name..."
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 w-48"
        />

        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} operation{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Main content - 2 panel layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Operations List */}
        <div className="w-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-medium text-gray-900 dark:text-white">Operations</h3>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {operations.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                No operations found
              </div>
            ) : (
              operations.map((op) => (
                <OperationCard
                  key={op.operationId}
                  operation={op}
                  isSelected={selectedOperation?.operationId === op.operationId}
                  onClick={() => handleSelectOperation(op)}
                  timezone={timezone}
                />
              ))
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="w-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {selectedOperation ? (
            <OperationDetailPanel
              operation={selectedOperation}
              events={selectedEvents}
              loading={detailLoading}
              onViewFullLog={() => setShowFullLog(true)}
              timezone={timezone}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              Select an operation to view details
            </div>
          )}
        </div>
      </div>

      {/* Full Log Modal */}
      {showFullLog && selectedOperation && (
        <FullLogModal
          operation={selectedOperation}
          events={selectedEvents}
          onClose={() => setShowFullLog(false)}
        />
      )}
    </div>
  );
}

export default QueueActivityPage;
