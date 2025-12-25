/**
 * PatternEditor Component
 * Editor for regex pattern lists with validation
 */

import React, { useState } from 'react';

interface PatternEditorProps {
  label: string;
  patterns: string[];
  onChange: (patterns: string[]) => void;
  color: 'green' | 'red';
}

export function PatternEditor({
  label,
  patterns,
  onChange,
  color,
}: PatternEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const colorClasses = {
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      text: 'text-green-700 dark:text-green-400',
      border: 'border-green-200 dark:border-green-800',
      badge: 'bg-green-100 dark:bg-green-900/30',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800',
      badge: 'bg-red-100 dark:bg-red-900/30',
    },
  };

  const classes = colorClasses[color];

  const validateRegex = (pattern: string): boolean => {
    try {
      new RegExp(pattern, 'i');
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleAdd = () => {
    const pattern = inputValue.trim();
    if (!pattern) return;

    if (!validateRegex(pattern)) {
      setError('Invalid regex pattern');
      return;
    }

    if (patterns.includes(pattern)) {
      setError('Pattern already exists');
      return;
    }

    onChange([...patterns, pattern]);
    setInputValue('');
    setError(null);
  };

  const handleRemove = (index: number) => {
    onChange(patterns.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </label>

      {/* Pattern List */}
      {patterns.length > 0 && (
        <div className="space-y-1 mb-2">
          {patterns.map((pattern, index) => (
            <div
              key={index}
              className={`flex items-center justify-between px-2 py-1 ${classes.bg} ${classes.border} border rounded text-xs font-mono`}
            >
              <code className={`truncate ${classes.text}`}>{pattern}</code>
              <button
                onClick={() => handleRemove(index)}
                className="ml-2 text-gray-400 hover:text-red-500"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Pattern Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add regex pattern..."
          className={`flex-1 px-2 py-1 border rounded text-xs font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500 ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        <button
          onClick={handleAdd}
          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded"
        >
          Add
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

export default PatternEditor;
