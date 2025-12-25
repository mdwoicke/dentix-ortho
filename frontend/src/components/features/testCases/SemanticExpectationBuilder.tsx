/**
 * SemanticExpectationBuilder Component
 * Builder for semantic and negative expectations with preset dropdown
 */

import React, { useState } from 'react';
import type {
  SemanticExpectationDTO,
  NegativeExpectationDTO,
  TestCasePresets,
} from '../../../types/testMonitor.types';

interface SemanticExpectationBuilderProps {
  expectations: SemanticExpectationDTO[];
  negativeExpectations: NegativeExpectationDTO[];
  onChange: (semantic: SemanticExpectationDTO[], negative: NegativeExpectationDTO[]) => void;
  presets: TestCasePresets | null;
}

type ExpectationType = 'semantic' | 'negative';

export function SemanticExpectationBuilder({
  expectations,
  negativeExpectations,
  onChange,
  presets,
}: SemanticExpectationBuilderProps) {
  const [activeTab, setActiveTab] = useState<ExpectationType>('semantic');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customDescription, setCustomDescription] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [severity, setSeverity] = useState<'critical' | 'high' | 'medium' | 'low'>('high');

  const handleAddSemantic = () => {
    if (!selectedPreset && !customDescription.trim()) return;

    const preset = presets?.semanticExpectations.find(p => p.type === selectedPreset);
    const newExpectation: SemanticExpectationDTO = {
      type: selectedPreset || 'custom',
      description: customDescription.trim() || preset?.description || '',
      customCriteria: selectedPreset === 'custom' ? customDescription.trim() : undefined,
      required: isRequired,
    };

    onChange([...expectations, newExpectation], negativeExpectations);
    resetForm();
  };

  const handleAddNegative = () => {
    if (!selectedPreset && !customDescription.trim()) return;

    const preset = presets?.negativeExpectations.find(p => p.type === selectedPreset);
    const newExpectation: NegativeExpectationDTO = {
      type: selectedPreset || 'custom',
      description: customDescription.trim() || preset?.description || '',
      customCriteria: selectedPreset === 'custom' ? customDescription.trim() : undefined,
      severity,
    };

    onChange(expectations, [...negativeExpectations, newExpectation]);
    resetForm();
  };

  const handleRemoveSemantic = (index: number) => {
    onChange(expectations.filter((_, i) => i !== index), negativeExpectations);
  };

  const handleRemoveNegative = (index: number) => {
    onChange(expectations, negativeExpectations.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setShowAddForm(false);
    setSelectedPreset('');
    setCustomDescription('');
    setIsRequired(true);
    setSeverity('high');
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300';
      case 'high': return 'bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-300';
      case 'medium': return 'bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300';
      default: return 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('semantic')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'semantic'
              ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-b-2 border-purple-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Semantic ({expectations.length})
        </button>
        <button
          onClick={() => setActiveTab('negative')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'negative'
              ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-b-2 border-orange-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Negative ({negativeExpectations.length})
        </button>
      </div>

      <div className="p-3">
        {/* Semantic Expectations */}
        {activeTab === 'semantic' && (
          <div className="space-y-2">
            {expectations.map((exp, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded"
              >
                <span className="px-1.5 py-0.5 text-xs bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded shrink-0">
                  {exp.type}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                  {exp.description}
                </span>
                {exp.required && (
                  <span className="text-xs text-purple-600 dark:text-purple-400 shrink-0">Required</span>
                )}
                <button
                  onClick={() => handleRemoveSemantic(index)}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Negative Expectations */}
        {activeTab === 'negative' && (
          <div className="space-y-2">
            {negativeExpectations.map((exp, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded"
              >
                <span className={`px-1.5 py-0.5 text-xs rounded shrink-0 ${getSeverityColor(exp.severity)}`}>
                  {exp.type}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                  {exp.description}
                </span>
                <span className="text-xs text-gray-500 shrink-0">{exp.severity}</span>
                <button
                  onClick={() => handleRemoveNegative(index)}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Form */}
        {showAddForm ? (
          <div className="mt-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
            {/* Preset Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Select Preset
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => {
                  setSelectedPreset(e.target.value);
                  if (e.target.value !== 'custom') {
                    const preset = activeTab === 'semantic'
                      ? presets?.semanticExpectations.find(p => p.type === e.target.value)
                      : presets?.negativeExpectations.find(p => p.type === e.target.value);
                    if (preset) {
                      setCustomDescription(preset.description);
                      if ('severity' in preset) {
                        setSeverity(preset.severity as any);
                      }
                    }
                  } else {
                    setCustomDescription('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Choose a preset...</option>
                {activeTab === 'semantic' && presets?.semanticExpectations.map((preset) => (
                  <option key={preset.type} value={preset.type}>{preset.label}</option>
                ))}
                {activeTab === 'negative' && presets?.negativeExpectations.map((preset) => (
                  <option key={preset.type} value={preset.type}>{preset.label}</option>
                ))}
                <option value="custom">Custom...</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Description
              </label>
              <textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Describe what to expect..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Options */}
            <div className="flex gap-4">
              {activeTab === 'semantic' ? (
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded"
                  />
                  Required
                </label>
              ) : (
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Severity
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={activeTab === 'semantic' ? handleAddSemantic : handleAddNegative}
                className="px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add {activeTab === 'semantic' ? 'Semantic' : 'Negative'} Expectation
          </button>
        )}
      </div>
    </div>
  );
}

export default SemanticExpectationBuilder;
