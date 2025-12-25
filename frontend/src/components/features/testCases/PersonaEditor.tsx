/**
 * PersonaEditor Component
 *
 * Edit the user persona for goal-oriented tests.
 * Includes parent info, children, insurance, preferences, and traits.
 * Supports dynamic field generation with DynamicFieldToggle.
 */

import React, { useState } from 'react';
import type {
  UserPersonaDTO,
  ChildDataDTO,
  DataInventoryDTO,
  PersonaTraitsDTO,
  DynamicFieldSpecDTO,
  DynamicChildDataDTO,
  DynamicDataInventoryDTO,
  DynamicUserPersonaDTO,
} from '../../../types/testMonitor.types';
import { isDynamicFieldDTO, DEFAULT_FIELD_CONSTRAINTS } from '../../../types/testMonitor.types';
import DynamicFieldToggle from './DynamicFieldToggle';

// Support both static and dynamic personas
type PersonaType = UserPersonaDTO | DynamicUserPersonaDTO;

interface PersonaEditorProps {
  persona: PersonaType;
  onChange: (persona: PersonaType) => void;
}

const DEFAULT_CHILD: ChildDataDTO = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  isNewPatient: true,
  hadBracesBefore: false,
  specialNeeds: '',
};

// Helper to get fixed value from potentially dynamic field
function getFixedValue<T>(value: T | DynamicFieldSpecDTO | undefined, defaultValue: T): T {
  if (value === undefined) return defaultValue;
  if (isDynamicFieldDTO(value)) return defaultValue;
  return value as T;
}

export function PersonaEditor({ persona, onChange }: PersonaEditorProps) {
  const [expandedChild, setExpandedChild] = useState<number | null>(0);

  // Cast inventory to dynamic type for flexibility
  const inventory = persona.inventory as DynamicDataInventoryDTO;

  const updateInventory = (
    field: string,
    value: string | boolean | DynamicFieldSpecDTO | DynamicChildDataDTO[]
  ) => {
    onChange({
      ...persona,
      inventory: {
        ...persona.inventory,
        [field]: value,
      },
    } as PersonaType);
  };

  const updateTraits = <K extends keyof PersonaTraitsDTO>(
    field: K,
    value: PersonaTraitsDTO[K]
  ) => {
    onChange({
      ...persona,
      traits: {
        ...persona.traits,
        [field]: value,
      },
    } as PersonaType);
  };

  const updateChild = (index: number, field: string, value: string | boolean | DynamicFieldSpecDTO) => {
    const newChildren = [...inventory.children] as DynamicChildDataDTO[];
    newChildren[index] = { ...newChildren[index], [field]: value };
    updateInventory('children', newChildren);
  };

  const addChild = () => {
    const newChildren = [...persona.inventory.children, { ...DEFAULT_CHILD }];
    updateInventory('children', newChildren);
    setExpandedChild(newChildren.length - 1);
  };

  const removeChild = (index: number) => {
    const newChildren = persona.inventory.children.filter((_, i) => i !== index);
    updateInventory('children', newChildren);
    if (expandedChild === index) {
      setExpandedChild(null);
    } else if (expandedChild !== null && expandedChild > index) {
      setExpandedChild(expandedChild - 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Persona Name & Description */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Persona Identity
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Persona Name
            </label>
            <input
              type="text"
              value={persona.name}
              onChange={(e) => onChange({ ...persona, name: e.target.value })}
              placeholder="e.g., Sarah Johnson"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Description
            </label>
            <input
              type="text"
              value={persona.description || ''}
              onChange={(e) => onChange({ ...persona, description: e.target.value })}
              placeholder="Brief description of this persona"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Parent Information */}
      <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Parent Information
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <DynamicFieldToggle
            label="First Name"
            fieldType="firstName"
            value={inventory.parentFirstName}
            onChange={(value) => updateInventory('parentFirstName', value)}
            required
            placeholder="Sarah"
            showConstraints={false}
          />
          <DynamicFieldToggle
            label="Last Name"
            fieldType="lastName"
            value={inventory.parentLastName}
            onChange={(value) => updateInventory('parentLastName', value)}
            required
            placeholder="Johnson"
            showConstraints={false}
          />
          <DynamicFieldToggle
            label="Phone Number"
            fieldType="phone"
            value={inventory.parentPhone}
            onChange={(value) => updateInventory('parentPhone', value)}
            required
            inputType="tel"
            placeholder="2155551234"
            showConstraints={false}
          />
          <DynamicFieldToggle
            label="Email"
            fieldType="email"
            value={inventory.parentEmail || ''}
            onChange={(value) => updateInventory('parentEmail', value)}
            inputType="email"
            placeholder="sarah@email.com"
            showConstraints={false}
          />
        </div>
      </div>

      {/* Children */}
      <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Children ({persona.inventory.children.length})
          </h4>
          <button
            onClick={addChild}
            className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            + Add Child
          </button>
        </div>

        {persona.inventory.children.map((child, index) => (
          <div
            key={index}
            className="border border-blue-200 dark:border-blue-800 rounded-lg bg-white dark:bg-gray-800"
          >
            {/* Child Header */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onClick={() => setExpandedChild(expandedChild === index ? null : index)}
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Child {index + 1}: {child.firstName || 'Unnamed'} {child.lastName}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); removeChild(index); }}
                  className="p-1 text-red-500 hover:text-red-700"
                  title="Remove child"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedChild === index ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Child Details */}
            {expandedChild === index && (
              <div className="p-3 border-t border-blue-200 dark:border-blue-800 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <DynamicFieldToggle
                    label="First Name"
                    fieldType="firstName"
                    value={(inventory.children[index] as DynamicChildDataDTO)?.firstName}
                    onChange={(value) => updateChild(index, 'firstName', value)}
                    required
                    placeholder="Emma"
                    showConstraints={false}
                  />
                  <DynamicFieldToggle
                    label="Last Name"
                    fieldType="lastName"
                    value={(inventory.children[index] as DynamicChildDataDTO)?.lastName}
                    onChange={(value) => updateChild(index, 'lastName', value)}
                    required
                    placeholder="Johnson"
                    showConstraints={false}
                  />
                  <DynamicFieldToggle
                    label="Date of Birth"
                    fieldType="dateOfBirth"
                    value={(inventory.children[index] as DynamicChildDataDTO)?.dateOfBirth}
                    onChange={(value) => updateChild(index, 'dateOfBirth', value)}
                    required
                    inputType="date"
                    showConstraints={true}
                    defaultConstraints={DEFAULT_FIELD_CONSTRAINTS.dateOfBirth}
                  />
                  <DynamicFieldToggle
                    label="Special Needs"
                    fieldType="specialNeeds"
                    value={(inventory.children[index] as DynamicChildDataDTO)?.specialNeeds || ''}
                    onChange={(value) => updateChild(index, 'specialNeeds', value)}
                    placeholder="None"
                    showConstraints={true}
                  />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={getFixedValue(
                        (inventory.children[index] as DynamicChildDataDTO)?.isNewPatient,
                        true
                      )}
                      onChange={(e) => updateChild(index, 'isNewPatient', e.target.checked)}
                      className="rounded"
                    />
                    New Patient
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={getFixedValue(
                        (inventory.children[index] as DynamicChildDataDTO)?.hadBracesBefore,
                        false
                      )}
                      onChange={(e) => updateChild(index, 'hadBracesBefore', e.target.checked)}
                      className="rounded"
                    />
                    Had Braces Before
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}

        {persona.inventory.children.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No children added. Click "Add Child" to add one.
          </div>
        )}
      </div>

      {/* Insurance & Preferences */}
      <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Insurance & Preferences
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
              <input
                type="checkbox"
                checked={getFixedValue(inventory.hasInsurance, true)}
                onChange={(e) => updateInventory('hasInsurance', e.target.checked)}
                className="rounded"
              />
              Has Insurance
            </label>
            {getFixedValue(inventory.hasInsurance, true) && (
              <DynamicFieldToggle
                label="Insurance Provider"
                fieldType="insuranceProvider"
                value={inventory.insuranceProvider || ''}
                onChange={(value) => updateInventory('insuranceProvider', value)}
                placeholder="Keystone First"
                showConstraints={true}
                defaultConstraints={DEFAULT_FIELD_CONSTRAINTS.insuranceProvider}
              />
            )}
          </div>
          <div>
            <DynamicFieldToggle
              label="Preferred Location"
              fieldType="location"
              value={inventory.preferredLocation || ''}
              onChange={(value) => updateInventory('preferredLocation', value)}
              inputType="select"
              selectOptions={[
                { value: '', label: 'Any location' },
                { value: 'Alleghany', label: 'Alleghany' },
                { value: 'Philadelphia', label: 'Philadelphia' },
              ]}
              showConstraints={true}
              defaultConstraints={DEFAULT_FIELD_CONSTRAINTS.location}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Preferred Time
            </label>
            <select
              value={getFixedValue(inventory.preferredTimeOfDay, 'any')}
              onChange={(e) => updateInventory('preferredTimeOfDay', e.target.value as string)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="any">Any time</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={getFixedValue(inventory.previousVisitToOffice, false)}
                onChange={(e) => updateInventory('previousVisitToOffice', e.target.checked)}
                className="rounded"
              />
              Previous Visit to Office
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={getFixedValue(inventory.previousOrthoTreatment, false)}
                onChange={(e) => updateInventory('previousOrthoTreatment', e.target.checked)}
                className="rounded"
              />
              Previous Ortho Treatment
            </label>
          </div>
        </div>
      </div>

      {/* Persona Traits */}
      <div className="space-y-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Personality Traits
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Verbosity
            </label>
            <select
              value={persona.traits.verbosity}
              onChange={(e) => updateTraits('verbosity', e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="terse">Terse (brief answers)</option>
              <option value="normal">Normal</option>
              <option value="verbose">Verbose (detailed answers)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Patience Level
            </label>
            <select
              value={persona.traits.patienceLevel || 'patient'}
              onChange={(e) => updateTraits('patienceLevel', e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="patient">Patient</option>
              <option value="moderate">Moderate</option>
              <option value="impatient">Impatient</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={persona.traits.providesExtraInfo}
            onChange={(e) => updateTraits('providesExtraInfo', e.target.checked)}
            className="rounded"
          />
          Provides extra unrequested information
        </label>
      </div>
    </div>
  );
}

export default PersonaEditor;
