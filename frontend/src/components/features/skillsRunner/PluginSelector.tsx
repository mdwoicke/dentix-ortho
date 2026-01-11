/**
 * Plugin Selector Component
 * Dropdown for selecting Claude plugin commands
 */

import { useState, useEffect } from 'react';
import { fetchPluginCommandsByPlugin, type PluginCommand } from '../../../services/api/skillsRunner';

interface PluginSelectorProps {
  value: string;
  onChange: (command: string) => void;
  disabled?: boolean;
}

export function PluginSelector({ value, onChange, disabled = false }: PluginSelectorProps) {
  const [commandsByPlugin, setCommandsByPlugin] = useState<Record<string, PluginCommand[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPluginCommands = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const commands = await fetchPluginCommandsByPlugin();
        setCommandsByPlugin(commands);
      } catch (err) {
        console.error('Failed to load plugin commands:', err);
        setError(err instanceof Error ? err.message : 'Failed to load plugin commands');
      } finally {
        setIsLoading(false);
      }
    };

    loadPluginCommands();
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

  // Plugin name display labels
  const pluginLabels: Record<string, string> = {
    'built-in': 'Built-in Commands',
    'claude-reflect': 'Claude Reflect',
    'ralph-loop': 'Ralph Loop'
  };

  if (isLoading) {
    return (
      <div className={baseInputClass + ' text-gray-500 dark:text-gray-400'}>
        Loading plugin commands...
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
          placeholder="/commit"
          disabled={disabled}
          className={baseInputClass}
        />
      </div>
    );
  }

  const hasCommands = Object.values(commandsByPlugin).some(cmds => cmds.length > 0);

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={baseInputClass}
      >
        <option value="">-- Select a plugin command --</option>
        {Object.entries(commandsByPlugin).map(([pluginName, commands]) => (
          commands.length > 0 && (
            <optgroup key={pluginName} label={pluginLabels[pluginName] || pluginName}>
              {commands.map(cmd => (
                <option key={cmd.fullCommand} value={cmd.fullCommand}>
                  {cmd.fullCommand} {cmd.description ? `- ${cmd.description}` : ''}
                </option>
              ))}
            </optgroup>
          )
        ))}
      </select>

      {!hasCommands && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No plugin commands found. Install plugins via Claude CLI.
        </p>
      )}

      {/* Allow manual input for custom commands */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">or enter manually:</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/custom-command"
          disabled={disabled}
          className={`
            flex-1 px-2 py-1 text-sm rounded border
            bg-white dark:bg-gray-700
            border-gray-300 dark:border-gray-600
            text-gray-900 dark:text-white
            focus:outline-none focus:ring-1 focus:ring-primary-500
            disabled:opacity-50
          `}
        />
      </div>
    </div>
  );
}

export default PluginSelector;
