/**
 * Production Test Data Tracker Page
 * Track patients and appointments created in Production for cleanup
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ApiAgentChatPanel from '../../../components/features/apiAgent/ApiAgentChatPanel';
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
  type StreamingCancellationSummary,
} from '../../../services/api/testMonitorApi';
import { CancellationProgressModal } from '../../../components/features/testMonitor';
import { getLangfuseConfigs, getAppSettings, type LangfuseConfigProfile as LangfuseConfigResponse } from '../../../services/api/appSettingsApi';
import { Card, Button, Input, Select, Badge, Spinner, Modal } from '../../../components/ui';
import { useToast } from '../../../hooks/useToast';
import { ROUTES } from '../../../utils/constants';

export function ProdTestTrackerPage() {
  // Chat panel state
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Data state
  const [records, setRecords] = useState<ProdTestRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ProdTestRecordStats | null>(null);
  const [langfuseConfigs, setLangfuseConfigs] = useState<LangfuseConfigResponse[]>([]);
  const [langfuseProjectId, setLangfuseProjectId] = useState<string | undefined>(undefined);

  // UI state
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  // Cancellation modal state
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [cancellationRecords, setCancellationRecords] = useState<ProdTestRecord[]>([]);

  // Filters
  const [recordType, setRecordType] = useState<'patient' | 'appointment' | ''>('');
  const [status, setStatus] = useState<string>('');
  const [langfuseConfigId, setLangfuseConfigId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>('cloud9_created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Group by patient view
  const [groupByPatient, setGroupByPatient] = useState(true);
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set());

  // Timezone for display (default to CST)
  const [timezone, setTimezone] = useState<string>('America/Chicago');
  const US_TIMEZONES = [
    { value: 'America/New_York', label: 'Eastern (EST/EDT)' },
    { value: 'America/Chicago', label: 'Central (CST/CDT)' },
    { value: 'America/Denver', label: 'Mountain (MST/MDT)' },
    { value: 'America/Los_Angeles', label: 'Pacific (PST/PDT)' },
  ];

  // Helper to format date in selected timezone
  const formatInTimezone = (dateStr: string) => {
    if (!dateStr) return '-';
    // Append 'Z' to mark as UTC if no timezone indicator present
    const utcDate = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    return new Date(utcDate).toLocaleString('en-US', { timeZone: timezone });
  };

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
  // When groupByPatient is enabled, fetch all records to ensure proper grouping
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // When grouping, fetch all records (up to 2000) to ensure appointments are grouped with their patients
      const effectiveLimit = groupByPatient ? 2000 : pageSize;
      const effectiveOffset = groupByPatient ? 0 : (page - 1) * pageSize;

      const [recordsRes, statsRes] = await Promise.all([
        getProdTestRecords({
          recordType: recordType || undefined,
          status: status || undefined,
          langfuseConfigId: langfuseConfigId || undefined,
          limit: effectiveLimit,
          offset: effectiveOffset,
          sortBy,
          sortOrder,
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
  }, [recordType, status, langfuseConfigId, page, sortBy, sortOrder, groupByPatient]);

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

  // Fetch Langfuse project ID from app settings (for URL linking)
  useEffect(() => {
    getAppSettings()
      .then(settings => {
        if (settings.langfuseProjectId?.value) {
          setLangfuseProjectId(settings.langfuseProjectId.value);
        }
      })
      .catch(err => console.warn('Failed to fetch app settings:', err));
  }, []);

  // Helper to get Langfuse session URL
  const getLangfuseSessionUrl = useCallback((sessionId: string, configId: number | null | undefined): string | null => {
    if (!sessionId || !langfuseProjectId) return null;
    // Find the matching config to get the host
    const config = langfuseConfigs.find(c => c.id === configId);
    if (!config?.host) {
      // Try to find default config
      const defaultConfig = langfuseConfigs.find(c => c.isDefault);
      if (!defaultConfig?.host) return null;
      return `${defaultConfig.host}/project/${langfuseProjectId}/sessions/${sessionId}`;
    }
    return `${config.host}/project/${langfuseProjectId}/sessions/${sessionId}`;
  }, [langfuseConfigs, langfuseProjectId]);

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

  // Handle bulk cancel - opens the cancellation modal
  const handleBulkCancel = () => {
    const ids = Array.from(selectedIds);
    const appointmentRecords = ids
      .map(id => records.find(r => r.id === id))
      .filter((r): r is ProdTestRecord =>
        r !== undefined && r.record_type === 'appointment' && r.status === 'active'
      );

    if (appointmentRecords.length === 0) {
      toast.showError('No active appointments selected');
      return;
    }

    // Open the cancellation modal with the selected records
    setCancellationRecords(appointmentRecords);
    setShowCancellationModal(true);
  };

  // Handle cancellation modal completion
  const handleCancellationComplete = (summary: StreamingCancellationSummary) => {
    toast.showSuccess(`Cancelled ${summary.succeeded} of ${summary.total} appointments`);
    setSelectedIds(new Set());
    loadData();
  };

  // Handle cancellation modal close
  const handleCancellationModalClose = () => {
    setShowCancellationModal(false);
    setCancellationRecords([]);
    // Refresh data in case operation completed in background
    loadData();
  };

  // Handle single appointment cancel via modal
  const handleSingleCancelWithModal = (record: ProdTestRecord) => {
    setCancellationRecords([record]);
    setShowCancellationModal(true);
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

  // Chair display helper - maps known GUIDs to friendly names
  const CHAIR_MAP: Record<string, string> = {
    '07687884-7e37-49aa-8028-d43b751c9034': 'Chair 8',
  };
  const getChairDisplay = (scheduleColumnGuid: string | null): string => {
    if (!scheduleColumnGuid) return '-';
    return CHAIR_MAP[scheduleColumnGuid.toLowerCase()] || scheduleColumnGuid.substring(0, 8) + '...';
  };

  // Parse child name from note field (format: "Child: TestJake, DOB: 01/10/2012")
  const parseChildNameFromNote = (note: string | null | undefined): string | null => {
    if (!note) return null;
    const match = note.match(/Child:\s*([^,]+)/i);
    return match ? match[1].trim() : null;
  };

  // Get Call Trace URL for a record (links to Analysis page which supports trace ID)
  const getTraceUrl = (record: ProdTestRecord): string | null => {
    if (!record.trace_id) return null;
    // Link to internal Analysis page with configId for proper lookup
    const configParam = record.langfuse_config_id ? `&configId=${record.langfuse_config_id}` : '';
    return `${ROUTES.TEST_MONITOR_ANALYSIS}?traceId=${record.trace_id}${configParam}`;
  };

  // Group records by FAMILY (family_id or last name) with parent + children nested underneath
  // v72 model: Each child has their own patient record with is_child=true
  interface ChildRecord {
    firstName: string;
    patientGuid: string;
    isChild: boolean;                    // v72: true if this is a child record
    parentPatientGuid: string | null;    // v72: reference to parent's patient_guid
    patientRecord: ProdTestRecord | null;
    appointments: ProdTestRecord[];
  }

  interface FamilyGroup {
    familyKey: string;           // Unique key for grouping (family_id, last name, or guid:xxx)
    familyName: string;          // Display name (last name or 'Unknown')
    familyId: string | null;     // v72: actual family_id from DB (null for legacy records)
    parent: ProdTestRecord | null; // v72: parent record (is_child=false)
    children: ChildRecord[];     // Individual children in this family
    patientGuids: string[];      // All GUIDs for this family
    totalPatients: number;
    totalAppointments: number;
    latestCreatedAt: string;
    parentCreatedAt: string;     // First patient record's created date (for sorting by created)
  }

  const groupedRecords = useMemo(() => {
    if (!groupByPatient) return null;

    const families = new Map<string, FamilyGroup>();

    // Helper to parse date string to timestamp (handles mixed formats)
    const parseTimestamp = (dateStr: string | null | undefined): number => {
      if (!dateStr) return 0;
      const normalized = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
      const ts = new Date(normalized).getTime();
      return isNaN(ts) ? 0 : ts;
    };

    // Helper to get family key
    // v72: Prefer family_id when available for accurate grouping
    // Fallback to last name, then patient_guid for ungroupable records
    const getFamilyKey = (record: ProdTestRecord): string => {
      // v72: Use family_id when available (most reliable for new records)
      if (record.family_id) {
        return `family:${record.family_id}`;
      }
      // Fallback to last name for legacy records
      const lastName = (record.patient_last_name || '').trim().toLowerCase();
      if (lastName) {
        return lastName;
      }
      // Fall back to patient_guid when no last name - ensures different patients don't get lumped together
      return `guid:${record.patient_guid}`;
    };

    // Helper to get child key (first name + patient_guid for uniqueness)
    const getChildKey = (record: ProdTestRecord): string => {
      const firstName = (record.patient_first_name || '').trim().toLowerCase();
      // Use patient_guid as part of key to ensure appointments for different patients
      // with same/missing first names don't get merged
      return `${firstName}:${record.patient_guid}`;
    };

    // First pass: organize records by family, then by individual
    for (const record of records) {
      const familyKey = getFamilyKey(record);
      const childKey = getChildKey(record);

      if (!families.has(familyKey)) {
        // Determine display name based on key type
        const isFamilyIdKey = familyKey.startsWith('family:');
        const isGuidKey = familyKey.startsWith('guid:');
        families.set(familyKey, {
          familyKey,
          familyName: (isFamilyIdKey || isGuidKey) ? (record.patient_last_name || 'Unknown') : (record.patient_last_name || 'Unknown'),
          familyId: record.family_id || null,  // v72: actual family_id
          parent: null,  // v72: will be set if we find a parent record
          children: [],
          patientGuids: [],
          totalPatients: 0,
          totalAppointments: 0,
          latestCreatedAt: record.cloud9_created_at || record.created_at,
          parentCreatedAt: '',
        });
      }

      const family = families.get(familyKey)!;

      // v72: Check if this is a parent record (is_child=false and record_type='patient')
      if (record.record_type === 'patient' && !record.is_child) {
        // This is the parent patient record
        family.parent = record;
        family.totalPatients++;
        const patientDate = record.cloud9_created_at || record.created_at;
        const patientTs = parseTimestamp(patientDate);
        const parentTs = parseTimestamp(family.parentCreatedAt);
        if (!family.parentCreatedAt || patientTs < parentTs) {
          family.parentCreatedAt = patientDate;
        }
        // Track parent's GUID
        if (!family.patientGuids.includes(record.patient_guid)) {
          family.patientGuids.push(record.patient_guid);
        }
      } else if (record.record_type === 'patient' && record.is_child) {
        // v72: This is a child's patient record
        let child = family.children.find(c => c.patientGuid === record.patient_guid);
        if (!child) {
          child = {
            firstName: record.patient_first_name || 'Unknown',
            patientGuid: record.patient_guid,
            isChild: true,
            parentPatientGuid: record.parent_patient_guid,
            patientRecord: null,
            appointments: [],
          };
          family.children.push(child);
        }
        child.patientRecord = record;
        family.totalPatients++;
        if (!family.patientGuids.includes(record.patient_guid)) {
          family.patientGuids.push(record.patient_guid);
        }
      } else if (record.record_type === 'appointment') {
        // Check if this appointment is booked under the parent's GUID (parent-as-patient model)
        const isParentGuid = family.parent && record.patient_guid === family.parent.patient_guid;

        // For parent-as-patient appointments, use child name from note as the grouping key
        let childName: string | null = null;
        if (isParentGuid && record.note) {
          const match = record.note.match(/^Child:\s*([^|]+)/i);
          if (match) childName = match[1].trim();
        }

        // Find existing child entry: by child name (parent-as-patient) or by patient_guid
        let child: ChildRecord | undefined;
        if (childName) {
          child = family.children.find(c => c.firstName.toLowerCase() === childName!.toLowerCase());
        } else {
          child = family.children.find(c => c.patientGuid === record.patient_guid);
        }

        if (!child) {
          const isChildAppointment = !!childName || record.is_child ||
            (family.parent && record.patient_guid !== family.parent.patient_guid);
          child = {
            firstName: childName || record.patient_first_name || 'Unknown',
            patientGuid: record.patient_guid,
            isChild: !!isChildAppointment,
            parentPatientGuid: record.parent_patient_guid,
            patientRecord: null,
            appointments: [],
          };
          family.children.push(child);
          if (!family.patientGuids.includes(record.patient_guid)) {
            family.patientGuids.push(record.patient_guid);
          }
        }
        child.appointments.push(record);
        family.totalAppointments++;
      } else {
        // Legacy behavior: patient record without is_child flag (old parent-as-patient model)
        // Check if this is a duplicate of the existing parent (same name, different GUID)
        const isDuplicateParent = record.record_type === 'patient' && family.parent &&
          (record.patient_first_name || '').trim().toLowerCase() === (family.parent.patient_first_name || '').trim().toLowerCase() &&
          record.patient_guid !== family.parent.patient_guid;

        if (isDuplicateParent) {
          // Merge: track the extra GUID but don't create a separate child row
          if (!family.patientGuids.includes(record.patient_guid)) {
            family.patientGuids.push(record.patient_guid);
          }
        } else {
          let child = family.children.find(c => c.patientGuid === record.patient_guid);
          if (!child) {
            child = {
              firstName: record.patient_first_name || 'Unknown',
              patientGuid: record.patient_guid,
              isChild: false,
              parentPatientGuid: null,
              patientRecord: null,
              appointments: [],
            };
            family.children.push(child);
          }
          if (record.record_type === 'patient') {
            child.patientRecord = record;
            family.totalPatients++;
            const patientDate = record.cloud9_created_at || record.created_at;
            const patientTs = parseTimestamp(patientDate);
            const parentTs = parseTimestamp(family.parentCreatedAt);
            if (!family.parentCreatedAt || patientTs < parentTs) {
              family.parentCreatedAt = patientDate;
            }
          }
          if (!family.patientGuids.includes(record.patient_guid)) {
            family.patientGuids.push(record.patient_guid);
          }
        }
      }

      // Track latest cloud9_created_at for sorting (using numeric comparison for mixed date formats)
      const recordDate = record.cloud9_created_at || record.created_at;
      const recordTs = parseTimestamp(recordDate);
      const latestTs = parseTimestamp(family.latestCreatedAt);
      if (recordTs > latestTs) {
        family.latestCreatedAt = recordDate;
      }
    }

    // Convert to array and sort families by latestCreatedAt (most recent Langfuse trace time)
    const sortedFamilies = Array.from(families.values()).sort((a, b) => {
      const timeA = parseTimestamp(a.latestCreatedAt);
      const timeB = parseTimestamp(b.latestCreatedAt);
      // desc = newest first (higher timestamp first)
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    // Sort children and appointments within each family
    for (const family of sortedFamilies) {
      // Sort children by first name
      family.children.sort((a, b) => a.firstName.localeCompare(b.firstName));
      // Sort appointments within each child (newest first by cloud9_created_at)
      for (const child of family.children) {
        child.appointments.sort((a, b) => {
          const timeA = parseTimestamp(a.cloud9_created_at || a.created_at);
          const timeB = parseTimestamp(b.cloud9_created_at || b.created_at);
          // desc = newest first (higher timestamp first)
          return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });
      }
    }

    return sortedFamilies;
  }, [records, groupByPatient, sortBy, sortOrder]);

  // Toggle patient group expansion (using familyKey for uniqueness)
  const togglePatientExpand = (familyKey: string) => {
    const newExpanded = new Set(expandedPatients);
    if (newExpanded.has(familyKey)) {
      newExpanded.delete(familyKey);
    } else {
      newExpanded.add(familyKey);
    }
    setExpandedPatients(newExpanded);
  };

  // Expand/collapse all
  const expandAll = () => {
    if (groupedRecords) {
      setExpandedPatients(new Set(groupedRecords.map(g => g.familyKey)));
    }
  };

  const collapseAll = () => {
    setExpandedPatients(new Set());
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
          <Card
            className={`p-4 cursor-pointer transition-all hover:ring-2 hover:ring-blue-500 ${
              recordType === 'patient' && status === 'active' ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
            onClick={() => {
              if (recordType === 'patient' && status === 'active') {
                // Clear filter if already active
                setRecordType('');
                setStatus('');
              } else {
                setRecordType('patient');
                setStatus('active');
              }
              setPage(1);
            }}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Patients</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.totalPatients}
            </div>
            <div className="text-xs text-green-600">{stats.activePatients} active</div>
          </Card>
          <Card
            className={`p-4 cursor-pointer transition-all hover:ring-2 hover:ring-blue-500 ${
              recordType === 'appointment' && status === 'active' ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
            onClick={() => {
              if (recordType === 'appointment' && status === 'active') {
                // Clear filter if already active
                setRecordType('');
                setStatus('');
              } else {
                setRecordType('appointment');
                setStatus('active');
              }
              setPage(1);
            }}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Appointments</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.totalAppointments}
            </div>
            <div className="text-xs text-green-600">{stats.activeAppointments} active</div>
          </Card>
          <Card
            className={`p-4 cursor-pointer transition-all hover:ring-2 hover:ring-yellow-500 ${
              recordType === 'appointment' && status === 'cancelled' ? 'ring-2 ring-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : ''
            }`}
            onClick={() => {
              if (recordType === 'appointment' && status === 'cancelled') {
                // Clear filter if already active
                setRecordType('');
                setStatus('');
              } else {
                setRecordType('appointment');
                setStatus('cancelled');
              }
              setPage(1);
            }}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400">Cancelled</div>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.cancelledAppointments}
            </div>
          </Card>
          <Card
            className={`p-4 cursor-pointer transition-all hover:ring-2 hover:ring-gray-500 ${
              status === 'deleted' ? 'ring-2 ring-gray-500 bg-gray-100 dark:bg-gray-700' : ''
            }`}
            onClick={() => {
              if (status === 'deleted') {
                // Clear filter if already active
                setRecordType('');
                setStatus('');
              } else {
                setRecordType('');
                setStatus('deleted');
              }
              setPage(1);
            }}
          >
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
          {/* Group Filter (Langfuse Instance) */}
          <div className="flex-1 min-w-[200px]">
            <Select
              value={langfuseConfigId?.toString() || ''}
              onChange={(value) => { setLangfuseConfigId(value ? parseInt(value, 10) : null); setPage(1); }}
              options={[
                { value: '', label: 'All Instances' },
                ...langfuseConfigs.map(cfg => ({
                  value: cfg.id.toString(),
                  label: cfg.name + (cfg.isDefault ? ' (Prod)' : cfg.isSandbox ? ' (Sandbox)' : ''),
                })),
              ]}
            />
          </div>
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
          {/* Sort By */}
          <div className="flex-1 min-w-[160px]">
            <Select
              value={sortBy}
              onChange={(value) => { setSortBy(value); setPage(1); }}
              options={[
                { value: 'cloud9_created_at', label: 'Sort: Created' },
                { value: 'patient_last_name', label: 'Sort: Last Name' },
                { value: 'patient_first_name', label: 'Sort: First Name' },
                { value: 'appointment_datetime', label: 'Sort: Appt Date' },
                { value: 'status', label: 'Sort: Status' },
                { value: 'location_name', label: 'Sort: Location' },
              ]}
            />
          </div>
          {/* Sort Order Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            {sortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
          </Button>
          {/* Group by Family Toggle */}
          <Button
            variant={groupByPatient ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setGroupByPatient(!groupByPatient)}
            title="Group records by family (last name) with children and appointments nested"
          >
            {groupByPatient ? '👨‍👩‍👧‍👦 By Family' : '📋 Flat'}
          </Button>
          {groupByPatient && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={expandAll} title="Expand all">
                ⊕
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll} title="Collapse all">
                ⊖
              </Button>
            </div>
          )}
          <div className="flex-1 min-w-[180px]">
            <Select
              value={timezone}
              onChange={(value) => setTimezone(value)}
              options={US_TIMEZONES}
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
                    Chair
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
                {groupByPatient && groupedRecords ? (
                  // Grouped view: families with parent + children and their appointments
                  groupedRecords.map((family) => {
                    const isExpanded = expandedPatients.has(family.familyKey);
                    // Get all record IDs for this family (for bulk selection)
                    const allFamilyIds: number[] = [];
                    if (family.parent) allFamilyIds.push(family.parent.id);
                    family.children.forEach(child => {
                      if (child.patientRecord) allFamilyIds.push(child.patientRecord.id);
                      child.appointments.forEach(a => allFamilyIds.push(a.id));
                    });

                    // v72: Determine if this is a v72 family (has family_id) or legacy
                    const isV72Family = !!family.familyId;
                    const childCount = family.children.filter(c => c.isChild).length;
                    const hasParent = !!family.parent;

                    // Find session_id and langfuse_config_id from any record in the family
                    const familySessionRecord = family.parent?.session_id ? family.parent
                      : family.children.find(c => c.patientRecord?.session_id)?.patientRecord
                      ?? family.children.flatMap(c => c.appointments).find(a => a.session_id)
                      ?? null;
                    const familySessionId = familySessionRecord?.session_id || null;
                    const familyLangfuseConfigId = familySessionRecord?.langfuse_config_id || null;
                    const familySessionUrl = familySessionId ? getLangfuseSessionUrl(familySessionId, familyLangfuseConfigId) : null;

                    return (
                      <React.Fragment key={family.familyKey}>
                        {/* Family Header Row */}
                        <tr
                          className="bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 cursor-pointer"
                          onClick={() => togglePatientExpand(family.familyKey)}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={allFamilyIds.length > 0 && allFamilyIds.every(id => selectedIds.has(id))}
                              onChange={() => {
                                const allSelected = allFamilyIds.every(id => selectedIds.has(id));
                                const newSelected = new Set(selectedIds);
                                if (allSelected) {
                                  allFamilyIds.forEach(id => newSelected.delete(id));
                                } else {
                                  allFamilyIds.forEach(id => newSelected.add(id));
                                }
                                setSelectedIds(newSelected);
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                          </td>
                          <td className="px-4 py-3" colSpan={2}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="default">Family</Badge>
                              {isV72Family && <Badge variant="info" className="text-xs">v72</Badge>}
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                {family.familyName || 'Unknown'}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({hasParent ? '1 parent + ' : ''}{childCount > 0 ? `${childCount} child${childCount !== 1 ? 'ren' : ''}` : `${family.children.length} patient${family.children.length !== 1 ? 's' : ''}`}, {family.totalAppointments} appt{family.totalAppointments !== 1 ? 's' : ''})
                              </span>
                              {/* Langfuse Session ID on Family Header */}
                              {familySessionId && (
                                <>
                                <span className="text-gray-400 mx-3">|</span>
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 rounded text-xs" onClick={(e) => e.stopPropagation()}>
                                  <svg className="w-3 h-3 text-orange-600 dark:text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                  </svg>
                                  {familySessionUrl ? (
                                    <a
                                      href={familySessionUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-orange-700 dark:text-orange-300 hover:text-orange-900 dark:hover:text-orange-100 hover:underline max-w-[180px] truncate"
                                      title={`View session in Langfuse: ${familySessionId}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {familySessionId}
                                    </a>
                                  ) : (
                                    <span className="font-mono text-orange-700 dark:text-orange-300 max-w-[180px] truncate" title={familySessionId}>
                                      {familySessionId}
                                    </span>
                                  )}
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      try {
                                        if (navigator.clipboard && navigator.clipboard.writeText) {
                                          await navigator.clipboard.writeText(familySessionId);
                                        } else {
                                          // Fallback for older browsers
                                          const textArea = document.createElement('textarea');
                                          textArea.value = familySessionId;
                                          textArea.style.position = 'fixed';
                                          textArea.style.left = '-9999px';
                                          document.body.appendChild(textArea);
                                          textArea.select();
                                          document.execCommand('copy');
                                          document.body.removeChild(textArea);
                                        }
                                        toast.showSuccess('Session ID copied!');
                                      } catch (err) {
                                        console.error('Copy failed:', err);
                                        // Try fallback on error
                                        try {
                                          const textArea = document.createElement('textarea');
                                          textArea.value = familySessionId;
                                          textArea.style.position = 'fixed';
                                          textArea.style.left = '-9999px';
                                          document.body.appendChild(textArea);
                                          textArea.select();
                                          document.execCommand('copy');
                                          document.body.removeChild(textArea);
                                          toast.showSuccess('Session ID copied!');
                                        } catch (fallbackErr) {
                                          toast.showError('Failed to copy to clipboard');
                                        }
                                      }
                                    }}
                                    className="p-0.5 hover:bg-orange-200 dark:hover:bg-orange-800 rounded transition-colors"
                                    title="Copy session ID"
                                  >
                                    <svg className="w-3 h-3 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                </div>
                                </>
                              )}
                            </div>
                            {family.familyId && (
                              <div className="text-xs text-gray-400 font-mono mt-1">
                                Family ID: {family.familyId}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">-</td>
                          <td className="px-4 py-3 text-sm text-gray-500">-</td>
                          <td className="px-4 py-3">-</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatInTimezone(family.latestCreatedAt)}
                          </td>
                          <td className="px-4 py-3">-</td>
                        </tr>

                        {/* v72: Parent Row (if exists) */}
                        {isExpanded && family.parent && (
                          <tr className="bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                            <td className="px-4 py-2 pl-8">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(family.parent.id)}
                                onChange={() => toggleSelect(family.parent!.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-4 py-2 pl-8">
                              <span className="text-gray-400">├</span>
                            </td>
                            <td className="px-4 py-2" colSpan={2}>
                              <div className="flex items-center gap-2">
                                <Badge variant="info">Parent</Badge>
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {family.parent.patient_first_name} {family.parent.patient_last_name}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 font-mono mt-1 flex items-center gap-2">
                                <span>{family.parent.patient_guid}</span>
                                {family.parent.note && (
                                  <span className="relative group cursor-help">
                                    <svg className="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="absolute left-0 bottom-full mb-2 px-4 py-3 bg-gray-800 text-gray-100 text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 w-80 z-50 shadow-xl border border-gray-700">
                                      <span className="block font-semibold text-blue-400 mb-2">Note</span>
                                      <span className="block leading-relaxed">{family.parent.note.split('|').map((part: string, i: number) => <span key={i} className="block">{part.trim()}</span>)}</span>
                                      <span className="absolute left-4 top-full border-4 border-transparent border-t-gray-800"></span>
                                    </span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {family.parent.location_name || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">-</td>
                            <td className="px-4 py-2">
                              {getStatusBadge(family.parent.status)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {formatInTimezone(family.parent.cloud9_created_at || family.parent.created_at)}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex gap-2">
                                <Link
                                  to={`${ROUTES.PATIENTS}/${family.parent.patient_guid}?environment=production`}
                                  className="text-blue-600 hover:text-blue-800 text-sm"
                                >
                                  View
                                </Link>
                                {getTraceUrl(family.parent) && (
                                  <Link
                                    to={getTraceUrl(family.parent)!}
                                    className="text-blue-500 hover:text-blue-700 text-sm"
                                    title="View call trace"
                                  >
                                    Trace
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Nested Child Rows */}
                        {isExpanded && family.children.map((child, childIndex) => (
                          <React.Fragment key={child.patientGuid}>
                            {/* Child (Patient) Row */}
                            <tr className={child.isChild
                              ? "bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30"
                              : "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"}>
                              <td className="px-4 py-2 pl-8">
                                {child.patientRecord && (
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(child.patientRecord.id)}
                                    onChange={() => toggleSelect(child.patientRecord!.id)}
                                    className="rounded"
                                  />
                                )}
                              </td>
                              <td className="px-4 py-2 pl-8">
                                <span className="text-gray-400">{childIndex === family.children.length - 1 && child.appointments.length === 0 ? '└' : '├'}</span>
                              </td>
                              <td className="px-4 py-2" colSpan={2}>
                                <div className="flex items-center gap-2">
                                  <Badge variant={child.isChild ? 'success' : 'info'}>
                                    {child.isChild ? 'Child' : 'Patient'}
                                  </Badge>
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {child.firstName} {family.familyName}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    ({child.appointments.length} appt{child.appointments.length !== 1 ? 's' : ''})
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 font-mono mt-1 flex items-center gap-2">
                                  <span>{child.patientGuid}</span>
                                  {child.patientRecord?.note && (
                                    <span className="relative group cursor-help">
                                      <svg className="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="absolute left-0 bottom-full mb-2 px-4 py-3 bg-gray-800 text-gray-100 text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 w-80 z-50 shadow-xl border border-gray-700">
                                        <span className="block font-semibold text-blue-400 mb-2">Note</span>
                                        <span className="block leading-relaxed">{child.patientRecord.note.split('|').map((part: string, i: number) => <span key={i} className="block">{part.trim()}</span>)}</span>
                                        <span className="absolute left-4 top-full border-4 border-transparent border-t-gray-800"></span>
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                {child.patientRecord?.location_name || child.appointments[0]?.location_name || '-'}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                {child.appointments[0]?.schedule_column_guid
                                  ? getChairDisplay(child.appointments[0].schedule_column_guid)
                                  : '-'}
                              </td>
                              <td className="px-4 py-2">
                                {child.patientRecord && getStatusBadge(child.patientRecord.status)}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                {child.patientRecord ? formatInTimezone(child.patientRecord.cloud9_created_at || child.patientRecord.created_at) : '-'}
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex gap-2">
                                  <Link
                                    to={`${ROUTES.PATIENTS}/${child.patientGuid}?environment=production`}
                                    className="text-blue-600 hover:text-blue-800 text-sm"
                                  >
                                    View
                                  </Link>
                                  {child.patientRecord && getTraceUrl(child.patientRecord) && (
                                    <Link
                                      to={getTraceUrl(child.patientRecord)!}
                                      className="text-blue-500 hover:text-blue-700 text-sm"
                                      title="View call trace"
                                    >
                                      Trace
                                    </Link>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {/* Nested Appointment Rows for this child */}
                            {child.appointments.map((appt, apptIndex) => {
                              const childName = parseChildNameFromNote(appt.note);
                              const isLastAppt = apptIndex === child.appointments.length - 1;
                              return (
                              <tr key={appt.id} className="bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50">
                                <td className="px-4 py-2 pl-12">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(appt.id)}
                                    onChange={() => toggleSelect(appt.id)}
                                    className="rounded"
                                  />
                                </td>
                                <td className="px-4 py-2 pl-12">
                                  <span className="text-gray-400">{isLastAppt ? '└' : '├'}</span>
                                </td>
                                <td className="px-4 py-2" colSpan={2}>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="warning">Appt</Badge>
                                    {childName && (
                                      <>
                                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                                          {childName}
                                        </span>
                                        <span className="text-gray-400">|</span>
                                      </>
                                    )}
                                    <span className="text-sm text-gray-900 dark:text-gray-100">
                                      {appt.appointment_datetime
                                        ? new Date(appt.appointment_datetime).toLocaleString()
                                        : '-'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                    <span>{appt.appointment_type || '-'}</span>
                                    {appt.note && (
                                      <span className="relative group cursor-help">
                                        <svg className="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="absolute left-0 bottom-full mb-2 px-4 py-3 bg-gray-800 text-gray-100 text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 w-80 z-50 shadow-xl border border-gray-700">
                                          <span className="block font-semibold text-blue-400 mb-2">Note</span>
                                          <span className="block leading-relaxed">{appt.note.split('|').map((part, i) => <span key={i} className="block">{part.trim()}</span>)}</span>
                                          <span className="absolute left-4 top-full border-4 border-transparent border-t-gray-800"></span>
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">
                                  {appt.location_name || '-'}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">
                                  {getChairDisplay(appt.schedule_column_guid)}
                                </td>
                                <td className="px-4 py-2">
                                  {getStatusBadge(appt.status)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">
                                  {formatInTimezone(appt.cloud9_created_at || appt.created_at)}
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex gap-2">
                                    {appt.status === 'active' && (
                                      <Button
                                        size="sm"
                                        variant="warning"
                                        onClick={() => handleSingleCancelWithModal(appt)}
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                    {appt.status === 'active' && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleMarkDeleted(appt.id)}
                                      >
                                        Delete
                                      </Button>
                                    )}
                                    {getTraceUrl(appt) && (
                                      <Link
                                        to={getTraceUrl(appt)!}
                                        className="text-blue-500 hover:text-blue-700 text-sm"
                                        title="View call trace"
                                      >
                                        Trace
                                      </Link>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    );
                  })
                ) : (
                  // Flat view: all records in one list
                  records.map((record) => (
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
                        <div className="text-xs text-gray-500 font-mono flex items-center gap-2">
                          <span>{record.patient_guid}</span>
                          {record.note && (
                            <span className="relative group cursor-help">
                              <svg className="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="absolute left-0 bottom-full mb-2 px-4 py-3 bg-gray-800 text-gray-100 text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 w-80 z-50 shadow-xl border border-gray-700">
                                <span className="block font-semibold text-blue-400 mb-2">Note</span>
                                <span className="block leading-relaxed">{record.note.split('|').map((part: string, i: number) => <span key={i} className="block">{part.trim()}</span>)}</span>
                                <span className="absolute left-4 top-full border-4 border-transparent border-t-gray-800"></span>
                              </span>
                            </span>
                          )}
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
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {record.record_type === 'appointment' ? getChairDisplay(record.schedule_column_guid) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(record.status)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatInTimezone(record.cloud9_created_at || record.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Link
                            to={`${ROUTES.PATIENTS}/${record.patient_guid}?environment=production`}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            View Patient
                          </Link>
                          {record.record_type === 'appointment' && record.status === 'active' && (
                            <Button
                              size="sm"
                              variant="warning"
                              onClick={() => handleSingleCancelWithModal(record)}
                            >
                              Cancel
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
                          {getTraceUrl(record) && (
                            <Link
                              to={getTraceUrl(record)!}
                              className="text-blue-500 hover:text-blue-700 text-sm"
                              title="View call trace"
                            >
                              Trace
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination - hidden when grouping is enabled since all records are loaded */}
        {!groupByPatient && total > pageSize && (
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

        {/* Record count when grouping is enabled */}
        {groupByPatient && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 text-sm text-gray-500">
            Showing all {records.length} records ({groupedRecords?.length || 0} families)
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

      {/* Cancellation Progress Modal */}
      <CancellationProgressModal
        isOpen={showCancellationModal}
        onClose={handleCancellationModalClose}
        records={cancellationRecords.map(r => ({
          id: r.id,
          appointmentGuid: r.appointment_guid,
          patientFirstName: r.patient_first_name,
          patientLastName: r.patient_last_name,
          appointmentDatetime: r.appointment_datetime,
        }))}
        onComplete={handleCancellationComplete}
      />

      {/* API Agent Chat FAB */}
      <button
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full
          bg-indigo-600 hover:bg-indigo-700 text-white
          shadow-lg hover:shadow-xl
          flex items-center justify-center
          transition-all duration-200 hover:scale-105"
        title="Open API Agent Chat"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {/* API Agent Chat Panel */}
      <ApiAgentChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} pageContext="prod-tracker" />
    </div>
  );
}

export default ProdTestTrackerPage;
