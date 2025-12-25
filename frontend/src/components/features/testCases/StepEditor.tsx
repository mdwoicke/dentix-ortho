/**
 * StepEditor Component
 * Editable list of test steps with drag-and-drop reordering
 */

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PatternEditor } from './PatternEditor';
import { SemanticExpectationBuilder } from './SemanticExpectationBuilder';
import type {
  TestCaseStepDTO,
  TestCasePresets,
  SemanticExpectationDTO,
  NegativeExpectationDTO,
} from '../../../types/testMonitor.types';

interface StepEditorProps {
  steps: TestCaseStepDTO[];
  onChange: (steps: TestCaseStepDTO[]) => void;
  presets: TestCasePresets | null;
}

interface SortableStepProps {
  step: TestCaseStepDTO;
  index: number;
  onUpdate: (index: number, updates: Partial<TestCaseStepDTO>) => void;
  onDelete: (index: number) => void;
  presets: TestCasePresets | null;
}

function SortableStep({ step, index, onUpdate, onDelete, presets }: SortableStepProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleFieldChange = (field: keyof TestCaseStepDTO, value: any) => {
    onUpdate(index, { [field]: value });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${
        isDragging ? 'opacity-50 z-50' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>

        {/* Step Number */}
        <span className="w-6 h-6 flex items-center justify-center bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full text-xs font-medium">
          {index + 1}
        </span>

        {/* Description Input */}
        <input
          type="text"
          value={step.description || ''}
          onChange={(e) => handleFieldChange('description', e.target.value)}
          placeholder={`Step ${index + 1} description`}
          className="flex-1 px-2 py-1 text-sm bg-transparent border-none focus:ring-0 text-gray-900 dark:text-white placeholder-gray-400"
        />

        {/* Optional Badge */}
        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={step.optional || false}
            onChange={(e) => handleFieldChange('optional', e.target.checked)}
            className="h-3 w-3 text-primary-600 border-gray-300 rounded"
          />
          Optional
        </label>

        {/* Expand/Collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(index)}
          className="p-1 text-gray-400 hover:text-red-500"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
          {/* User Message */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              User Message *
            </label>
            <textarea
              value={step.userMessage}
              onChange={(e) => handleFieldChange('userMessage', e.target.value)}
              placeholder="What the user says..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Pattern Editors */}
          <div className="grid grid-cols-2 gap-4">
            <PatternEditor
              label="Expected Patterns"
              patterns={step.expectedPatterns}
              onChange={(patterns) => handleFieldChange('expectedPatterns', patterns)}
              color="green"
            />
            <PatternEditor
              label="Unexpected Patterns"
              patterns={step.unexpectedPatterns}
              onChange={(patterns) => handleFieldChange('unexpectedPatterns', patterns)}
              color="red"
            />
          </div>

          {/* Semantic Expectations */}
          <SemanticExpectationBuilder
            expectations={step.semanticExpectations}
            negativeExpectations={step.negativeExpectations}
            onChange={(semantic, negative) => {
              handleFieldChange('semanticExpectations', semantic);
              handleFieldChange('negativeExpectations', negative);
            }}
            presets={presets}
          />

          {/* Timeout & Delay */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Timeout (ms)
              </label>
              <input
                type="number"
                value={step.timeout || ''}
                onChange={(e) => handleFieldChange('timeout', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="30000"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Delay (ms)
              </label>
              <input
                type="number"
                value={step.delay || ''}
                onChange={(e) => handleFieldChange('delay', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StepEditor({ steps, onChange, presets }: StepEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = steps.findIndex((s) => s.id === active.id);
      const newIndex = steps.findIndex((s) => s.id === over.id);
      onChange(arrayMove(steps, oldIndex, newIndex));
    }
  };

  const handleAddStep = () => {
    const newStep: TestCaseStepDTO = {
      id: `step-${Date.now()}`,
      description: '',
      userMessage: '',
      expectedPatterns: [],
      unexpectedPatterns: [],
      semanticExpectations: [],
      negativeExpectations: [],
    };
    onChange([...steps, newStep]);
  };

  const handleUpdateStep = (index: number, updates: Partial<TestCaseStepDTO>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    onChange(newSteps);
  };

  const handleDeleteStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={steps.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {steps.map((step, index) => (
            <SortableStep
              key={step.id}
              step={step}
              index={index}
              onUpdate={handleUpdateStep}
              onDelete={handleDeleteStep}
              presets={presets}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add Step Button */}
      <button
        onClick={handleAddStep}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Step
      </button>
    </div>
  );
}

export default StepEditor;
