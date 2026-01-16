/**
 * Production Test Data Tracker Page
 * Track patients and appointments created in Production for cleanup
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getProdTestRecords,
  getProdTestRecordStats,
  importProdTestRecords,
  cancelProdTestAppointment,
  bulkCancelProdTestAppointments,
  updateProdTestRecordStatus,
  type ProdTestRecord,
  type ProdTestRecordStats,
  type ProdTestRecordImportResult,
} from '../../../services/api/testMonitorApi';
import { getLangfuseConfigs, type LangfuseConfigProfile as LangfuseConfigResponse } from '../../../services/api/appSettingsApi';
import { Card, Button, Input, Select, Badge, Spinner, Modal } from '../../../components/ui';
import { useToast } from '../../../hooks/useToast';
import { ROUTES } from '../../../utils/constants';

export function ProdTestTrackerPage() {
  // Data state
  const [records, setRecords] = useState<ProdTestRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ProdTestRecordStats | null>(null);
  const [langfuseConfigs, setLangfuseConfigs] = useState<LangfuseConfigResponse[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  // Filters
  const [recordType, setRecordType] = useState<'patient' | 'appointment' | ''>('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importConfigId, setImportConfigId] = useState<number | null>(null);
  const [importFromDate, setImportFromDate] = useState('');
  const [importToDate, setImportToDate] = useState('');
  const [importResult, setImportResult] = useState<ProdTestRecordImportResult | null>(null);

  // Selected records for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Toast notifications
  const toast = useToast();

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [recordsRes, statsRes] = await Promise.all([
        getProdTestRecords({
          recordType: recordType || undefined,
          status: status || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        getProdTestRecordStats(),
      ]);
      setRecords(recordsRes.records);
      setTotal(recordsRes.total);
      setStats(statsRes);
    } catch (err: any) {
      toast.showError('Failed to load records: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [recordType, status, page]);

  // Get date 7 days ago in YYYY-MM-DD format (for date input)
  const getDateDaysAgo = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  };

  // Quick import date (for inline import, YYYY-MM-DD format)
  const [quickImportFromDate, setQuickImportFromDate] = useState(getDateDaysAgo(7));

  // Load Langfuse configs
  const loadConfigs = useCallback(async () => {
    try {
      const configs = await getLangfuseConfigs();
      setLangfuseConfigs(configs);
      if (configs.length > 0) {
        setImportConfigId(configs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load Langfuse configs:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadConfigs();
  }, [loadData, loadConfigs]);

  // Handle import (from modal)
  const handleImport = async () => {
    if (!importConfigId || !importFromDate) {
      toast.showError('Please select a config and date range');
      return;
    }

    try {
      setImporting(true);
      const result = await importProdTestRecords({
        configId: importConfigId,
        fromDate: importFromDate,
        toDate: importToDate || undefined,
      });
      setImportResult(result);
      toast.showSuccess(`Imported ${result.patientsFound} patients, ${result.appointmentsFound} appointments`);
      loadData();
    } catch (err: any) {
      toast.showError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // Handle quick import (from inline controls)
  const handleQuickImport = async () => {
    if (!importConfigId || !quickImportFromDate) {
      toast.showError('Please select a config and from date');
      return;
    }

    try {
      setImporting(true);
      const result = await importProdTestRecords({
        configId: importConfigId,
        fromDate: quickImportFromDate,
      });
      toast.showSuccess(`Imported ${result.patientsFound} patients, ${result.appointmentsFound} appointments`);
      loadData();
    } catch (err: any) {
      toast.showError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // Handle cancel appointment
  const handleCancelAppointment = async (id: number) => {
    try {
      setCancelling(id);
      const result = await cancelProdTestAppointment(id);
      if (result.success) {
        toast.showSuccess('Appointment cancelled successfully');
        loadData();
      } else {
        toast.showError(result.message || 'Failed to cancel appointment');
      }
    } catch (err: any) {
      toast.showError('Cancel failed: ' + err.message);
    } finally {
      setCancelling(null);
    }
  };

  // Handle bulk cancel
  const handleBulkCancel = async () => {
    const ids = Array.from(selectedIds);
    const appointmentIds = ids.filter(id => {
      const record = records.find(r => r.id === id);
      return record?.record_type === 'appointment' && record?.status === 'active';
    });

    if (appointmentIds.length === 0) {
      toast.showError('No active appointments selected');
      return;
    }

    try {
      setImporting(true);
      const result = await bulkCancelProdTestAppointments(appointmentIds);
      toast.showSuccess(`Cancelled ${result.summary.succeeded} of ${result.summary.total} appointments`);
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      toast.showError('Bulk cancel failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // Handle mark as deleted
  const handleMarkDeleted = async (id: number) => {
    try {
      await updateProdTestRecordStatus(id, 'deleted', 'Manually marked as deleted');
      toast.showSuccess('Record marked as deleted');
      loadData();
    } catch (err: any) {
      toast.showError('Failed to update status: ' + err.message);
    }
  };

  // Toggle selection
  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  };

  // Status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'cancelled':
        return <Badge variant="warning">Cancelled</Badge>;
      case 'deleted':
        return <Badge variant="default">Deleted</Badge>;
      case 'cleanup_failed':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Production Test Tracker
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Track and clean up test data created in Production
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Patients</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.totalPatients}
            </div>
            <div className="text-xs text-green-600">{stats.activePatients} active</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Appointments</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.totalAppointments}
            </div>
            <div className="text-xs text-green-600">{stats.activeAppointments} active</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Cancelled</div>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.cancelledAppointments}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Cleaned Up</div>
            <div className="text-2xl font-bold text-gray-500">
              {stats.deletedRecords}
            </div>
          </Card>
        </div>
      )}

      {/* Import Controls - Inline (like Call Tracing) */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Config Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Langfuse Instance
            </label>
            <select
              value={importConfigId || ''}
              onChange={(e) => setImportConfigId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="block w-64 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select config...</option>
              {langfuseConfigs.map(cfg => (
                <option key={cfg.id} value={cfg.id}>
                  {cfg.name} {cfg.isDefault ? '(Production)' : cfg.isSandbox ? '(A/B Sandbox)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Import From Date
            </label>
            <input
              type="date"
              value={quickImportFromDate}
              onChange={(e) => setQuickImportFromDate(e.target.value)}
              className="block w-48 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Import Button */}
          <Button
            onClick={handleQuickImport}
            disabled={!importConfigId || importing}
            variant="primary"
          >
            {importing ? <><Spinner size="sm" /> Importing...</> : 'Import'}
          </Button>

          {/* Refresh Button */}
          <Button
            variant="secondary"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? <Spinner size="sm" /> : 'Refresh'}
          </Button>

          {/* Advanced Import (Modal) */}
          <Button variant="ghost" onClick={() => setShowImportModal(true)}>
            Advanced Import
          </Button>
        </div>
      </Card>

      {/* Filters and Bulk Actions */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[150px]">
            <Select
              value={recordType}
              onChange={(value) => { setRecordType(value as '' | 'patient' | 'appointment'); setPage(1); }}
              options={[
                { value: '', label: 'All Types' },
                { value: 'patient', label: 'Patients' },
                { value: 'appointment', label: 'Appointments' },
              ]}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Select
              value={status}
              onChange={(value) => { setStatus(value); setPage(1); }}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'active', label: 'Active' },
                { value: 'cancelled', label: 'Cancelled' },
                { value: 'deleted', label: 'Deleted' },
                { value: 'cleanup_failed', label: 'Cleanup Failed' },
              ]}
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <Button
                variant="warning"
                size="sm"
                onClick={handleBulkCancel}
                disabled={importing}
              >
                Cancel Selected ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Records Table */}
      <Card>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No records found. Import from Langfuse to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === records.length && records.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Appointment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(record.id)}
                        onChange={() => toggleSelect(record.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={record.record_type === 'patient' ? 'info' : 'success'}>
                        {record.record_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {record.patient_first_name} {record.patient_last_name}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">
                        {record.patient_guid}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {record.record_type === 'appointment' && (
                        <>
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {record.appointment_datetime
                              ? new Date(record.appointment_datetime).toLocaleString()
                              : '-'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {record.appointment_type || '-'}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {record.location_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(record.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          to={`${ROUTES.PATIENTS}/${record.patient_guid.toLowerCase()}`}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          View Patient
                        </Link>
                        {record.record_type === 'appointment' && record.status === 'active' && (
                          <Button
                            size="sm"
                            variant="warning"
                            onClick={() => handleCancelAppointment(record.id)}
                            disabled={cancelling === record.id}
                          >
                            {cancelling === record.id ? 'Cancelling...' : 'Cancel'}
                          </Button>
                        )}
                        {record.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleMarkDeleted(record.id)}
                          >
                            Mark Deleted
                          </Button>
                        )}
                        {record.trace_id && (
                          <button
                            onClick={() => navigator.clipboard.writeText(record.trace_id!)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                            title="Copy Trace ID"
                          >
                            Copy Trace
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPage(p => p + 1)}
                disabled={page * pageSize >= total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportResult(null);
        }}
        title="Import from Langfuse"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Langfuse Config
            </label>
            <Select
              value={importConfigId?.toString() || ''}
              onChange={(value) => setImportConfigId(value ? parseInt(value, 10) : null)}
              placeholder="Select config..."
              options={langfuseConfigs.map((config) => ({
                value: config.id.toString(),
                label: config.name,
              }))}
            />
          </div>

          {/* Quick Date Range Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quick Select
            </label>
            <div className="flex gap-2">
              {[
                { days: 7, label: '7 Days' },
                { days: 14, label: '14 Days' },
                { days: 30, label: '30 Days' },
              ].map(({ days, label }) => {
                const fromDate = new Date();
                fromDate.setDate(fromDate.getDate() - days);
                const fromStr = fromDate.toISOString().slice(0, 16);
                const toStr = new Date().toISOString().slice(0, 16);
                const isSelected = importFromDate === fromStr && importToDate === toStr;
                return (
                  <Button
                    key={days}
                    size="sm"
                    variant={isSelected ? 'primary' : 'ghost'}
                    onClick={() => {
                      setImportFromDate(fromStr);
                      setImportToDate(toStr);
                    }}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Date/Time
              </label>
              <Input
                type="datetime-local"
                value={importFromDate}
                onChange={(e) => setImportFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To Date/Time
              </label>
              <Input
                type="datetime-local"
                value={importToDate}
                onChange={(e) => setImportToDate(e.target.value)}
              />
            </div>
          </div>

          {importResult && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <h4 className="font-medium text-green-800 dark:text-green-200">Import Complete</h4>
              <ul className="text-sm text-green-700 dark:text-green-300 mt-2 space-y-1">
                <li className="flex justify-between">
                  <span>Patients imported:</span>
                  <span className="font-medium">{importResult.patientsFound}</span>
                </li>
                <li className="flex justify-between">
                  <span>Appointments imported:</span>
                  <span className="font-medium">{importResult.appointmentsFound}</span>
                </li>
                <li className="flex justify-between text-yellow-700 dark:text-yellow-300">
                  <span>Duplicates skipped:</span>
                  <span className="font-medium">{importResult.duplicatesSkipped}</span>
                </li>
                {importResult.tracesAlreadyImported > 0 && (
                  <li className="flex justify-between text-gray-500">
                    <span>Traces already imported:</span>
                    <span className="font-medium">{importResult.tracesAlreadyImported}</span>
                  </li>
                )}
                <li className="flex justify-between text-gray-400 text-xs pt-1 border-t border-gray-200 dark:border-gray-600 mt-1">
                  <span>Total traces scanned:</span>
                  <span>{importResult.tracesScanned}</span>
                </li>
              </ul>
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                  <span className="font-medium">Errors: {importResult.errors.length}</span>
                  <ul className="mt-1 text-xs max-h-20 overflow-y-auto">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>...and {importResult.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setShowImportModal(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={importing || !importConfigId || !importFromDate}
            >
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ProdTestTrackerPage;
