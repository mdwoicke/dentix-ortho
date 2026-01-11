/**
 * Skill File Selector Component
 * Dropdown for selecting Claude skill .MD files
 */

import { useState, useEffect } from 'react';
import { fetchSkillFiles, type SkillFileInfo } from '../../../services/api/skillsRunner';

interface SkillFileSelectorProps {
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
}

export function SkillFileSelector({ value, onChange, disabled = false }: SkillFileSelectorProps) {
  const [skillFiles, setSkillFiles] = useState<SkillFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSkillFiles = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const files = await fetchSkillFiles();
        setSkillFiles(files);
      } catch (err) {
        console.error('Failed to load skill files:', err);
        setError(err instanceof Error ? err.message : 'Failed to load skill files');
      } finally {
        setIsLoading(false);
      }
    };

    loadSkillFiles();
  }, []);

  const baseInputClass = `
    w-full px-3 py-2 rounded-md border
    bg-white dark:bg-gray-700
    border-gray-300 dark:border-gray-600
    text-gray-900 dark:text-white
    placeholder-gray-500 dark:placeholder-gray-400
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  if (isLoading) {
    return (
      <div className={baseInputClass + ' text-gray-500 dark:text-gray-400'}>
        Loading skill files...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="text-red-500 dark:text-red-400 text-sm">
          {error}
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=".claude/skills/example.md"
          disabled={disabled}
          className={baseInputClass}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={baseInputClass}
      >
        <option value="">-- Select a skill file --</option>
        {skillFiles.map(file => (
          <option key={file.path} value={file.path}>
            {file.name} {file.description ? `- ${file.description}` : ''}
          </option>
        ))}
      </select>

      {skillFiles.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No skill files found in .claude/skills/ directory
        </p>
      )}

      {/* Show the selected file path */}
      {value && (
        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
          {value}
        </p>
      )}
    </div>
  );
}

export default SkillFileSelector;
