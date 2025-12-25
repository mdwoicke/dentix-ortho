/**
 * Filter Chips Component
 * Displays active filters as removable chips
 */

import React from 'react';
import { clsx } from 'clsx';
import type { GoalTestFilters } from '../../../types/testMonitor.types';

const XIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

interface FilterChip {
  id: string;
  type: 'category' | 'tag' | 'persona' | 'goalType' | 'search' | 'archived';
  label: string;
  value: string;
}

const chipColors: Record<FilterChip['type'], { bg: string; text: string; hover: string }> = {
  category: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    hover: 'hover:bg-blue-200 dark:hover:bg-blue-900/50',
  },
  tag: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-400',
    hover: 'hover:bg-purple-200 dark:hover:bg-purple-900/50',
  },
  persona: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    hover: 'hover:bg-green-200 dark:hover:bg-green-900/50',
  },
  goalType: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-400',
    hover: 'hover:bg-orange-200 dark:hover:bg-orange-900/50',
  },
  search: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    hover: 'hover:bg-gray-200 dark:hover:bg-gray-700',
  },
  archived: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    hover: 'hover:bg-gray-200 dark:hover:bg-gray-700',
  },
};

const categoryLabels: Record<string, string> = {
  'happy-path': 'Happy Path',
  'edge-case': 'Edge Case',
  'error-handling': 'Error Handling',
};

const goalTypeLabels: Record<string, string> = {
  'data_collection': 'Data Collection',
  'booking_confirmed': 'Booking',
  'transfer_initiated': 'Transfer',
  'conversation_ended': 'End Conversation',
  'error_handled': 'Error Handling',
};

interface FilterChipsProps {
  filters: GoalTestFilters;
  onRemoveFilter: (type: FilterChip['type'], value: string) => void;
  onClearAll: () => void;
}

export function FilterChips({ filters, onRemoveFilter, onClearAll }: FilterChipsProps) {
  // Build list of active filter chips
  const chips: FilterChip[] = [];

  // Only show category chips if not all categories are selected
  if (filters.categories.length > 0 && filters.categories.length < 3) {
    filters.categories.forEach(cat => {
      chips.push({
        id: `category-${cat}`,
        type: 'category',
        label: categoryLabels[cat] || cat,
        value: cat,
      });
    });
  }

  filters.tags.forEach(tag => {
    chips.push({
      id: `tag-${tag}`,
      type: 'tag',
      label: tag,
      value: tag,
    });
  });

  filters.personas.forEach(persona => {
    chips.push({
      id: `persona-${persona}`,
      type: 'persona',
      label: persona,
      value: persona,
    });
  });

  filters.goalTypes.forEach(gt => {
    chips.push({
      id: `goalType-${gt}`,
      type: 'goalType',
      label: goalTypeLabels[gt] || gt,
      value: gt,
    });
  });

  if (filters.search) {
    chips.push({
      id: 'search',
      type: 'search',
      label: `"${filters.search}"`,
      value: filters.search,
    });
  }

  if (filters.includeArchived) {
    chips.push({
      id: 'archived',
      type: 'archived',
      label: 'Include Archived',
      value: 'true',
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Active:
      </span>

      {chips.map(chip => {
        const colors = chipColors[chip.type];
        return (
          <span
            key={chip.id}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
              colors.bg,
              colors.text
            )}
          >
            <span className="max-w-[120px] truncate">{chip.label}</span>
            <button
              onClick={() => onRemoveFilter(chip.type, chip.value)}
              className={clsx(
                'inline-flex items-center justify-center w-4 h-4 rounded-full',
                'transition-colors',
                colors.hover
              )}
            >
              <XIcon />
            </button>
          </span>
        );
      })}

      {chips.length > 2 && (
        <button
          onClick={onClearAll}
          className={clsx(
            'text-xs font-medium text-red-600 dark:text-red-400',
            'hover:underline'
          )}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export default FilterChips;
