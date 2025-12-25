/**
 * CategoryFilter Component
 * Category checkbox filter with test counts
 */

import React from 'react';

interface CategoryCount {
  'happy-path': number;
  'edge-case': number;
  'error-handling': number;
}

interface CategoryFilterProps {
  selectedCategories: string[];
  categoryCounts: CategoryCount;
  onToggle: (category: string) => void;
  disabled?: boolean;
}

const CATEGORY_CONFIG: Record<string, { name: string; color: string; bgColor: string }> = {
  'happy-path': {
    name: 'Happy Path',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  'edge-case': {
    name: 'Edge Cases',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  'error-handling': {
    name: 'Error Handling',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
};

export function CategoryFilter({
  selectedCategories,
  categoryCounts,
  onToggle,
  disabled = false,
}: CategoryFilterProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Categories
      </h4>
      {Object.entries(CATEGORY_CONFIG).map(([category, config]) => {
        const isSelected = selectedCategories.includes(category);
        const count = categoryCounts[category as keyof CategoryCount] || 0;

        return (
          <label
            key={category}
            className={`
              flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all
              ${isSelected
                ? `${config.bgColor} border border-current ${config.color}`
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => !disabled && onToggle(category)}
                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                disabled={disabled}
              />
              <span className={`text-sm font-medium ${isSelected ? config.color : 'text-gray-700 dark:text-gray-300'}`}>
                {config.name}
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
              {count}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default CategoryFilter;
