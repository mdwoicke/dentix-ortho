/**
 * ConstraintsPanel Component
 *
 * Displays and edits constraints for dynamic field generation.
 * Different constraint options are shown based on field type.
 */

import React from 'react';
import type {
  DynamicFieldTypeDTO,
  FieldConstraintsDTO,
} from '../../../types/testMonitor.types';
import { DEFAULT_DYNAMIC_POOLS } from '../../../types/testMonitor.types';

interface ConstraintsPanelProps {
  /** Type of field being constrained */
  fieldType: DynamicFieldTypeDTO;
  /** Current constraints */
  constraints: FieldConstraintsDTO;
  /** Callback when constraints change */
  onChange: (constraints: FieldConstraintsDTO) => void;
}

/**
 * Render constraints for date of birth field
 */
function DateOfBirthConstraints({
  constraints,
  onChange,
}: {
  constraints: FieldConstraintsDTO;
  onChange: (constraints: FieldConstraintsDTO) => void;
}) {
  return (
    <div className="p-3 bg-purple-50/50 dark:bg-purple-900/10 rounded-md border border-purple-100 dark:border-purple-800/50 space-y-3">
      <div className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-2">
        Age Range for Generated Date
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Min Age (years)
          </label>
          <input
            type="number"
            value={constraints.minAge ?? 7}
            onChange={(e) =>
              onChange({ ...constraints, minAge: parseInt(e.target.value) || 7 })
            }
            min={1}
            max={25}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Max Age (years)
          </label>
          <input
            type="number"
            value={constraints.maxAge ?? 18}
            onChange={(e) =>
              onChange({ ...constraints, maxAge: parseInt(e.target.value) || 18 })
            }
            min={1}
            max={30}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Child will be between {constraints.minAge ?? 7} and {constraints.maxAge ?? 18} years old
      </p>
    </div>
  );
}

/**
 * Render constraints for pool-based fields (insurance provider, location)
 */
function PoolConstraints({
  constraints,
  onChange,
  defaultPool,
  label,
  placeholder,
}: {
  constraints: FieldConstraintsDTO;
  onChange: (constraints: FieldConstraintsDTO) => void;
  defaultPool: string[];
  label: string;
  placeholder: string;
}) {
  const currentOptions = constraints.options || defaultPool;

  return (
    <div className="p-3 bg-purple-50/50 dark:bg-purple-900/10 rounded-md border border-purple-100 dark:border-purple-800/50 space-y-3">
      <div className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-2">
        {label}
      </div>
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
          Options (one per line)
        </label>
        <textarea
          value={currentOptions.join('\n')}
          onChange={(e) =>
            onChange({
              ...constraints,
              options: e.target.value.split('\n').filter((line) => line.trim()),
            })
          }
          placeholder={placeholder}
          rows={Math.min(6, Math.max(3, currentOptions.length + 1))}
          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...constraints, options: defaultPool })}
          className="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
        >
          Reset to defaults
        </button>
        <span className="text-xs text-gray-400">|</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {currentOptions.length} option{currentOptions.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * Render constraints for boolean fields
 */
function BooleanConstraints({
  constraints,
  onChange,
}: {
  constraints: FieldConstraintsDTO;
  onChange: (constraints: FieldConstraintsDTO) => void;
}) {
  const probability = constraints.probability ?? 0.5;
  const percentTrue = Math.round(probability * 100);

  return (
    <div className="p-3 bg-purple-50/50 dark:bg-purple-900/10 rounded-md border border-purple-100 dark:border-purple-800/50 space-y-3">
      <div className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-2">
        Probability of True
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={percentTrue}
          onChange={(e) =>
            onChange({
              ...constraints,
              probability: parseInt(e.target.value) / 100,
            })
          }
          className="flex-1 accent-purple-500"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">
          {percentTrue}%
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {percentTrue}% chance of true, {100 - percentTrue}% chance of false
      </p>
    </div>
  );
}

/**
 * Main ConstraintsPanel component
 */
export function ConstraintsPanel({
  fieldType,
  constraints,
  onChange,
}: ConstraintsPanelProps) {
  switch (fieldType) {
    case 'dateOfBirth':
      return <DateOfBirthConstraints constraints={constraints} onChange={onChange} />;

    case 'insuranceProvider':
      return (
        <PoolConstraints
          constraints={constraints}
          onChange={onChange}
          defaultPool={DEFAULT_DYNAMIC_POOLS.insuranceProviders}
          label="Pick from Insurance Providers"
          placeholder="Keystone First\nAetna Better Health\n..."
        />
      );

    case 'location':
      return (
        <PoolConstraints
          constraints={constraints}
          onChange={onChange}
          defaultPool={DEFAULT_DYNAMIC_POOLS.locations}
          label="Pick from Locations"
          placeholder="Alleghany\nPhiladelphia"
        />
      );

    case 'specialNeeds':
      return (
        <PoolConstraints
          constraints={constraints}
          onChange={onChange}
          defaultPool={DEFAULT_DYNAMIC_POOLS.specialNeeds}
          label="Pick from Special Needs Options"
          placeholder="None\nAutism\nADHD\n..."
        />
      );

    case 'boolean':
      return <BooleanConstraints constraints={constraints} onChange={onChange} />;

    default:
      // No constraints UI for simple fields like firstName, lastName, phone, email
      return (
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          No additional options available for this field type.
        </div>
      );
  }
}

export default ConstraintsPanel;
