/**
 * Skill Selector Component
 * Dropdown for selecting skills and dynamic input fields
 */

import { useState, useEffect } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SkillFileSelector } from './SkillFileSelector';
import { PluginSelector } from './PluginSelector';

export interface SkillInput {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  required?: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface Skill {
  id: string;
  name: string;
  description?: string;
  command?: string;
  category: string;
  inputs: SkillInput[];
  skillType?: 'claude-skill-file' | 'pty-skill-file' | 'pty';  // Optional skill type for special handling
}

interface SkillSelectorProps {
  skills: Skill[];
  selectedSkill: Skill | null;
  onSkillSelect: (skill: Skill | null) => void;
  inputs: Record<string, string | number | boolean>;
  onInputChange: (name: string, value: string | number | boolean) => void;
  onRun: () => void;
  onStop: () => void;
  isRunning: boolean;
  isLoading?: boolean;
}

export function SkillSelector({
  skills,
  selectedSkill,
  onSkillSelect,
  inputs,
  onInputChange,
  onRun,
  onStop,
  isRunning,
  isLoading = false
}: SkillSelectorProps) {
  const [skillsByCategory, setSkillsByCategory] = useState<Record<string, Skill[]>>({});

  // Group skills by category
  useEffect(() => {
    const grouped = skills.reduce((acc, skill) => {
      const category = skill.category || 'uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(skill);
      return acc;
    }, {} as Record<string, Skill[]>);
    setSkillsByCategory(grouped);
  }, [skills]);

  // Set default values when skill changes
  useEffect(() => {
    if (selectedSkill) {
      selectedSkill.inputs.forEach(input => {
        if (input.default !== undefined && inputs[input.name] === undefined) {
          onInputChange(input.name, input.default);
        }
      });
    }
  }, [selectedSkill, inputs, onInputChange]);

  const handleSkillChange = (skillId: string) => {
    const skill = skills.find(s => s.id === skillId) || null;
    onSkillSelect(skill);
  };

  const renderInput = (input: SkillInput) => {
    const value = inputs[input.name] ?? input.default ?? '';

    const baseInputClass = `
      w-full px-3 py-2 rounded-md border
      bg-white dark:bg-gray-700
      border-gray-300 dark:border-gray-600
      text-gray-900 dark:text-white
      placeholder-gray-500 dark:placeholder-gray-400
      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
      disabled:opacity-50 disabled:cursor-not-allowed
    `;

    // Special handling for skill file path in skill file type skills (both API and PTY)
    if ((selectedSkill?.skillType === 'claude-skill-file' || selectedSkill?.skillType === 'pty-skill-file') && input.name === 'skillFilePath') {
      return (
        <SkillFileSelector
          value={String(value)}
          onChange={(path) => onInputChange(input.name, path)}
          disabled={isRunning}
        />
      );
    }

    // Special handling for plugin command in plugin skills (claude-plugin, claude-plugin-print)
    if ((selectedSkill?.id === 'claude-plugin' || selectedSkill?.id === 'claude-plugin-print') && input.name === 'plugin') {
      return (
        <PluginSelector
          value={String(value)}
          onChange={(command) => onInputChange(input.name, command)}
          disabled={isRunning}
        />
      );
    }

    switch (input.type) {
      case 'textarea':
        return (
          <textarea
            id={input.name}
            value={String(value)}
            onChange={(e) => onInputChange(input.name, e.target.value)}
            placeholder={input.placeholder}
            disabled={isRunning}
            rows={3}
            className={baseInputClass}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            id={input.name}
            value={value as number}
            onChange={(e) => onInputChange(input.name, e.target.valueAsNumber || 0)}
            placeholder={input.placeholder}
            min={input.min}
            max={input.max}
            disabled={isRunning}
            className={baseInputClass}
          />
        );

      case 'select':
        return (
          <select
            id={input.name}
            value={String(value)}
            onChange={(e) => onInputChange(input.name, e.target.value)}
            disabled={isRunning}
            className={baseInputClass}
          >
            <option value="">Select...</option>
            {input.options?.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <input
            type="checkbox"
            id={input.name}
            checked={Boolean(value)}
            onChange={(e) => onInputChange(input.name, e.target.checked)}
            disabled={isRunning}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
        );

      default:
        return (
          <input
            type="text"
            id={input.name}
            value={String(value)}
            onChange={(e) => onInputChange(input.name, e.target.value)}
            placeholder={input.placeholder}
            disabled={isRunning}
            className={baseInputClass}
          />
        );
    }
  };

  const categoryLabels: Record<string, string> = {
    'test-agent': 'Test Agent Commands',
    'utility': 'Utility',
    'custom': 'Custom',
    'ai': 'AI / Claude',
    'agents': 'Debug Agents',
    'uncategorized': 'Other'
  };

  return (
    <Card className="h-full flex flex-col">
      <Card.Header>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Skills
        </h3>
      </Card.Header>

      <Card.Body className="flex-1 overflow-y-auto space-y-4">
        {/* Skill Selector */}
        <div>
          <label
            htmlFor="skill-select"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Select Skill
          </label>
          <select
            id="skill-select"
            value={selectedSkill?.id || ''}
            onChange={(e) => handleSkillChange(e.target.value)}
            disabled={isRunning || isLoading}
            className={`
              w-full px-3 py-2 rounded-md border
              bg-white dark:bg-gray-700
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <option value="">-- Select a skill --</option>
            {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
              <optgroup key={category} label={categoryLabels[category] || category}>
                {categorySkills.map(skill => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Skill Description */}
        {selectedSkill?.description && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {selectedSkill.description}
            </p>
          </div>
        )}

        {/* Input Fields */}
        {selectedSkill && selectedSkill.inputs.length > 0 && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Parameters
              </h4>
              {(() => {
                const reqCount = selectedSkill.inputs.filter(i => i.required).length;
                const optCount = selectedSkill.inputs.length - reqCount;
                return (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {reqCount > 0 && <span>{reqCount} required</span>}
                    {reqCount > 0 && optCount > 0 && <span>, </span>}
                    {optCount > 0 && <span>{optCount} optional</span>}
                  </p>
                );
              })()}
            </div>
            {selectedSkill.inputs.map(input => (
              <div key={input.name}>
                <label
                  htmlFor={input.name}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  {input.label}
                  {input.required ? (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Required
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      Optional
                    </span>
                  )}
                </label>
                {renderInput(input)}
                {input.description && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {input.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card.Body>

      <Card.Footer className="flex gap-2">
        <Button
          onClick={onRun}
          disabled={!selectedSkill || isRunning || isLoading}
          variant="primary"
          className="flex-1"
        >
          {isLoading ? 'Loading...' : 'Run'}
        </Button>
        <Button
          onClick={onStop}
          disabled={!isRunning}
          variant="danger"
          className="flex-1"
        >
          Stop
        </Button>
      </Card.Footer>
    </Card>
  );
}

export default SkillSelector;
