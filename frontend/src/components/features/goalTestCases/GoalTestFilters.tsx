/**
 * Goal Test Filters Component
 * Search bar and filter dropdowns for goal test cases
 */

import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import type { GoalTestFilters as FiltersType, GoalTestFilterPreset } from '../../../types/testMonitor.types';

// Icons
const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const BookmarkIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
);

interface MultiSelectDropdownProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiSelectDropdown({ label, options, selected, onChange }: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAll = () => onChange(options.map(o => o.value));
  const clearAll = () => onChange([]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
          'border border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-800',
          'text-gray-700 dark:text-gray-300',
          'hover:bg-gray-50 dark:hover:bg-gray-700',
          'transition-colors',
          selected.length > 0 && 'ring-1 ring-blue-500'
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-500 rounded-full">
            {selected.length}
          </span>
        )}
        <ChevronDownIcon />
      </button>

      {isOpen && (
        <div className={clsx(
          'absolute z-50 mt-1 w-56 rounded-md shadow-lg',
          'bg-white dark:bg-gray-800',
          'border border-gray-200 dark:border-gray-700',
          'py-1'
        )}>
          {/* Quick actions */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={selectAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
            >
              Clear
            </button>
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto">
            {options.map(option => (
              <label
                key={option.value}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer',
                  'hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggleOption(option.value)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface GoalTestFiltersProps {
  filters?: FiltersType;
  presets?: GoalTestFilterPreset[];
  onFilterChange: (filters: Partial<FiltersType>) => void;
  onClearFilters: () => void;
  availableTags?: string[];
  availablePersonas?: string[];
  savedPresets?: GoalTestFilterPreset[];
  activePreset?: string | null;
  onApplyPreset: (presetId: string) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (presetId: string) => void;
  activeFiltersCount?: number;
}

const defaultFilters: FiltersType = {
  search: '',
  categories: ['happy-path', 'edge-case', 'error-handling'],
  tags: [],
  personas: [],
  goalTypes: [],
  includeArchived: false,
};

export function GoalTestFilters({
  filters: propFilters,
  presets,
  onFilterChange,
  onClearFilters,
  availableTags = [],
  availablePersonas = [],
  savedPresets,
  activePreset = null,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  activeFiltersCount = 0,
}: GoalTestFiltersProps) {
  // Use filters from props with defaults as fallback
  const filters = propFilters || defaultFilters;
  // Support both presets and savedPresets prop names
  const allPresets = savedPresets || presets || [];
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const presetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (presetRef.current && !presetRef.current.contains(event.target as Node)) {
        setShowPresetMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categoryOptions = [
    { value: 'happy-path', label: 'Happy Path' },
    { value: 'edge-case', label: 'Edge Case' },
    { value: 'error-handling', label: 'Error Handling' },
  ];

  const goalTypeOptions = [
    { value: 'data_collection', label: 'Data Collection' },
    { value: 'booking_confirmed', label: 'Booking Confirmed' },
    { value: 'transfer_initiated', label: 'Transfer Initiated' },
    { value: 'conversation_ended', label: 'Conversation Ended' },
    { value: 'error_handled', label: 'Error Handled' },
  ];

  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      onSavePreset(newPresetName.trim());
      setNewPresetName('');
      setShowPresetMenu(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Main filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <SearchIcon />
          </div>
          <input
            type="text"
            placeholder="Search tests..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className={clsx(
              'w-full pl-9 pr-3 py-1.5 text-sm rounded-md',
              'border border-gray-300 dark:border-gray-600',
              'bg-white dark:bg-gray-800',
              'text-gray-900 dark:text-gray-100',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
            )}
          />
        </div>

        {/* Filter dropdowns */}
        <MultiSelectDropdown
          label="Categories"
          options={categoryOptions}
          selected={filters.categories}
          onChange={(categories) => onFilterChange({ categories })}
        />

        {availableTags.length > 0 && (
          <MultiSelectDropdown
            label="Tags"
            options={availableTags.map(t => ({ value: t, label: t }))}
            selected={filters.tags}
            onChange={(tags) => onFilterChange({ tags })}
          />
        )}

        {availablePersonas.length > 0 && (
          <MultiSelectDropdown
            label="Personas"
            options={availablePersonas.map(p => ({ value: p, label: p }))}
            selected={filters.personas}
            onChange={(personas) => onFilterChange({ personas })}
          />
        )}

        <MultiSelectDropdown
          label="Goal Types"
          options={goalTypeOptions}
          selected={filters.goalTypes}
          onChange={(goalTypes) => onFilterChange({ goalTypes })}
        />

        {/* Archived toggle */}
        <label className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md cursor-pointer',
          'border border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-800',
          filters.includeArchived && 'ring-1 ring-blue-500'
        )}>
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(e) => onFilterChange({ includeArchived: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700 dark:text-gray-300">Archived</span>
        </label>

        {/* Presets dropdown */}
        <div ref={presetRef} className="relative">
          <button
            onClick={() => setShowPresetMenu(!showPresetMenu)}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
              'border border-gray-300 dark:border-gray-600',
              'bg-white dark:bg-gray-800',
              'text-gray-700 dark:text-gray-300',
              'hover:bg-gray-50 dark:hover:bg-gray-700',
              activePreset && 'ring-1 ring-blue-500'
            )}
          >
            <BookmarkIcon />
            Presets
            <ChevronDownIcon />
          </button>

          {showPresetMenu && (
            <div className={clsx(
              'absolute right-0 z-50 mt-1 w-64 rounded-md shadow-lg',
              'bg-white dark:bg-gray-800',
              'border border-gray-200 dark:border-gray-700',
              'py-1'
            )}>
              {/* Save new preset */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Save current filters..."
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                    className={clsx(
                      'flex-1 px-2 py-1 text-sm rounded',
                      'border border-gray-300 dark:border-gray-600',
                      'bg-white dark:bg-gray-700',
                      'text-gray-900 dark:text-gray-100'
                    )}
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!newPresetName.trim()}
                    className={clsx(
                      'px-2 py-1 text-sm font-medium rounded',
                      'bg-blue-600 text-white hover:bg-blue-700',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Saved presets */}
              {allPresets.length > 0 ? (
                <div className="max-h-48 overflow-y-auto">
                  {allPresets.map(preset => (
                    <div
                      key={preset.id}
                      className={clsx(
                        'flex items-center justify-between px-3 py-2',
                        'hover:bg-gray-50 dark:hover:bg-gray-700',
                        activePreset === preset.id && 'bg-blue-50 dark:bg-blue-900/20'
                      )}
                    >
                      <button
                        onClick={() => {
                          onApplyPreset(preset.id);
                          setShowPresetMenu(false);
                        }}
                        className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300"
                      >
                        {preset.name}
                      </button>
                      <button
                        onClick={() => onDeletePreset(preset.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <XIcon />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  No saved presets
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clear all filters */}
        {activeFiltersCount > 0 && (
          <button
            onClick={onClearFilters}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
              'text-red-600 dark:text-red-400',
              'hover:bg-red-50 dark:hover:bg-red-900/20',
              'transition-colors'
            )}
          >
            <XIcon />
            Clear ({activeFiltersCount})
          </button>
        )}
      </div>
    </div>
  );
}

export default GoalTestFilters;
