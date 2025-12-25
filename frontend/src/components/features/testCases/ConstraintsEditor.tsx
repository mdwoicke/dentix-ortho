/**
 * ConstraintsEditor Component
 *
 * Edit test constraints for goal-oriented tests.
 * Supports different constraint types with severity levels.
 */

import React, { useState } from 'react';
import type {
  TestConstraintDTO,
  ConstraintTypeDTO,
} from '../../../types/testMonitor.types';

interface ConstraintsEditorProps {
  constraints: TestConstraintDTO[];
  onChange: (constraints: TestConstraintDTO[]) => void;
}

const CONSTRAINT_TYPES: { value: ConstraintTypeDTO; label: string; description: string }[] = [
  { value: 'must_happen', label: 'Must Happen', description: 'Something must occur during the conversation' },
  { value: 'must_not_happen', label: 'Must Not Happen', description: 'Something must NOT occur' },
  { value: 'max_turns', label: 'Max Turns', description: 'Limit the number of conversation turns' },
  { value: 'max_time', label: 'Max Time', description: 'Limit the total conversation time' },
];

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
];

const DEFAULT_CONSTRAINT: TestConstraintDTO = {
  type: 'must_not_happen',
  description: '',
  severity: 'high',
};

export function ConstraintsEditor({ constraints, onChange }: ConstraintsEditorProps) {
  const [expandedConstraint, setExpandedConstraint] = useState<number | null>(null);

  const addConstraint = () => {
    onChange([...constraints, { ...DEFAULT_CONSTRAINT }]);
    setExpandedConstraint(constraints.length);
  };

  const removeConstraint = (index: number) => {
    const newConstraints = constraints.filter((_, i) => i !== index);
    onChange(newConstraints);
    if (expandedConstraint === index) {
      setExpandedConstraint(null);
    } else if (expandedConstraint !== null && expandedConstraint > index) {
      setExpandedConstraint(expandedConstraint - 1);
    }
  };

  const updateConstraint = (index: number, updates: Partial<TestConstraintDTO>) => {
    const newConstraints = [...constraints];
    newConstraints[index] = { ...newConstraints[index], ...updates };
    onChange(newConstraints);
  };

  const getConstraintTypeInfo = (type: ConstraintTypeDTO) => {
    return CONSTRAINT_TYPES.find(t => t.value === type) || CONSTRAINT_TYPES[0];
  };

  const getSeverityInfo = (severity: string) => {
    return SEVERITY_OPTIONS.find(s => s.value === severity) || SEVERITY_OPTIONS[0];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Test Constraints ({constraints.length})
        </h4>
        <button
          onClick={addConstraint}
          className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
        >
          + Add Constraint
        </button>
      </div>

      {/* Constraints List */}
      <div className="space-y-3">
        {constraints.map((constraint, index) => (
          <div
            key={index}
            className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            {/* Constraint Header */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onClick={() => setExpandedConstraint(expandedConstraint === index ? null : index)}
            >
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${getSeverityInfo(constraint.severity).color}`}>
                  {getSeverityInfo(constraint.severity).label}
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {getConstraintTypeInfo(constraint.type).label}
                </span>
                {constraint.description && (
                  <span className="text-xs text-gray-500 truncate max-w-[200px]">
                    - {constraint.description}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); removeConstraint(index); }}
                  className="p-1 text-red-500 hover:text-red-700"
                  title="Remove constraint"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedConstraint === index ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Constraint Details */}
            {expandedConstraint === index && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                {/* Constraint Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Constraint Type *
                    </label>
                    <select
                      value={constraint.type}
                      onChange={(e) => updateConstraint(index, { type: e.target.value as ConstraintTypeDTO })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      {CONSTRAINT_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Severity *
                    </label>
                    <select
                      value={constraint.severity}
                      onChange={(e) => updateConstraint(index, { severity: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      {SEVERITY_OPTIONS.map(sev => (
                        <option key={sev.value} value={sev.value}>
                          {sev.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={constraint.description}
                    onChange={(e) => updateConstraint(index, { description: e.target.value })}
                    placeholder="Describe what this constraint validates"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                </div>

                {/* Type-specific fields */}
                {constraint.type === 'max_turns' && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Maximum Turns
                    </label>
                    <input
                      type="number"
                      value={constraint.maxTurns || 20}
                      onChange={(e) => updateConstraint(index, { maxTurns: parseInt(e.target.value) || 20 })}
                      min={1}
                      max={100}
                      className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Test will fail if conversation exceeds this many turns
                    </p>
                  </div>
                )}

                {constraint.type === 'max_time' && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Maximum Time (seconds)
                    </label>
                    <input
                      type="number"
                      value={(constraint.maxTimeMs || 60000) / 1000}
                      onChange={(e) => updateConstraint(index, { maxTimeMs: (parseInt(e.target.value) || 60) * 1000 })}
                      min={10}
                      max={600}
                      className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Test will fail if conversation takes longer than this
                    </p>
                  </div>
                )}

                {(constraint.type === 'must_happen' || constraint.type === 'must_not_happen') && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded text-xs text-gray-600 dark:text-gray-400">
                    <p>
                      {constraint.type === 'must_happen'
                        ? 'Define what MUST occur during the conversation in the description above.'
                        : 'Define what must NOT occur during the conversation in the description above.'}
                    </p>
                    <p className="mt-1">
                      The test runner will evaluate this based on the conversation transcript.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {constraints.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <p>No constraints defined yet.</p>
            <p className="text-xs mt-1">Constraints help catch issues like errors or conversations taking too long.</p>
          </div>
        )}
      </div>

      {/* Quick Add Presets */}
      {constraints.length < 4 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick Add:</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                onChange([...constraints, {
                  type: 'must_not_happen',
                  description: 'No error messages in responses',
                  severity: 'critical',
                }]);
              }}
              className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded"
            >
              + No Errors
            </button>
            <button
              onClick={() => {
                onChange([...constraints, {
                  type: 'must_not_happen',
                  description: 'No internal system information exposed',
                  severity: 'critical',
                }]);
              }}
              className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded"
            >
              + No Internal Exposure
            </button>
            <button
              onClick={() => {
                onChange([...constraints, {
                  type: 'max_turns',
                  description: 'Conversation should complete within limit',
                  severity: 'high',
                  maxTurns: 25,
                }]);
              }}
              className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 rounded"
            >
              + Max 25 Turns
            </button>
            <button
              onClick={() => {
                onChange([...constraints, {
                  type: 'max_time',
                  description: 'Conversation should complete quickly',
                  severity: 'medium',
                  maxTimeMs: 120000,
                }]);
              }}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
            >
              + Max 2 Minutes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConstraintsEditor;
