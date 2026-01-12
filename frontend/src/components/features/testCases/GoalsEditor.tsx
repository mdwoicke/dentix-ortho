/**
 * GoalsEditor Component
 *
 * Edit conversation goals for goal-oriented tests.
 * Supports different goal types with required fields selection.
 */

import { useState } from 'react';
import type {
  ConversationGoalDTO,
  GoalTypeDTO,
  CollectableFieldDTO,
  FieldDefaultValueDTO,
} from '../../../types/testMonitor.types';
import { COLLECTABLE_FIELDS, GOAL_TYPES } from '../../../types/testMonitor.types';

/**
 * Map of collectable fields to their persona field equivalents.
 * Fields with persona mappings get their values from the persona.
 * Fields without mappings (null) can be configured at the goal level.
 */
const FIELD_PERSONA_MAPPING: Record<CollectableFieldDTO, string | null> = {
  parent_name: 'parentFirstName/LastName',
  parent_name_spelling: null, // No persona mapping - behavior flag
  parent_phone: 'parentPhone',
  parent_email: 'parentEmail',
  child_count: 'children.length',
  child_names: 'children[].firstName/lastName',
  child_dob: 'children[].dateOfBirth',
  child_age: 'children[].dateOfBirth',
  is_new_patient: 'children[].isNewPatient',
  previous_visit: 'previousVisitToOffice',
  previous_ortho: 'previousOrthoTreatment',
  insurance: 'hasInsurance/insuranceProvider',
  special_needs: 'children[].specialNeeds',
  time_preference: 'preferredTimeOfDay',
  location_preference: 'preferredLocation',
};

export interface GoalsEditorProps {
  goals: ConversationGoalDTO[];
  onChange: (goals: ConversationGoalDTO[]) => void;
  readOnly?: boolean;
}

const DEFAULT_GOAL: ConversationGoalDTO = {
  id: '',
  type: 'data_collection',
  description: '',
  requiredFields: [],
  priority: 1,
  required: true,
};

let goalIdCounter = 0;

function generateGoalId(): string {
  return `goal-${Date.now()}-${goalIdCounter++}`;
}

export function GoalsEditor({ goals, onChange }: GoalsEditorProps) {
  const [expandedGoal, setExpandedGoal] = useState<number | null>(goals.length > 0 ? 0 : null);

  const addGoal = () => {
    const newGoal: ConversationGoalDTO = {
      ...DEFAULT_GOAL,
      id: generateGoalId(),
    };
    onChange([...goals, newGoal]);
    setExpandedGoal(goals.length);
  };

  const removeGoal = (index: number) => {
    const newGoals = goals.filter((_, i) => i !== index);
    onChange(newGoals);
    if (expandedGoal === index) {
      setExpandedGoal(null);
    } else if (expandedGoal !== null && expandedGoal > index) {
      setExpandedGoal(expandedGoal - 1);
    }
  };

  const updateGoal = (index: number, updates: Partial<ConversationGoalDTO>) => {
    const newGoals = [...goals];
    newGoals[index] = { ...newGoals[index], ...updates };
    onChange(newGoals);
  };

  const toggleField = (index: number, field: CollectableFieldDTO) => {
    const goal = goals[index];
    const currentFields = goal.requiredFields || [];
    const newFields = currentFields.includes(field)
      ? currentFields.filter(f => f !== field)
      : [...currentFields, field];

    // If removing a field, also remove its default value
    if (!newFields.includes(field) && goal.fieldDefaults?.[field]) {
      const newDefaults = { ...goal.fieldDefaults };
      delete newDefaults[field];
      updateGoal(index, { requiredFields: newFields, fieldDefaults: newDefaults });
    } else {
      updateGoal(index, { requiredFields: newFields });
    }
  };

  const updateFieldDefault = (index: number, field: CollectableFieldDTO, defaultValue: FieldDefaultValueDTO | undefined) => {
    const goal = goals[index];
    const newDefaults = { ...goal.fieldDefaults };
    if (defaultValue) {
      newDefaults[field] = defaultValue;
    } else {
      delete newDefaults[field];
    }
    updateGoal(index, { fieldDefaults: newDefaults });
  };

  const getFieldConfig = (field: CollectableFieldDTO) => {
    return COLLECTABLE_FIELDS.find(f => f.value === field);
  };

  const getGoalTypeInfo = (type: GoalTypeDTO) => {
    return GOAL_TYPES.find(t => t.value === type) || GOAL_TYPES[0];
  };

  const getSeverityColor = (priority: number) => {
    if (priority === 1) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (priority === 2) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Conversation Goals ({goals.length})
        </h4>
        <button
          onClick={addGoal}
          className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded transition-colors"
        >
          + Add Goal
        </button>
      </div>

      {/* Goals List */}
      <div className="space-y-3">
        {goals.map((goal, index) => (
          <div
            key={goal.id || index}
            className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            {/* Goal Header */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onClick={() => setExpandedGoal(expandedGoal === index ? null : index)}
            >
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${getSeverityColor(goal.priority)}`}>
                  P{goal.priority}
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {getGoalTypeInfo(goal.type).label}
                </span>
                {goal.required && (
                  <span className="text-xs text-red-500">Required</span>
                )}
                {goal.type === 'data_collection' && goal.requiredFields && (
                  <span className="text-xs text-gray-500">
                    ({goal.requiredFields.length} fields)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); removeGoal(index); }}
                  className="p-1 text-red-500 hover:text-red-700"
                  title="Remove goal"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedGoal === index ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Goal Details */}
            {expandedGoal === index && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                {/* Goal Type */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Goal Type *
                  </label>
                  <select
                    value={goal.type}
                    onChange={(e) => updateGoal(index, { type: e.target.value as GoalTypeDTO })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    {GOAL_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label} - {type.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Goal ID and Description */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Goal ID
                    </label>
                    <input
                      type="text"
                      value={goal.id}
                      onChange={(e) => updateGoal(index, { id: e.target.value })}
                      placeholder="collect-parent-info"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Priority
                    </label>
                    <select
                      value={goal.priority}
                      onChange={(e) => updateGoal(index, { priority: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      <option value={1}>P1 - Critical</option>
                      <option value={2}>P2 - High</option>
                      <option value={3}>P3 - Normal</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={goal.description}
                    onChange={(e) => updateGoal(index, { description: e.target.value })}
                    placeholder="Describe what this goal should achieve"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                </div>

                {/* Required Fields (only for data_collection) */}
                {goal.type === 'data_collection' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Required Fields to Collect
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {COLLECTABLE_FIELDS.map(field => {
                          const hasPersonaMapping = FIELD_PERSONA_MAPPING[field.value] !== null;
                          const isSelected = goal.requiredFields?.includes(field.value);
                          const hasDefault = goal.fieldDefaults?.[field.value];
                          return (
                            <button
                              key={field.value}
                              onClick={() => toggleField(index, field.value)}
                              title={hasDefault ? 'Has custom default value' : (hasPersonaMapping ? `Uses persona field: ${FIELD_PERSONA_MAPPING[field.value]}` : 'No persona mapping')}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                isSelected
                                  ? hasDefault
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-primary-500 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {field.label}
                              {isSelected && hasDefault && (
                                <span className="ml-1" title="Has custom default">◆</span>
                              )}
                              {isSelected && !hasDefault && hasPersonaMapping && (
                                <span className="ml-1 opacity-70" title="Value from Persona">●</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        <span className="text-primary-400">●</span> = From Persona | <span className="text-purple-400">◆</span> = Custom default
                      </p>
                    </div>

                    {/* Default Values Configuration */}
                    {(() => {
                      const fieldsWithDefaults = (goal.requiredFields || []).filter(fieldValue => {
                        const config = getFieldConfig(fieldValue);
                        return config?.supportsDefault;
                      });

                      if (fieldsWithDefaults.length === 0) {
                        return (
                          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                              Select Time Preference, Location, Insurance, Special Needs, or boolean fields to configure default values.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Field Values (🎲 Random by default, or select a fixed value)
                          </label>
                          <div className="space-y-2">
                            {fieldsWithDefaults.map(fieldValue => {
                              const config = getFieldConfig(fieldValue);
                              if (!config) return null;
                              const currentDefault = goal.fieldDefaults?.[fieldValue];
                              const hasFixedDefault = currentDefault && !currentDefault.useRandom;

                              return (
                                <div key={fieldValue} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-32">
                                    {config.label}
                                  </span>

                                  {/* Value selector - first option is Random */}
                                  <select
                                    value={hasFixedDefault ? currentDefault.fixedValue : '_random_'}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value === '_random_') {
                                        // Clear fixed default - will use random
                                        updateFieldDefault(index, fieldValue, undefined);
                                      } else {
                                        // Set fixed default
                                        updateFieldDefault(index, fieldValue, {
                                          useRandom: false,
                                          fixedValue: value,
                                        });
                                      }
                                    }}
                                    className={`flex-1 px-2 py-1 text-xs border rounded ${
                                      hasFixedDefault
                                        ? 'border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                                    }`}
                                  >
                                    <option value="_random_">🎲 Random</option>
                                    {config.defaultPool?.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Required checkbox */}
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={goal.required}
                    onChange={(e) => updateGoal(index, { required: e.target.checked })}
                    className="rounded"
                  />
                  Goal is required for test to pass
                </label>
              </div>
            )}
          </div>
        ))}

        {goals.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <p>No goals defined yet.</p>
            <p className="text-xs mt-1">Click "Add Goal" to define what this test should achieve.</p>
          </div>
        )}
      </div>

      {/* Quick Add Presets */}
      {goals.length < 3 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick Add:</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                onChange([...goals, {
                  id: 'collect-parent-info',
                  type: 'data_collection',
                  description: 'Collect parent contact information',
                  requiredFields: ['parent_name', 'parent_phone'],
                  priority: 1,
                  required: true,
                }]);
              }}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
            >
              + Parent Info
            </button>
            <button
              onClick={() => {
                onChange([...goals, {
                  id: 'collect-child-info',
                  type: 'data_collection',
                  description: 'Collect child information',
                  requiredFields: ['child_names', 'child_dob'],
                  priority: 1,
                  required: true,
                }]);
              }}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
            >
              + Child Info
            </button>
            <button
              onClick={() => {
                onChange([...goals, {
                  id: 'booking-confirmed',
                  type: 'booking_confirmed',
                  description: 'Complete appointment booking',
                  priority: 1,
                  required: true,
                }]);
              }}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
            >
              + Booking Confirmed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoalsEditor;
