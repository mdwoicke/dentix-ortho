/**
 * API Testing Page
 * Test Node Red Cloud9 Ortho endpoints AND direct Cloud9 API with sample data and formatted results
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PageHeader } from '../../components/layout';
import { Button, Card, Spinner } from '../../components/ui';
import ApiAgentChatPanel from '../../components/features/apiAgent/ApiAgentChatPanel';

// Types
type TestStatus = 'pending' | 'running' | 'success' | 'error';
type ApiMode = 'nodeRed' | 'cloud9';
type EndpointCategory = 'patient' | 'scheduling' | 'reference' | 'write';

interface TestResult {
  status: TestStatus;
  data?: unknown;
  error?: string;
  duration?: number;
  rawXml?: string;
}

interface EndpointConfig {
  id: string;
  name: string;
  endpoint: string;
  category: EndpointCategory;
  description: string;
  sampleData: Record<string, unknown>;
  formatResult: (data: unknown) => React.ReactNode;
}

interface Cloud9EndpointConfig {
  id: string;
  name: string;
  procedure: string;
  category: EndpointCategory;
  description: string;
  sampleParams: Record<string, string>;
  formatResult: (data: unknown) => React.ReactNode;
}

// Node Red API Configuration
const NODRED_API_CONFIG = {
  baseUrl: '/FabricWorkflow/api/chord',
  auth: {
    username: 'workflowapi',
    password: 'e^@V95&6sAJReTsb5!iq39mIC4HYIV'
  },
  defaults: {
    locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
    providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
    apptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
    scheduleViewGUID: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d',
    scheduleColumnGUID: 'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b',
    testPatientGUID: '865c8fa6-caf8-4e30-b152-82da6e93f33b',  // Chris Aleman - verified in sandbox
    uui: '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV'
  }
};

// Cloud9 Direct API Configuration
// Uses Vite proxy to bypass CORS
type Cloud9Environment = 'sandbox' | 'production';

interface Cloud9ApiConfig {
  baseUrl: string;
  displayUrl: string;
  clientId: string;
  userName: string;
  password: string;
  namespace: string;
  defaults: {
    locationGUID: string;
    providerGUID: string;
    apptTypeGUID: string;
    scheduleViewGUID: string;
    testPatientGUID: string;
  };
}

const CLOUD9_CONFIGS: Record<Cloud9Environment, Cloud9ApiConfig> = {
  sandbox: {
    baseUrl: '/cloud9-api/GetData.ashx',
    displayUrl: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    defaults: {
      locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
      providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
      apptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
      scheduleViewGUID: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d',
      testPatientGUID: '64DA8F5C-7E54-4659-8AE1-7BB6A033D2A5'
    }
  },
  production: {
    baseUrl: '/cloud9-api-prod/GetData.ashx',
    displayUrl: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    defaults: {
      locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
      providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
      apptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
      scheduleViewGUID: '4c9e9333-4951-4eb0-8d97-e1ad83ef422d',
      testPatientGUID: '64DA8F5C-7E54-4659-8AE1-7BB6A033D2A5'
    }
  }
};

// Default config for backward compatibility
const CLOUD9_API_CONFIG = CLOUD9_CONFIGS.sandbox;

// Legacy alias for backward compatibility
const API_CONFIG = NODRED_API_CONFIG;

// Helper to format dates
const formatDateMDY = (daysFromNow: number = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
};

// Reference Data Lookups - Maps GUIDs to display names
// These are populated from Cloud9 API or can be manually added
const GUID_LOOKUPS: {
  appointmentTypes: Record<string, string>;
  scheduleColumns: Record<string, string>;
  scheduleViews: Record<string, string>;
  providers: Record<string, string>;
  locations: Record<string, string>;
} = {
  appointmentTypes: {
    'f6c20c35-9abb-47c2-981a-342996016705': 'New Patient Exam',
    '8fc9d063-ae46-4975-a5ae-734c6efe341a': 'Regular Adjustment',
    'a1b2c3d4-1234-5678-9abc-def012345678': 'Records Appointment',
    '3d8f5e7a-9b1c-4d2e-8f6a-7c3b5e9d1a2f': 'Consultation',
    'b2c3d4e5-2345-6789-abcd-ef0123456789': 'Emergency Visit',
  },
  scheduleColumns: {
    'f0fa4eda-0136-45d5-a5d8-91ad7d0b608a': 'Chair 8',
    'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b': 'Chair 1',
    '5a3b7c9d-4e6f-8a2b-1c3d-5e7f9a1b3c5d': 'Chair 2',
    '7b4c8d0e-5f7a-9b3c-2d4e-6f8a0b2c4d6e': 'Chair 3',
  },
  scheduleViews: {
    '4c9e9333-4951-4eb0-8d97-e1ad83ef422d': 'Main Schedule',
  },
  providers: {
    '79ec29fe-c315-4982-845a-0005baefb5a8': 'Dr. Smith',
  },
  locations: {
    '1070d281-0952-4f01-9a6e-1a2e6926a7db': 'Main Office',
  }
};

// Helper to lookup a GUID and return name, or return the GUID if not found
const lookupGuid = (guid: string, category: keyof typeof GUID_LOOKUPS): string => {
  if (!guid) return '-';
  const name = GUID_LOOKUPS[category][guid.toLowerCase()] || GUID_LOOKUPS[category][guid];
  return name || guid.substring(0, 8) + '...';
};

// Copy Button Component
const CopyButton = ({ value, size = 'sm' }: { value: string; size?: 'sm' | 'xs' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for non-secure contexts (like IP addresses)
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const sizeClasses = size === 'xs' ? 'w-3 h-3' : 'w-4 h-4';
  const buttonClasses = size === 'xs' ? 'p-0.5' : 'p-1';

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`${buttonClasses} hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors inline-flex items-center justify-center`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? (
        <svg className={`${sizeClasses} text-green-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className={`${sizeClasses} text-gray-400 hover:text-gray-600 dark:hover:text-gray-300`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
};

// Copyable Value Component - displays a value with an inline copy button
const CopyableValue = ({ label, value, mono = false }: { label?: string; value: string; mono?: boolean }) => (
  <div className="flex items-center gap-1 group">
    {label && <span className="text-gray-400">{label}:</span>}
    <span className={mono ? 'font-mono' : ''}>{value}</span>
    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
      <CopyButton value={value} size="xs" />
    </span>
  </div>
);

// Component to display a name with copyable GUID - hover to copy the full GUID
const GuidWithName = ({ guid, name, showGuidPreview = false }: { guid: string; name: string; showGuidPreview?: boolean }) => {
  if (!guid) return <span className="text-gray-400">-</span>;

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-gray-900 dark:text-white">{name}</span>
      {showGuidPreview && (
        <span className="text-gray-400 text-xs font-mono ml-1">({guid.substring(0, 8)}...)</span>
      )}
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton value={guid} size="xs" />
      </span>
    </div>
  );
};

// Result Formatters
const PatientListFormatter = ({ data }: { data: unknown }) => {
  const patients = (data as { patients?: Array<Record<string, string>> })?.patients || [];
  if (!patients.length) return <div className="text-gray-500 italic">No patients found</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-left font-medium">GUID</th>
            <th className="px-3 py-2 text-left font-medium">DOB</th>
            <th className="px-3 py-2 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
          {patients.map((p, i) => {
            const guid = p.patientGUID || p.PatientGUID || '';
            return (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-3 py-2">{p.patientName || p.PatientName || 'N/A'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 group">
                    <span className="font-mono text-xs">{guid.substring(0, 12)}...</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <CopyButton value={guid} size="xs" />
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">{p.birthDate || p.BirthDate || p.PatientBirthDate || 'N/A'}</td>
                <td className="px-3 py-2">
                  <CopyButton value={guid} size="sm" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-xs text-gray-500 mt-2">Showing {patients.length} patients</div>
    </div>
  );
};

const PatientDetailFormatter = ({ data }: { data: unknown }) => {
  // Handle nested patient object (from getPatient endpoint)
  const rawData = data as Record<string, unknown>;
  const patient = (rawData?.patient as Record<string, unknown>) || rawData;
  if (!patient || typeof patient !== 'object') return <div className="text-gray-500 italic">No patient data</div>;

  const fields = [
    ['Name', patient.PatientFullName || patient.FullName || patient.fullName || `${patient.FirstName || ''} ${patient.LastName || ''}`],
    ['GUID', patient.PatientGUID || patient.patientGUID],
    ['DOB', patient.PatientBirthDate || patient.BirthDate || patient.birthDate],
    ['Phone', patient.PatientPhone || patient.Phone || patient.phone || patient.HomePhone],
    ['Email', patient.PatientEmail || patient.Email || patient.email],
    ['Gender', patient.PatientGender || patient.Gender],
    ['Provider', patient.PatientOrthodontist || patient.Orthodontist || patient.Provider],
    ['Location', patient.PatientLocation || patient.Location],
  ].filter(([, v]) => v);

  // Fields that should be copyable
  const copyableFields = ['GUID', 'Phone', 'Email'];

  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {fields.map(([label, value]) => (
        <div key={label as string} className="flex items-center gap-1 group">
          <span className="text-gray-500">{label}: </span>
          <span className={`font-medium ${label === 'GUID' ? 'font-mono text-xs' : ''}`}>{String(value)}</span>
          {copyableFields.includes(label as string) && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton value={String(value)} size="xs" />
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// Excel-style Filter Dropdown Component
const FilterDropdown = ({
  label,
  values,
  selectedValues,
  onSelectionChange
}: {
  label: string;
  values: string[];
  selectedValues: Set<string>;
  onSelectionChange: (newSelection: Set<string>) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = selectedValues.size === 0 || selectedValues.size === values.length;
  const someSelected = selectedValues.size > 0 && selectedValues.size < values.length;

  const toggleAll = () => {
    if (allSelected) {
      // Deselect all (which means filter nothing - show all)
      onSelectionChange(new Set());
    } else {
      // Select all
      onSelectionChange(new Set());
    }
  };

  const toggleValue = (value: string) => {
    const newSelection = new Set(selectedValues);
    if (newSelection.has(value)) {
      newSelection.delete(value);
    } else {
      newSelection.add(value);
    }
    // If all are selected, clear the set (means no filter)
    if (newSelection.size === values.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(newSelection);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-1 text-xs border rounded flex items-center justify-between gap-1
                   ${someSelected ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700'}
                   text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600`}
      >
        <span className="truncate">
          {someSelected ? `${selectedValues.size} selected` : 'All'}
        </span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-48 max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          {/* Select All option */}
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs font-medium">(Select All)</span>
          </label>

          {/* Individual values */}
          {values.map((value) => (
            <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedValues.size === 0 || selectedValues.has(value)}
                onChange={() => toggleValue(value)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs truncate" title={value}>{value || '(empty)'}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// Sortable Header Component
const SortableHeader = ({
  label,
  sortKey,
  currentSort,
  onSort
}: {
  label: string;
  sortKey: string;
  currentSort: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
}) => {
  const isActive = currentSort?.key === sortKey;
  const direction = isActive ? currentSort.direction : null;

  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 font-medium mb-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
    >
      <span>{label}</span>
      <span className="text-xs">
        {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '○'}
      </span>
    </button>
  );
};

const SlotsFormatter = ({ data }: { data: unknown }) => {
  const result = data as { slots?: Array<Record<string, string>>; count?: number };
  const slots = result?.slots || [];

  // Filter state - Set of selected values for each column (empty set = all selected)
  const [filters, setFilters] = useState<Record<string, Set<string>>>({
    date: new Set(),
    time: new Set(),
    chair: new Set(),
    apptType: new Set(),
    duration: new Set()
  });

  // Sort state
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  if (!slots.length) return <div className="text-gray-500 italic">No slots available</div>;

  // Process slots with parsed data for filtering
  const processedSlots = slots.map((slot) => {
    const [date, ...timeParts] = (slot.StartTime || '').split(' ');
    const columnGUID = slot.ScheduleColumnGUID || slot.scheduleColumnGUID || '';
    const typeGUID = slot.AppointmentTypeGUID || slot.appointmentTypeGUID || '';
    const columnName = slot.ScheduleColumnDescription || slot.ColumnDescription || lookupGuid(columnGUID, 'scheduleColumns');
    const typeName = slot.AppointmentTypeDescription || slot.AppointmentType || slot.TypeDescription || lookupGuid(typeGUID, 'appointmentTypes');
    const duration = slot.Minutes || '45';

    return {
      ...slot,
      _date: date,
      _time: timeParts.join(' '),
      _columnGUID: columnGUID,
      _typeGUID: typeGUID,
      _columnName: columnName,
      _typeName: typeName,
      _duration: duration
    };
  });

  // Get unique values for each column (sorted)
  const uniqueValues = {
    date: [...new Set(processedSlots.map(s => s._date))].sort(),
    time: [...new Set(processedSlots.map(s => s._time))].sort(),
    chair: [...new Set(processedSlots.map(s => s._columnName))].sort(),
    apptType: [...new Set(processedSlots.map(s => s._typeName))].sort(),
    duration: [...new Set(processedSlots.map(s => s._duration))].sort((a, b) => Number(a) - Number(b))
  };

  // Apply filters - if set is empty, all values pass; otherwise only selected values pass
  const filteredSlots = processedSlots.filter((slot) => {
    const dateMatch = filters.date.size === 0 || filters.date.has(slot._date);
    const timeMatch = filters.time.size === 0 || filters.time.has(slot._time);
    const chairMatch = filters.chair.size === 0 || filters.chair.has(slot._columnName);
    const apptTypeMatch = filters.apptType.size === 0 || filters.apptType.has(slot._typeName);
    const durationMatch = filters.duration.size === 0 || filters.duration.has(slot._duration);
    return dateMatch && timeMatch && chairMatch && apptTypeMatch && durationMatch;
  });

  // Apply sorting
  const sortedSlots = [...filteredSlots].sort((a, b) => {
    if (!sort) return 0;
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (sort.key) {
      case 'date':
        aVal = a._date;
        bVal = b._date;
        break;
      case 'time':
        aVal = a._time;
        bVal = b._time;
        break;
      case 'chair':
        aVal = a._columnName;
        bVal = b._columnName;
        break;
      case 'apptType':
        aVal = a._typeName;
        bVal = b._typeName;
        break;
      case 'duration':
        aVal = parseInt(a._duration) || 0;
        bVal = parseInt(b._duration) || 0;
        break;
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const comparison = String(aVal).localeCompare(String(bVal));
    return sort.direction === 'asc' ? comparison : -comparison;
  });

  const hasFilters = Object.values(filters).some(f => f.size > 0);

  const clearFilters = () => {
    setFilters({
      date: new Set(),
      time: new Set(),
      chair: new Set(),
      apptType: new Set(),
      duration: new Set()
    });
  };

  const updateFilter = (key: string, newSelection: Set<string>) => {
    setFilters(prev => ({ ...prev, [key]: newSelection }));
  };

  const handleSort = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return null;
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="overflow-x-auto">
      {/* Header with count and clear button */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">
          {hasFilters ? (
            <span>Showing {filteredSlots.length} of {slots.length} slots</span>
          ) : (
            <span>{result.count || slots.length} slots found</span>
          )}
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
          >
            Clear Filters
          </button>
        )}
      </div>

      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700">
          {/* Column Headers with Sort and Filter */}
          <tr>
            <th className="px-3 py-2 text-left">
              <SortableHeader label="Date" sortKey="date" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Date"
                values={uniqueValues.date}
                selectedValues={filters.date}
                onSelectionChange={(v) => updateFilter('date', v)}
              />
            </th>
            <th className="px-3 py-2 text-left">
              <SortableHeader label="Time" sortKey="time" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Time"
                values={uniqueValues.time}
                selectedValues={filters.time}
                onSelectionChange={(v) => updateFilter('time', v)}
              />
            </th>
            <th className="px-3 py-2 text-left">
              <SortableHeader label="Chair/Column" sortKey="chair" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Chair"
                values={uniqueValues.chair}
                selectedValues={filters.chair}
                onSelectionChange={(v) => updateFilter('chair', v)}
              />
            </th>
            <th className="px-3 py-2 text-left">
              <SortableHeader label="Appt Type" sortKey="apptType" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Appt Type"
                values={uniqueValues.apptType}
                selectedValues={filters.apptType}
                onSelectionChange={(v) => updateFilter('apptType', v)}
              />
            </th>
            <th className="px-3 py-2 text-left">
              <SortableHeader label="Duration" sortKey="duration" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Duration"
                values={uniqueValues.duration}
                selectedValues={filters.duration}
                onSelectionChange={(v) => updateFilter('duration', v)}
              />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
          {sortedSlots.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-gray-500 italic">
                No slots match the current filters
              </td>
            </tr>
          ) : (
            sortedSlots.map((slot, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-3 py-2">{slot._date}</td>
                <td className="px-3 py-2">{slot._time}</td>
                <td className="px-3 py-2">
                  {slot._columnGUID ? (
                    <GuidWithName guid={slot._columnGUID} name={slot._columnName} />
                  ) : (
                    <span>{slot._columnName || 'N/A'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {slot._typeGUID ? (
                    <GuidWithName guid={slot._typeGUID} name={slot._typeName} />
                  ) : (
                    <span>{slot._typeName || '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">{slot._duration} min</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="text-xs text-gray-500 mt-2">
        {hasFilters || sort ? (
          <span>
            {hasFilters ? `Filtered: ${sortedSlots.length} of ${slots.length} slots` : `Showing ${slots.length} slots`}
            {sort && ` (sorted by ${sort.key} ${sort.direction})`}
          </span>
        ) : (
          <span>Showing {slots.length} slots</span>
        )}
      </div>
    </div>
  );
};

// Cloud9 Slots Formatter - handles Cloud9 GetOnlineReservations XML response with Excel-like filters
const Cloud9SlotsFormatter = ({ data }: { data: unknown }) => {
  const result = data as { status?: string; records?: Array<Record<string, string>>; error?: string };
  const records = result?.records || [];

  // Filter state - Set of selected values for each column (empty set = all selected)
  const [filters, setFilters] = useState<Record<string, Set<string>>>({
    date: new Set(),
    time: new Set(),
    location: new Set(),
    scheduleView: new Set(),
    scheduleColumn: new Set(),
    apptType: new Set(),
    duration: new Set()
  });

  // Sort state
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  if (result?.error) {
    return <div className="text-red-600 text-sm">{result.error}</div>;
  }
  if (!records.length) return <div className="text-gray-500 italic">No slots available</div>;

  // Process records with parsed data for filtering
  const processedSlots = records.map((record) => {
    const startTime = record.StartTime || '';
    const [date, ...timeParts] = startTime.split(' ');
    const time = timeParts.join(' ');

    // Get GUIDs
    const locationGUID = record.LocationGUID || '';
    const scheduleViewGUID = record.ScheduleViewGUID || '';
    const scheduleColumnGUID = record.ScheduleColumnGUID || '';
    const apptTypeGUID = record.AppointmentTypeGUID || '';

    // Get display names from response or lookup
    const locationName = record.LocationDescription || lookupGuid(locationGUID, 'locations');
    const scheduleViewName = record.ScheduleViewDescription || lookupGuid(scheduleViewGUID, 'scheduleViews');
    const scheduleColumnName = record.ScheduleColumnDescription || lookupGuid(scheduleColumnGUID, 'scheduleColumns');
    const apptTypeName = record.AppointmentTypeDescription || lookupGuid(apptTypeGUID, 'appointmentTypes');
    const duration = record.Minutes || '45';

    return {
      ...record,
      _date: date,
      _time: time,
      _locationGUID: locationGUID,
      _locationName: locationName,
      _scheduleViewGUID: scheduleViewGUID,
      _scheduleViewName: scheduleViewName,
      _scheduleColumnGUID: scheduleColumnGUID,
      _scheduleColumnName: scheduleColumnName,
      _apptTypeGUID: apptTypeGUID,
      _apptTypeName: apptTypeName,
      _duration: duration
    };
  });

  // Get unique values for each column (sorted)
  const uniqueValues = {
    date: [...new Set(processedSlots.map(s => s._date))].sort(),
    time: [...new Set(processedSlots.map(s => s._time))].sort(),
    location: [...new Set(processedSlots.map(s => s._locationName))].sort(),
    scheduleView: [...new Set(processedSlots.map(s => s._scheduleViewName))].sort(),
    scheduleColumn: [...new Set(processedSlots.map(s => s._scheduleColumnName))].sort(),
    apptType: [...new Set(processedSlots.map(s => s._apptTypeName))].sort(),
    duration: [...new Set(processedSlots.map(s => s._duration))].sort((a, b) => Number(a) - Number(b))
  };

  // Apply filters
  const filteredSlots = processedSlots.filter((slot) => {
    const dateMatch = filters.date.size === 0 || filters.date.has(slot._date);
    const timeMatch = filters.time.size === 0 || filters.time.has(slot._time);
    const locationMatch = filters.location.size === 0 || filters.location.has(slot._locationName);
    const scheduleViewMatch = filters.scheduleView.size === 0 || filters.scheduleView.has(slot._scheduleViewName);
    const scheduleColumnMatch = filters.scheduleColumn.size === 0 || filters.scheduleColumn.has(slot._scheduleColumnName);
    const apptTypeMatch = filters.apptType.size === 0 || filters.apptType.has(slot._apptTypeName);
    const durationMatch = filters.duration.size === 0 || filters.duration.has(slot._duration);
    return dateMatch && timeMatch && locationMatch && scheduleViewMatch && scheduleColumnMatch && apptTypeMatch && durationMatch;
  });

  // Apply sorting
  const sortedSlots = [...filteredSlots].sort((a, b) => {
    if (!sort) return 0;
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (sort.key) {
      case 'date':
        aVal = a._date;
        bVal = b._date;
        break;
      case 'time':
        aVal = a._time;
        bVal = b._time;
        break;
      case 'location':
        aVal = a._locationName;
        bVal = b._locationName;
        break;
      case 'scheduleView':
        aVal = a._scheduleViewName;
        bVal = b._scheduleViewName;
        break;
      case 'scheduleColumn':
        aVal = a._scheduleColumnName;
        bVal = b._scheduleColumnName;
        break;
      case 'apptType':
        aVal = a._apptTypeName;
        bVal = b._apptTypeName;
        break;
      case 'duration':
        aVal = parseInt(a._duration) || 0;
        bVal = parseInt(b._duration) || 0;
        break;
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const comparison = String(aVal).localeCompare(String(bVal));
    return sort.direction === 'asc' ? comparison : -comparison;
  });

  const hasFilters = Object.values(filters).some(f => f.size > 0);

  const clearFilters = () => {
    setFilters({
      date: new Set(),
      time: new Set(),
      location: new Set(),
      scheduleView: new Set(),
      scheduleColumn: new Set(),
      apptType: new Set(),
      duration: new Set()
    });
  };

  const updateFilter = (key: string, newSelection: Set<string>) => {
    setFilters(prev => ({ ...prev, [key]: newSelection }));
  };

  const handleSort = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return null;
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="overflow-x-auto">
      {/* Header with count and clear button */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">
          {hasFilters || sort ? (
            <span>
              {hasFilters ? `Showing ${sortedSlots.length} of ${records.length} slots` : `${records.length} slots found`}
              {sort && ` (sorted by ${sort.key} ${sort.direction})`}
            </span>
          ) : (
            <span>{records.length} slots found</span>
          )}
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
          >
            Clear Filters
          </button>
        )}
      </div>

      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700">
          {/* Column Headers with Sort and Filter */}
          <tr>
            <th className="px-2 py-2 text-left">
              <SortableHeader label="Date" sortKey="date" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Date"
                values={uniqueValues.date}
                selectedValues={filters.date}
                onSelectionChange={(v) => updateFilter('date', v)}
              />
            </th>
            <th className="px-2 py-2 text-left">
              <SortableHeader label="Time" sortKey="time" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Time"
                values={uniqueValues.time}
                selectedValues={filters.time}
                onSelectionChange={(v) => updateFilter('time', v)}
              />
            </th>
            <th className="px-2 py-2 text-left">
              <SortableHeader label="Location" sortKey="location" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Location"
                values={uniqueValues.location}
                selectedValues={filters.location}
                onSelectionChange={(v) => updateFilter('location', v)}
              />
            </th>
            <th className="px-2 py-2 text-left">
              <SortableHeader label="Schedule View" sortKey="scheduleView" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="View"
                values={uniqueValues.scheduleView}
                selectedValues={filters.scheduleView}
                onSelectionChange={(v) => updateFilter('scheduleView', v)}
              />
            </th>
            <th className="px-2 py-2 text-left">
              <SortableHeader label="Chair/Column" sortKey="scheduleColumn" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Chair"
                values={uniqueValues.scheduleColumn}
                selectedValues={filters.scheduleColumn}
                onSelectionChange={(v) => updateFilter('scheduleColumn', v)}
              />
            </th>
            <th className="px-2 py-2 text-left">
              <SortableHeader label="Appt Type" sortKey="apptType" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Type"
                values={uniqueValues.apptType}
                selectedValues={filters.apptType}
                onSelectionChange={(v) => updateFilter('apptType', v)}
              />
            </th>
            <th className="px-2 py-2 text-left">
              <SortableHeader label="Duration" sortKey="duration" currentSort={sort} onSort={handleSort} />
              <FilterDropdown
                label="Duration"
                values={uniqueValues.duration}
                selectedValues={filters.duration}
                onSelectionChange={(v) => updateFilter('duration', v)}
              />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
          {sortedSlots.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-gray-500 italic">
                No slots match the current filters
              </td>
            </tr>
          ) : (
            sortedSlots.map((slot, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700 text-xs">
                <td className="px-2 py-2">{slot._date}</td>
                <td className="px-2 py-2">{slot._time}</td>
                <td className="px-2 py-2">
                  {slot._locationGUID ? (
                    <GuidWithName guid={slot._locationGUID} name={slot._locationName} />
                  ) : (
                    <span>{slot._locationName || 'N/A'}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {slot._scheduleViewGUID ? (
                    <GuidWithName guid={slot._scheduleViewGUID} name={slot._scheduleViewName} />
                  ) : (
                    <span>{slot._scheduleViewName || 'N/A'}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {slot._scheduleColumnGUID ? (
                    <GuidWithName guid={slot._scheduleColumnGUID} name={slot._scheduleColumnName} />
                  ) : (
                    <span>{slot._scheduleColumnName || 'N/A'}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {slot._apptTypeGUID ? (
                    <GuidWithName guid={slot._apptTypeGUID} name={slot._apptTypeName} />
                  ) : (
                    <span>{slot._apptTypeName || '-'}</span>
                  )}
                </td>
                <td className="px-2 py-2">{slot._duration} min</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="text-xs text-gray-500 mt-2">
        {hasFilters ? (
          <span>Filtered: {filteredSlots.length} of {records.length} slots</span>
        ) : (
          <span>Showing {records.length} slots</span>
        )}
      </div>
    </div>
  );
};

const GroupedSlotsFormatter = ({ data }: { data: unknown }) => {
  const result = data as { groups?: Array<{ date: string; day: string; times: string[]; slots: Array<Record<string, string>> }>; totalGroups?: number };
  const groups = result?.groups || [];
  if (!groups.length) return <div className="text-gray-500 italic">No grouped slots available</div>;

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">{result.totalGroups || groups.length} slot groups found</div>
      {groups.map((group, i) => (
        <div key={i} className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
          <div className="font-medium">{group.day} {group.date}</div>
          <div className="text-gray-600 dark:text-gray-300">
            {group.times?.map((t, j) => <span key={j} className="mr-3">Child {j + 1}: {t}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
};

const AppointmentsFormatter = ({ data }: { data: unknown }) => {
  const appts = (data as { appointments?: Array<Record<string, string>> })?.appointments || (Array.isArray(data) ? data : []);
  if (!appts.length) return <div className="text-gray-500 italic">No appointments found</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Date/Time</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">GUID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
          {appts.map((a, i) => {
            const apptGuid = a.AppointmentGUID || a.appointmentGUID || a.GUID || '';
            return (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-3 py-2">{a.StartTime || a.AppointmentDate || a.appointmentDate || 'N/A'}</td>
                <td className="px-3 py-2">{a.AppointmentType || a.appointmentType || 'N/A'}</td>
                <td className="px-3 py-2">{a.Status || a.status || 'N/A'}</td>
                <td className="px-3 py-2">
                  {apptGuid && (
                    <div className="flex items-center gap-1 group">
                      <span className="font-mono text-xs">{apptGuid.substring(0, 8)}...</span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton value={apptGuid} size="xs" />
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const LocationFormatter = ({ data }: { data: unknown }) => {
  const result = data as { location?: Record<string, string>; locations?: Array<Record<string, string>>; success?: boolean; error?: string };

  // Handle error responses
  if (result?.error) {
    return <div className="text-red-600 text-sm">{result.error}</div>;
  }

  // Handle both singular 'location' and plural 'locations' responses
  let locations: Array<Record<string, string>> = [];
  if (result?.location) {
    locations = [result.location];
  } else if (result?.locations) {
    locations = result.locations;
  } else if (Array.isArray(data)) {
    locations = data as Array<Record<string, string>>;
  }

  if (!locations.length || !locations[0]) return <div className="text-gray-500 italic">No location data</div>;

  return (
    <div className="space-y-2">
      {locations.map((loc, i) => {
        const locGuid = loc.LocationGUID || loc.locationGUID || loc.LocGUID || '';
        const locName = loc.LocationName || loc.locationName || loc.LocName || 'Location';
        const locAddr = loc.LocAddress || loc.Address || '';
        const locPhone = loc.LocPhone || loc.Phone || '';
        return (
          <div key={i} className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
            <div className="font-medium">{locName}</div>
            {locAddr && <div className="text-gray-600 dark:text-gray-300 text-xs">{locAddr}</div>}
            {locPhone && <div className="text-gray-600 dark:text-gray-300 text-xs">{locPhone}</div>}
            <div className="text-gray-600 dark:text-gray-300 text-xs flex items-center gap-1 group mt-1">
              <span>GUID: {locGuid || 'N/A'}</span>
              {locGuid && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton value={locGuid} size="xs" />
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const GenericSuccessFormatter = ({ data }: { data: unknown }) => {
  const result = data as Record<string, unknown>;
  const success = result?.success !== false;
  const message = result?.message || result?.Message || (success ? 'Operation completed' : 'Operation failed');
  const guid = result?.appointmentGUID || result?.patientGUID || result?.GUID;

  return (
    <div className={`p-3 rounded ${success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
      <div className={`font-medium ${success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
        {success ? 'Success' : 'Failed'}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{String(message)}</div>
      {guid && (
        <div className="text-xs mt-2 flex items-center gap-1 group">
          <span className="text-gray-500">GUID: <span className="font-mono">{String(guid)}</span></span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton value={String(guid)} size="xs" />
          </span>
        </div>
      )}
    </div>
  );
};

// XML Helper Functions for Cloud9 API
function escapeXml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c)
  );
}

function buildCloud9XmlRequest(procedure: string, params: Record<string, string> = {}, config: Cloud9ApiConfig = CLOUD9_API_CONFIG): string {
  const paramElements = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${config.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><ClientID>${config.clientId}</ClientID><UserName>${config.userName}</UserName><Password>${escapeXml(config.password)}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

function parseCloud9XmlResponse(xmlText: string): { status: string; records: Record<string, string>[]; error?: string } {
  const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
  const status = statusMatch ? statusMatch[1] : 'Unknown';

  if (status === 'Error' || status !== 'Success') {
    const errorMatch = xmlText.match(/<Result>([^<]+)<\/Result>/);
    if (errorMatch) {
      return { status, records: [], error: errorMatch[1] };
    }
    const errorCodeMatch = xmlText.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
    const errorMessageMatch = xmlText.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
    if (errorCodeMatch || errorMessageMatch) {
      return { status, records: [], error: `${errorCodeMatch?.[1] || ''}: ${errorMessageMatch?.[1] || 'Unknown error'}` };
    }
  }

  const records: Record<string, string>[] = [];
  const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
  let match;
  while ((match = recordRegex.exec(xmlText)) !== null) {
    const record: Record<string, string> = {};
    const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
      record[fieldMatch[1]] = fieldMatch[2];
    }
    records.push(record);
  }
  return { status, records };
}

// Cloud9 XML Response Formatter
const Cloud9RecordsFormatter = ({ data }: { data: unknown }) => {
  const result = data as { status?: string; records?: Record<string, string>[]; error?: string };
  if (result?.error) {
    return <div className="text-red-600 text-sm">{result.error}</div>;
  }
  const records = result?.records || [];
  if (!records.length) return <div className="text-gray-500 italic">No records found</div>;

  // Get all unique keys from records
  const allKeys = [...new Set(records.flatMap(r => Object.keys(r)))];
  const keyFields = allKeys.filter(k => k.toLowerCase().includes('guid') || k.toLowerCase().includes('id'));

  return (
    <div className="overflow-x-auto">
      <div className="text-xs text-gray-500 mb-2">{records.length} record(s) found</div>
      <div className="space-y-2">
        {records.map((record, i) => (
          <div key={i} className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
            {Object.entries(record).map(([key, value]) => (
              <div key={key} className="flex items-center gap-1 group">
                <span className="text-gray-400 w-32 shrink-0 truncate">{key}:</span>
                <span className={keyFields.includes(key) ? 'font-mono' : ''}>{value || 'N/A'}</span>
                {keyFields.includes(key) && value && (
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyButton value={value} size="xs" />
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500 mt-2">Showing {records.length} records</div>
    </div>
  );
};

// Locations with Search Filter Formatter
const LocationsWithSearchFormatter = ({ data }: { data: unknown }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const result = data as { status?: string; records?: Record<string, string>[]; error?: string };
  if (result?.error) {
    return <div className="text-red-600 text-sm">{result.error}</div>;
  }
  const allRecords = result?.records || [];
  if (!allRecords.length) return <div className="text-gray-500 italic">No locations found</div>;

  // Filter records by search query (search in any field containing the query)
  const filteredRecords = searchQuery.trim()
    ? allRecords.filter(record => {
        const query = searchQuery.toLowerCase();
        return Object.values(record).some(value =>
          value && value.toLowerCase().includes(query)
        );
      })
    : allRecords;

  // Get all unique keys from records for display
  const allKeys = [...new Set(allRecords.flatMap(r => Object.keys(r)))];
  const keyFields = allKeys.filter(k => k.toLowerCase().includes('guid') || k.toLowerCase().includes('id'));

  return (
    <div className="overflow-x-auto">
      {/* Search Input */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search locations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-500 mb-2">
        {searchQuery ? (
          <span>Showing {filteredRecords.length} of {allRecords.length} locations</span>
        ) : (
          <span>{allRecords.length} location(s) found</span>
        )}
      </div>

      {/* No results message */}
      {filteredRecords.length === 0 && searchQuery && (
        <div className="text-gray-500 italic text-sm py-2">
          No locations match "{searchQuery}"
        </div>
      )}

      {/* Location records - showing all fields like Cloud9RecordsFormatter */}
      <div className="space-y-2">
        {filteredRecords.map((record, i) => (
          <div key={i} className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
            {Object.entries(record).map(([key, value]) => (
              <div key={key} className="flex items-center gap-1 group">
                <span className="text-gray-400 w-32 shrink-0 truncate">{key}:</span>
                <span className={keyFields.includes(key) ? 'font-mono' : ''}>{value || 'N/A'}</span>
                {keyFields.includes(key) && value && (
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyButton value={value} size="xs" />
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500 mt-2">
        {searchQuery ? (
          <span>Filtered: {filteredRecords.length} of {allRecords.length}</span>
        ) : (
          <span>Showing {allRecords.length} records</span>
        )}
      </div>
    </div>
  );
};

// Cloud9 Direct API Endpoint Configurations (matches Node Red flow)
const CLOUD9_ENDPOINTS: Cloud9EndpointConfig[] = [
  // Patient Operations
  {
    id: 'c9_portalPatientLookup',
    name: 'GetPortalPatientLookup',
    procedure: 'GetPortalPatientLookup',
    category: 'patient',
    description: 'Search patients by name',
    sampleParams: { filter: 'Aleman, Chris', lookupByPatient: '1', pageIndex: '1', pageSize: '25' },
    formatResult: (data) => <Cloud9RecordsFormatter data={data} />
  },
  {
    id: 'c9_patientList',
    name: 'GetPatientList',
    procedure: 'GetPatientList',
    category: 'patient',
    description: 'Get all patients (optionally filtered by location)',
    sampleParams: { LocGUIDs: CLOUD9_API_CONFIG.defaults.locationGUID },
    formatResult: (data) => <Cloud9RecordsFormatter data={data} />
  },
  {
    id: 'c9_patientInfo',
    name: 'GetPatientInformation',
    procedure: 'GetPatientInformation',
    category: 'patient',
    description: 'Get patient details by GUID',
    sampleParams: { patguid: CLOUD9_API_CONFIG.defaults.testPatientGUID },
    formatResult: (data) => <Cloud9RecordsFormatter data={data} />
  },
  {
    id: 'c9_patientAppts',
    name: 'GetAppointmentListByPatient',
    procedure: 'GetAppointmentListByPatient',
    category: 'patient',
    description: 'Get appointments for a patient',
    sampleParams: { patGUID: CLOUD9_API_CONFIG.defaults.testPatientGUID },
    formatResult: (data) => <Cloud9RecordsFormatter data={data} />
  },
  // Scheduling Operations
  {
    id: 'c9_onlineReservations',
    name: 'GetOnlineReservations',
    procedure: 'GetOnlineReservations',
    category: 'scheduling',
    description: 'Get available appointment slots',
    sampleParams: {
      startDate: formatDateMDY(1),
      endDate: formatDateMDY(60),
      schdvwGUIDs: CLOUD9_API_CONFIG.defaults.scheduleViewGUID,
      schclnGUIDs: 'f0fa4eda-0136-45d5-a5d8-91ad7d0b608a',  // Optional: Chair 8 (clear to get all)
      appttypGUIDs: 'f6c20c35-9abb-47c2-981a-342996016705',  // Optional: New Patient Exam (clear to get all)
      morning: 'True',
      afternoon: 'True'
    },
    formatResult: (data) => <Cloud9SlotsFormatter data={data} />
  },
  // Reference Data
  {
    id: 'c9_apptTypes',
    name: 'GetApptTypes',
    procedure: 'GetApptTypes',
    category: 'reference',
    description: 'Get all appointment types (check AllowOnlineScheduling field)',
    sampleParams: {},
    formatResult: (data) => <Cloud9RecordsFormatter data={data} />
  },
  {
    id: 'c9_locations',
    name: 'GetLocations',
    procedure: 'GetLocations',
    category: 'reference',
    description: 'Get all practice locations',
    sampleParams: { showDeleted: 'False' },
    formatResult: (data) => <LocationsWithSearchFormatter data={data} />
  },
  {
    id: 'c9_scheduleViews',
    name: 'GetScheduleViews',
    procedure: 'GetScheduleViews',
    category: 'reference',
    description: 'Get all schedule views (calendars)',
    sampleParams: {},
    formatResult: (data) => <Cloud9RecordsFormatter data={data} />
  },
  {
    id: 'c9_scheduleColumns',
    name: 'GetScheduleColumns',
    procedure: 'GetScheduleColumns',
    category: 'reference',
    description: 'Get all schedule columns (chairs/providers)',
    sampleParams: {},
    formatResult: (data) => <Cloud9RecordsFormatter data={data} />
  },
  // Write Operations
  {
    id: 'c9_setPatient',
    name: 'SetPatient',
    procedure: 'SetPatient',
    category: 'write',
    description: 'Create a new patient',
    sampleParams: {
      patientFirstName: 'APITest',
      patientLastName: `User${Math.floor(Math.random() * 10000)}`,
      birthdayDateTime: '01/15/2015',
      gender: 'M',
      phoneNumber: '7205551234',
      providerGUID: CLOUD9_API_CONFIG.defaults.providerGUID,
      locationGUID: CLOUD9_API_CONFIG.defaults.locationGUID,
      VendorUserName: 'IntelepeerTest'
    },
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  {
    id: 'c9_setAppointment',
    name: 'SetAppointment',
    procedure: 'SetAppointment',
    category: 'write',
    description: 'Create a new appointment',
    sampleParams: {
      PatientGUID: CLOUD9_API_CONFIG.defaults.testPatientGUID,
      StartTime: `${formatDateMDY(7)} 10:00 AM`,
      ScheduleViewGUID: CLOUD9_API_CONFIG.defaults.scheduleViewGUID,
      ScheduleColumnGUID: 'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b',
      AppointmentTypeGUID: CLOUD9_API_CONFIG.defaults.apptTypeGUID,
      Minutes: '45',
      VendorUserName: 'IntelepeerTest'
    },
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  {
    id: 'c9_confirmAppt',
    name: 'SetAppointmentStatusConfirmed',
    procedure: 'SetAppointmentStatusConfirmed',
    category: 'write',
    description: 'Confirm an appointment',
    sampleParams: { apptGUIDs: '0a22fcc4-6ba0-4009-a9e7-2b5664170669' },  // Chris Aleman's appointment
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  {
    id: 'c9_cancelAppt',
    name: 'SetAppointmentStatusCanceled',
    procedure: 'SetAppointmentStatusCanceled',
    category: 'write',
    description: 'Cancel an appointment',
    sampleParams: { apptGUIDs: '1efdfbbc-420a-4197-95da-76d15173a6ab' },  // Chris Aleman's 2nd appointment
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  {
    id: 'c9_patientComment',
    name: 'SetPatientComment',
    procedure: 'SetPatientComment',
    category: 'write',
    description: 'Add a comment to a patient record',
    sampleParams: {
      patGUID: CLOUD9_API_CONFIG.defaults.testPatientGUID,
      patComment: 'Test comment from API Testing'
    },
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  }
];

// Node Red Endpoint Configurations
const ENDPOINTS: EndpointConfig[] = [
  // Patient Operations
  {
    id: 'patientLookup',
    name: 'Patient Lookup (Name)',
    endpoint: '/ortho-prd/getPatientByFilter',
    category: 'patient',
    description: 'Search patients by name (uses GetPortalPatientLookup)',
    sampleData: { filter: 'Aleman, Chris', locationGUID: API_CONFIG.defaults.locationGUID },
    formatResult: (data) => <PatientListFormatter data={data} />
  },
  {
    id: 'getPatient',
    name: 'Get Patient Details',
    endpoint: '/ortho-prd/getPatient',
    category: 'patient',
    description: 'Get patient information by GUID (Chris Aleman)',
    sampleData: { patientGUID: API_CONFIG.defaults.testPatientGUID },
    formatResult: (data) => <PatientDetailFormatter data={data} />
  },
  {
    id: 'createPatient',
    name: 'Create Patient',
    endpoint: '/ortho-prd/createPatient',
    category: 'patient',
    description: 'Register a new patient',
    sampleData: {
      patientFirstName: 'TestJohn',
      patientLastName: `AutoTest${Date.now().toString().slice(-4)}`,
      birthdayDateTime: '01/15/2015',
      phoneNumber: '7205559999',
      gender: 'M',
      providerGUID: API_CONFIG.defaults.providerGUID,
      locationGUID: API_CONFIG.defaults.locationGUID
    },
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  {
    id: 'getPatientAppts',
    name: 'Get Patient Appointments',
    endpoint: '/ortho-prd/getPatientAppts',
    category: 'patient',
    description: 'Get appointments for a patient',
    sampleData: { patientGUID: API_CONFIG.defaults.testPatientGUID },
    formatResult: (data) => <AppointmentsFormatter data={data} />
  },
  {
    id: 'getLocation',
    name: 'Get Clinic Info',
    endpoint: '/ortho-prd/getLocation',
    category: 'patient',
    description: 'Get clinic/location details',
    sampleData: { locationGUID: API_CONFIG.defaults.locationGUID },
    formatResult: (data) => <LocationFormatter data={data} />
  },
  {
    id: 'editInsurance',
    name: 'Edit Insurance',
    endpoint: '/ortho-prd/editInsurance',
    category: 'patient',
    description: 'Update patient insurance info',
    sampleData: {
      patientGUID: API_CONFIG.defaults.testPatientGUID,
      insuranceProvider: 'Test Insurance Co',
      insuranceGroupId: 'GRP-12345',
      insuranceMemberId: 'MEM-67890'
    },
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  {
    id: 'confirmAppt',
    name: 'Confirm Appointment',
    endpoint: '/ortho-prd/confirmAppt',
    category: 'patient',
    description: 'Confirm an appointment',
    sampleData: { appointmentId: '0a22fcc4-6ba0-4009-a9e7-2b5664170669' },  // Chris Aleman's appointment
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  // Scheduling Operations
  {
    id: 'getSlots',
    name: 'Get Available Slots',
    endpoint: '/ortho-prd/getApptSlots',
    category: 'scheduling',
    description: 'Get available appointment times',
    sampleData: {
      startDate: formatDateMDY(1),
      endDate: formatDateMDY(14),
      scheduleViewGUIDs: API_CONFIG.defaults.scheduleViewGUID,
      scheduleColumnGUID: 'f0fa4eda-0136-45d5-a5d8-91ad7d0b608a',  // Optional: filter by specific chair/column
      appointmentTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705'  // Optional: filter by appointment type
    },
    formatResult: (data) => <SlotsFormatter data={data} />
  },
  {
    id: 'groupedSlots',
    name: 'Grouped Slots (Siblings)',
    endpoint: '/ortho-prd/getGroupedApptSlots',
    category: 'scheduling',
    description: 'Find consecutive slots for multiple patients',
    sampleData: {
      startDate: formatDateMDY(1),
      endDate: formatDateMDY(14),
      numberOfPatients: 2,
      timeWindowMinutes: 60,
      scheduleViewGUIDs: API_CONFIG.defaults.scheduleViewGUID
    },
    formatResult: (data) => <GroupedSlotsFormatter data={data} />
  },
  {
    id: 'createAppt',
    name: 'Book Appointment',
    endpoint: '/ortho-prd/createAppt',
    category: 'scheduling',
    description: 'Create a new appointment',
    sampleData: {
      patientGUID: API_CONFIG.defaults.testPatientGUID,
      startTime: `${formatDateMDY(7)} 10:00 AM`,
      scheduleViewGUID: API_CONFIG.defaults.scheduleViewGUID,
      scheduleColumnGUID: API_CONFIG.defaults.scheduleColumnGUID,
      appointmentTypeGUID: API_CONFIG.defaults.apptTypeGUID,
      minutes: 45,
      childName: 'TestChild'
    },
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  },
  {
    id: 'cancelAppt',
    name: 'Cancel Appointment',
    endpoint: '/ortho-prd/cancelAppt',
    category: 'scheduling',
    description: 'Cancel an existing appointment',
    sampleData: { appointmentGUID: '1efdfbbc-420a-4197-95da-76d15173a6ab' },  // Chris Aleman's 2nd appointment
    formatResult: (data) => <GenericSuccessFormatter data={data} />
  }
];

// Generic Popout Modal for both Node Red and Cloud9
function ResultPopoutModal({
  isOpen,
  onClose,
  title,
  subtitle,
  result,
  formatResult
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  result: TestResult;
  formatResult: (data: unknown) => React.ReactNode;
}) {
  const [showRaw, setShowRaw] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <div className="text-sm text-gray-500 font-mono">{subtitle}</div>
          </div>
          <div className="flex items-center gap-3">
            {result.duration && (
              <span className="text-sm text-gray-500">{result.duration}ms</span>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Results</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {showRaw ? 'Formatted' : 'Raw JSON'}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 min-h-[300px]">
            {result.error ? (
              <div className="text-red-600 text-sm">{result.error}</div>
            ) : showRaw ? (
              <pre className="text-sm overflow-auto whitespace-pre-wrap break-words">
                {result.rawXml || JSON.stringify(result.data, null, 2)}
              </pre>
            ) : (
              <div className="text-sm">
                {formatResult(result.data)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Test Card Component
function TestCard({
  config,
  result,
  onRun,
  onInputChange
}: {
  config: EndpointConfig;
  result: TestResult;
  onRun: () => void;
  onInputChange: (data: Record<string, unknown>) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [inputData, setInputData] = useState(config.sampleData);
  const [showPopout, setShowPopout] = useState(false);

  const statusColors = {
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  };

  const statusIcons = {
    pending: '○',
    running: '◌',
    success: '✓',
    error: '✗'
  };

  const handleInputChange = (key: string, value: string) => {
    const newData = { ...inputData, [key]: value };
    setInputData(newData);
    onInputChange(newData);
  };

  return (
    <Card className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">{config.name}</h3>
          <div className="text-xs text-gray-500 font-mono">POST {config.endpoint}</div>
        </div>
        <div className="flex items-center gap-2">
          {result.duration && (
            <span className="text-xs text-gray-500">{result.duration}ms</span>
          )}
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[result.status]}`}>
            {statusIcons[result.status]} {result.status}
          </span>
        </div>
      </div>

      {/* Input Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Sample Input</span>
          <button
            onClick={() => setEditMode(!editMode)}
            className="text-xs text-primary-600 hover:text-primary-800"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
        {editMode ? (
          <div className="space-y-2">
            {Object.entries(inputData).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-24 shrink-0">{key}:</label>
                <input
                  type="text"
                  value={String(value)}
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
            {Object.entries(inputData).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1 group">
                <span className="text-gray-400">{k}:</span>
                <span className="font-mono">{JSON.stringify(v)}</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton value={String(v)} size="xs" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Section */}
      {result.status !== 'pending' && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-1 overflow-auto max-h-64">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Results</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPopout(true)}
                className="text-xs text-primary-600 hover:text-primary-800"
                title="Open in popout"
              >
                ⤢ Expand
              </button>
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-primary-600 hover:text-primary-800"
              >
                {showRaw ? 'Formatted' : 'Raw JSON'}
              </button>
            </div>
          </div>
          {result.error ? (
            <div className="text-red-600 text-sm">{result.error}</div>
          ) : showRaw ? (
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          ) : (
            config.formatResult(result.data)
          )}
        </div>
      )}

      {/* Popout Modal */}
      <ResultPopoutModal
        isOpen={showPopout}
        onClose={() => setShowPopout(false)}
        title={config.name}
        subtitle={`POST ${config.endpoint}`}
        result={result}
        formatResult={config.formatResult}
      />

      {/* Actions */}
      <div className="p-4 flex items-center gap-2">
        <Button
          onClick={onRun}
          disabled={result.status === 'running'}
          size="sm"
          className="flex-1"
        >
          {result.status === 'running' ? <Spinner size="sm" /> : 'Run Test'}
        </Button>
        {result.data && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))}
          >
            Copy
          </Button>
        )}
      </div>
    </Card>
  );
}

// Cloud9 Test Card Component
function Cloud9TestCard({
  config,
  result,
  onRun,
  onInputChange
}: {
  config: Cloud9EndpointConfig;
  result: TestResult;
  onRun: () => void;
  onInputChange: (data: Record<string, string>) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [inputData, setInputData] = useState(config.sampleParams);
  const [showPopout, setShowPopout] = useState(false);

  const statusColors = {
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  };

  const statusIcons = {
    pending: '○',
    running: '◌',
    success: '✓',
    error: '✗'
  };

  const handleInputChange = (key: string, value: string) => {
    const newData = { ...inputData, [key]: value };
    setInputData(newData);
    onInputChange(newData);
  };

  // Determine category color
  const categoryColors = {
    patient: 'border-l-blue-500',
    scheduling: 'border-l-purple-500',
    reference: 'border-l-green-500',
    write: 'border-l-orange-500'
  };

  return (
    <Card className={`flex flex-col border-l-4 ${categoryColors[config.category]}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">{config.name}</h3>
          <div className="text-xs text-gray-500 font-mono">{config.procedure}</div>
        </div>
        <div className="flex items-center gap-2">
          {result.duration && (
            <span className="text-xs text-gray-500">{result.duration}ms</span>
          )}
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[result.status]}`}>
            {statusIcons[result.status]} {result.status}
          </span>
        </div>
      </div>

      {/* Input Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Parameters</span>
          <button
            onClick={() => setEditMode(!editMode)}
            className="text-xs text-primary-600 hover:text-primary-800"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
        {editMode ? (
          <div className="space-y-2">
            {Object.entries(inputData).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-32 shrink-0">{key}:</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
            {Object.entries(inputData).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1 group">
                <span className="text-gray-400">{k}:</span>
                <span className="font-mono truncate max-w-48">{v}</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton value={v} size="xs" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Section */}
      {result.status !== 'pending' && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-1 overflow-auto max-h-64">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Results</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPopout(true)}
                className="text-xs text-primary-600 hover:text-primary-800"
                title="Open in popout"
              >
                ⤢ Expand
              </button>
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-primary-600 hover:text-primary-800"
              >
                {showRaw ? 'Formatted' : 'Raw XML'}
              </button>
            </div>
          </div>
          {result.error ? (
            <div className="text-red-600 text-sm">{result.error}</div>
          ) : showRaw ? (
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {result.rawXml || JSON.stringify(result.data, null, 2)}
            </pre>
          ) : (
            config.formatResult(result.data)
          )}
        </div>
      )}

      {/* Popout Modal */}
      <ResultPopoutModal
        isOpen={showPopout}
        onClose={() => setShowPopout(false)}
        title={config.name}
        subtitle={`Cloud9 API: ${config.procedure}`}
        result={result}
        formatResult={config.formatResult}
      />

      {/* Actions */}
      <div className="p-4 flex items-center gap-2">
        <Button
          onClick={onRun}
          disabled={result.status === 'running'}
          size="sm"
          className="flex-1"
        >
          {result.status === 'running' ? <Spinner size="sm" /> : 'Run Test'}
        </Button>
        {result.data && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(result.rawXml || JSON.stringify(result.data, null, 2))}
          >
            Copy
          </Button>
        )}
      </div>
    </Card>
  );
}

// Main Page Component
export function APITestingPage() {
  // Chat panel state
  const [isChatOpen, setIsChatOpen] = useState(false);

  // API Mode State
  const [apiMode, setApiMode] = useState<ApiMode>('nodeRed');

  // Cloud9 Environment State
  const [cloud9Environment, setCloud9Environment] = useState<Cloud9Environment>('sandbox');
  const cloud9Config = CLOUD9_CONFIGS[cloud9Environment];

  // Node Red State
  const [nodeRedResults, setNodeRedResults] = useState<Record<string, TestResult>>(
    Object.fromEntries(ENDPOINTS.map(e => [e.id, { status: 'pending' as TestStatus }]))
  );
  const [nodeRedInputData, setNodeRedInputData] = useState<Record<string, Record<string, unknown>>>(
    Object.fromEntries(ENDPOINTS.map(e => [e.id, e.sampleData]))
  );

  // Cloud9 State
  const [cloud9Results, setCloud9Results] = useState<Record<string, TestResult>>(
    Object.fromEntries(CLOUD9_ENDPOINTS.map(e => [e.id, { status: 'pending' as TestStatus }]))
  );
  const [cloud9InputData, setCloud9InputData] = useState<Record<string, Record<string, string>>>(
    Object.fromEntries(CLOUD9_ENDPOINTS.map(e => [e.id, e.sampleParams]))
  );

  // Node Red Test Runner
  const runNodeRedTest = useCallback(async (endpoint: EndpointConfig) => {
    setNodeRedResults(prev => ({ ...prev, [endpoint.id]: { status: 'running' } }));
    const startTime = Date.now();

    try {
      const auth = btoa(`${API_CONFIG.auth.username}:${API_CONFIG.auth.password}`);
      const body = {
        uui: API_CONFIG.defaults.uui,
        ...nodeRedInputData[endpoint.id]
      };

      const response = await fetch(`${API_CONFIG.baseUrl}${endpoint.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(body)
      });

      const duration = Date.now() - startTime;
      const text = await response.text();

      if (!text) {
        setNodeRedResults(prev => ({
          ...prev,
          [endpoint.id]: { status: 'error', error: `Empty response (HTTP ${response.status})`, duration }
        }));
        return;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setNodeRedResults(prev => ({
          ...prev,
          [endpoint.id]: { status: 'error', error: `Invalid JSON response: ${text.substring(0, 100)}...`, duration }
        }));
        return;
      }

      if (!response.ok || data.error) {
        setNodeRedResults(prev => ({
          ...prev,
          [endpoint.id]: { status: 'error', error: data.error || `HTTP ${response.status}`, duration }
        }));
      } else {
        setNodeRedResults(prev => ({
          ...prev,
          [endpoint.id]: { status: 'success', data, duration }
        }));
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      setNodeRedResults(prev => ({
        ...prev,
        [endpoint.id]: { status: 'error', error: (error as Error).message, duration }
      }));
    }
  }, [nodeRedInputData]);

  // Cloud9 Direct API Test Runner
  const runCloud9Test = useCallback(async (endpoint: Cloud9EndpointConfig) => {
    setCloud9Results(prev => ({ ...prev, [endpoint.id]: { status: 'running' } }));
    const startTime = Date.now();

    try {
      const xmlBody = buildCloud9XmlRequest(endpoint.procedure, cloud9InputData[endpoint.id], cloud9Config);

      const response = await fetch(cloud9Config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8'
        },
        body: xmlBody
      });

      const duration = Date.now() - startTime;
      const xmlText = await response.text();

      if (!response.ok) {
        setCloud9Results(prev => ({
          ...prev,
          [endpoint.id]: { status: 'error', error: `HTTP ${response.status}: ${response.statusText}`, duration, rawXml: xmlText }
        }));
        return;
      }

      // Parse the XML response
      const parsed = parseCloud9XmlResponse(xmlText);

      if (parsed.error) {
        setCloud9Results(prev => ({
          ...prev,
          [endpoint.id]: { status: 'error', error: parsed.error, duration, rawXml: xmlText }
        }));
      } else {
        setCloud9Results(prev => ({
          ...prev,
          [endpoint.id]: { status: 'success', data: parsed, duration, rawXml: xmlText }
        }));
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      setCloud9Results(prev => ({
        ...prev,
        [endpoint.id]: { status: 'error', error: (error as Error).message, duration }
      }));
    }
  }, [cloud9InputData, cloud9Config]);

  // Run all tests for current mode
  const runAllNodeRedTests = useCallback(async (category?: EndpointCategory) => {
    const endpoints = category ? ENDPOINTS.filter(e => e.category === category) : ENDPOINTS;
    for (const endpoint of endpoints) {
      await runNodeRedTest(endpoint);
    }
  }, [runNodeRedTest]);

  const runAllCloud9Tests = useCallback(async (category?: EndpointCategory) => {
    const endpoints = category ? CLOUD9_ENDPOINTS.filter(e => e.category === category) : CLOUD9_ENDPOINTS;
    for (const endpoint of endpoints) {
      await runCloud9Test(endpoint);
    }
  }, [runCloud9Test]);

  // Input change handlers
  const handleNodeRedInputChange = useCallback((endpointId: string, data: Record<string, unknown>) => {
    setNodeRedInputData(prev => ({ ...prev, [endpointId]: data }));
  }, []);

  const handleCloud9InputChange = useCallback((endpointId: string, data: Record<string, string>) => {
    setCloud9InputData(prev => ({ ...prev, [endpointId]: data }));
  }, []);

  // Stats calculation
  const currentResults = apiMode === 'nodeRed' ? nodeRedResults : cloud9Results;
  const currentEndpoints = apiMode === 'nodeRed' ? ENDPOINTS : CLOUD9_ENDPOINTS;

  const stats = {
    total: currentEndpoints.length,
    passed: Object.values(currentResults).filter(r => r.status === 'success').length,
    failed: Object.values(currentResults).filter(r => r.status === 'error').length,
    pending: Object.values(currentResults).filter(r => r.status === 'pending').length,
    running: Object.values(currentResults).filter(r => r.status === 'running').length
  };

  // Endpoint groupings for Node Red
  const nodeRedPatientEndpoints = ENDPOINTS.filter(e => e.category === 'patient');
  const nodeRedSchedulingEndpoints = ENDPOINTS.filter(e => e.category === 'scheduling');

  // Endpoint groupings for Cloud9
  const cloud9PatientEndpoints = CLOUD9_ENDPOINTS.filter(e => e.category === 'patient');
  const cloud9SchedulingEndpoints = CLOUD9_ENDPOINTS.filter(e => e.category === 'scheduling');
  const cloud9ReferenceEndpoints = CLOUD9_ENDPOINTS.filter(e => e.category === 'reference');
  const cloud9WriteEndpoints = CLOUD9_ENDPOINTS.filter(e => e.category === 'write');

  return (
    <div className="h-full overflow-auto p-6">
      <PageHeader
        title="API Testing"
        subtitle={apiMode === 'nodeRed' ? 'Test Node Red middleware endpoints' : 'Test Cloud9 API directly'}
      />

      {/* API Mode Toggle */}
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-gray-500 mr-2">API Mode:</span>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-100 dark:bg-gray-900">
            <button
              onClick={() => setApiMode('nodeRed')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                apiMode === 'nodeRed'
                  ? 'bg-white dark:bg-gray-800 text-primary-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Node Red API
            </button>
            <button
              onClick={() => setApiMode('cloud9')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                apiMode === 'cloud9'
                  ? 'bg-white dark:bg-gray-800 text-primary-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Cloud9 API
            </button>
          </div>
        </div>

        {/* Cloud9 Environment Selector */}
        {apiMode === 'cloud9' && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="text-sm text-gray-500 mr-2">Environment:</span>
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-100 dark:bg-gray-900">
              <button
                onClick={() => setCloud9Environment('sandbox')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  cloud9Environment === 'sandbox'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Sandbox
              </button>
              <button
                onClick={() => setCloud9Environment('production')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  cloud9Environment === 'production'
                    ? 'bg-white dark:bg-gray-800 text-orange-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Production
              </button>
            </div>
            {cloud9Environment === 'production' && (
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded">
                PRODUCTION
              </span>
            )}
          </div>
        )}

        <div className="text-center mt-2 text-xs text-gray-400">
          {apiMode === 'nodeRed' ? (
            <span>Endpoint: {NODRED_API_CONFIG.baseUrl}</span>
          ) : (
            <span>
              Endpoint: {cloud9Config.displayUrl}
              <span className={`ml-1 ${cloud9Environment === 'production' ? 'text-orange-500' : 'text-blue-500'}`}>
                ({cloud9Environment === 'production' ? 'Production' : 'Sandbox'})
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Stats & Actions Bar */}
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-green-600 font-medium">✓ Passed: {stats.passed}</span>
          <span className="text-red-600 font-medium">✗ Failed: {stats.failed}</span>
          <span className="text-gray-500">○ Pending: {stats.pending}</span>
          {stats.running > 0 && <span className="text-yellow-600">◌ Running: {stats.running}</span>}
        </div>
        <div className="flex items-center gap-2">
          {apiMode === 'nodeRed' ? (
            <>
              <Button onClick={() => runAllNodeRedTests()} variant="primary" size="sm">
                Run All Tests
              </Button>
              <Button onClick={() => runAllNodeRedTests('patient')} variant="ghost" size="sm">
                Patient Tests
              </Button>
              <Button onClick={() => runAllNodeRedTests('scheduling')} variant="ghost" size="sm">
                Scheduling Tests
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => runAllCloud9Tests()} variant="primary" size="sm">
                Run All Tests
              </Button>
              <Button onClick={() => runAllCloud9Tests('patient')} variant="ghost" size="sm">
                Patient
              </Button>
              <Button onClick={() => runAllCloud9Tests('scheduling')} variant="ghost" size="sm">
                Scheduling
              </Button>
              <Button onClick={() => runAllCloud9Tests('reference')} variant="ghost" size="sm">
                Reference
              </Button>
              <Button onClick={() => runAllCloud9Tests('write')} variant="ghost" size="sm">
                Write Ops
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Node Red Endpoints */}
      {apiMode === 'nodeRed' && (
        <>
          {/* Patient Operations */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              Patient Operations
              <span className="text-sm font-normal text-gray-500">({nodeRedPatientEndpoints.length} endpoints)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodeRedPatientEndpoints.map(endpoint => (
                <TestCard
                  key={endpoint.id}
                  config={endpoint}
                  result={nodeRedResults[endpoint.id]}
                  onRun={() => runNodeRedTest(endpoint)}
                  onInputChange={(data) => handleNodeRedInputChange(endpoint.id, data)}
                />
              ))}
            </div>
          </div>

          {/* Scheduling Operations */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500"></span>
              Scheduling Operations
              <span className="text-sm font-normal text-gray-500">({nodeRedSchedulingEndpoints.length} endpoints)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodeRedSchedulingEndpoints.map(endpoint => (
                <TestCard
                  key={endpoint.id}
                  config={endpoint}
                  result={nodeRedResults[endpoint.id]}
                  onRun={() => runNodeRedTest(endpoint)}
                  onInputChange={(data) => handleNodeRedInputChange(endpoint.id, data)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Cloud9 Direct API Endpoints */}
      {apiMode === 'cloud9' && (
        <>
          {/* Patient Operations */}
          {cloud9PatientEndpoints.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                Patient Operations (GET)
                <span className="text-sm font-normal text-gray-500">({cloud9PatientEndpoints.length} procedures)</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cloud9PatientEndpoints.map(endpoint => (
                  <Cloud9TestCard
                    key={endpoint.id}
                    config={endpoint}
                    result={cloud9Results[endpoint.id]}
                    onRun={() => runCloud9Test(endpoint)}
                    onInputChange={(data) => handleCloud9InputChange(endpoint.id, data)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Scheduling Operations */}
          {cloud9SchedulingEndpoints.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                Scheduling Operations (GET)
                <span className="text-sm font-normal text-gray-500">({cloud9SchedulingEndpoints.length} procedures)</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cloud9SchedulingEndpoints.map(endpoint => (
                  <Cloud9TestCard
                    key={endpoint.id}
                    config={endpoint}
                    result={cloud9Results[endpoint.id]}
                    onRun={() => runCloud9Test(endpoint)}
                    onInputChange={(data) => handleCloud9InputChange(endpoint.id, data)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Reference Data */}
          {cloud9ReferenceEndpoints.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Reference Data (GET)
                <span className="text-sm font-normal text-gray-500">({cloud9ReferenceEndpoints.length} procedures)</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cloud9ReferenceEndpoints.map(endpoint => (
                  <Cloud9TestCard
                    key={endpoint.id}
                    config={endpoint}
                    result={cloud9Results[endpoint.id]}
                    onRun={() => runCloud9Test(endpoint)}
                    onInputChange={(data) => handleCloud9InputChange(endpoint.id, data)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Write Operations */}
          {cloud9WriteEndpoints.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                Write Operations (SET)
                <span className="text-sm font-normal text-gray-500">({cloud9WriteEndpoints.length} procedures)</span>
              </h2>
              <div className="p-3 mb-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  <strong>Warning:</strong> These operations modify data in the Cloud9 sandbox environment.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cloud9WriteEndpoints.map(endpoint => (
                  <Cloud9TestCard
                    key={endpoint.id}
                    config={endpoint}
                    result={cloud9Results[endpoint.id]}
                    onRun={() => runCloud9Test(endpoint)}
                    onInputChange={(data) => handleCloud9InputChange(endpoint.id, data)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

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
      <ApiAgentChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
