/**
 * DynamicFieldToggle Component
 *
 * A toggle component that allows switching between fixed values and dynamic
 * (randomly generated) values for test persona fields.
 */

import React, { useState } from 'react';
import type {
  DynamicFieldSpecDTO,
  DynamicFieldTypeDTO,
  FieldConstraintsDTO,
} from '../../../types/testMonitor.types';
import { isDynamicFieldDTO, DYNAMIC_FIELD_TYPE_LABELS } from '../../../types/testMonitor.types';
import { ConstraintsPanel } from './ConstraintsPanel';

interface DynamicFieldToggleProps {
  /** Label for the field */
  label: string;
  /** Type of dynamic field for generation */
  fieldType: DynamicFieldTypeDTO;
  /** Current value (either fixed value or DynamicFieldSpec) */
  value: string | boolean | DynamicFieldSpecDTO | undefined;
  /** Callback when value changes */
  onChange: (value: string | boolean | DynamicFieldSpecDTO) => void;
  /** Whether this field is required */
  required?: boolean;
  /** Placeholder text for fixed value input */
  placeholder?: string;
  /** Input type for fixed values */
  inputType?: 'text' | 'tel' | 'email' | 'date' | 'checkbox' | 'select';
  /** Options for select input */
  selectOptions?: { value: string; label: string }[];
  /** Whether constraints editing is available */
  showConstraints?: boolean;
  /** Default constraints for this field type */
  defaultConstraints?: FieldConstraintsDTO;
  /** Whether field is disabled */
  disabled?: boolean;
}

/**
 * Dice icon for dynamic mode
 */
function DiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
      />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Lock icon for fixed mode
 */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

/**
 * Render the fixed value input based on type
 */
function renderFixedInput(
  inputType: string,
  value: string | boolean,
  onChange: (value: string | boolean) => void,
  placeholder?: string,
  selectOptions?: { value: string; label: string }[],
  disabled?: boolean
) {
  const baseClassName =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500';

  switch (inputType) {
    case 'checkbox':
      return (
        <div className="flex items-center h-[38px]">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 dark:border-gray-600"
          />
        </div>
      );

    case 'select':
      return (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={baseClassName}
        >
          {selectOptions?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'date':
      return (
        <input
          type="date"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={baseClassName}
        />
      );

    default:
      return (
        <input
          type={inputType}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={baseClassName}
        />
      );
  }
}

export function DynamicFieldToggle({
  label,
  fieldType,
  value,
  onChange,
  required = false,
  placeholder,
  inputType = 'text',
  selectOptions,
  showConstraints = true,
  defaultConstraints,
  disabled = false,
}: DynamicFieldToggleProps) {
  const [constraintsExpanded, setConstraintsExpanded] = useState(false);

  // Determine if currently in dynamic mode
  const isDynamic = isDynamicFieldDTO(value);

  // Get constraints if in dynamic mode
  const constraints = isDynamic ? (value as DynamicFieldSpecDTO).constraints : undefined;

  // Toggle between fixed and dynamic modes
  const handleToggle = () => {
    if (disabled) return;

    if (isDynamic) {
      // Switch to fixed mode with empty value
      const defaultValue = inputType === 'checkbox' ? false : '';
      onChange(defaultValue);
    } else {
      // Switch to dynamic mode
      const dynamicSpec: DynamicFieldSpecDTO = {
        _dynamic: true,
        fieldType,
        constraints: defaultConstraints,
      };
      onChange(dynamicSpec);
    }
  };

  // Handle fixed value change
  const handleFixedChange = (newValue: string | boolean) => {
    onChange(newValue);
  };

  // Handle constraints change
  const handleConstraintsChange = (newConstraints: FieldConstraintsDTO) => {
    if (isDynamic) {
      const updatedSpec: DynamicFieldSpecDTO = {
        ...(value as DynamicFieldSpecDTO),
        constraints: newConstraints,
      };
      onChange(updatedSpec);
    }
  };

  // Determine if constraints panel should be shown
  const hasConstraints = fieldType === 'dateOfBirth' || fieldType === 'insuranceProvider' || fieldType === 'location' || fieldType === 'boolean';

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-xs text-gray-500 dark:text-gray-400">
        {label}
        {required && ' *'}
      </label>

      {/* Field with toggle */}
      <div className="flex items-center gap-2">
        {/* Dynamic/Fixed toggle button */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={`p-2 rounded-md transition-colors flex-shrink-0 ${
            isDynamic
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isDynamic ? 'Dynamic (random value)' : 'Fixed value'}
        >
          {isDynamic ? (
            <DiceIcon className="w-4 h-4" />
          ) : (
            <LockIcon className="w-4 h-4" />
          )}
        </button>

        {/* Field input or dynamic indicator */}
        <div className="flex-1">
          {isDynamic ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-md border border-purple-200 dark:border-purple-800">
              <DiceIcon className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-purple-600 dark:text-purple-400 flex-1">
                Random {DYNAMIC_FIELD_TYPE_LABELS[fieldType] || fieldType}
              </span>
              {showConstraints && hasConstraints && (
                <button
                  type="button"
                  onClick={() => setConstraintsExpanded(!constraintsExpanded)}
                  className="text-xs text-purple-500 hover:text-purple-700 dark:hover:text-purple-300"
                >
                  {constraintsExpanded ? 'Hide options' : 'Options'}
                </button>
              )}
            </div>
          ) : (
            renderFixedInput(
              inputType,
              value as string | boolean,
              handleFixedChange,
              placeholder,
              selectOptions,
              disabled
            )
          )}
        </div>
      </div>

      {/* Constraints panel (expandable) */}
      {isDynamic && showConstraints && hasConstraints && constraintsExpanded && (
        <div className="ml-10 mt-2">
          <ConstraintsPanel
            fieldType={fieldType}
            constraints={constraints || {}}
            onChange={handleConstraintsChange}
          />
        </div>
      )}
    </div>
  );
}

export default DynamicFieldToggle;
