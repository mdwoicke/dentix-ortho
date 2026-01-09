/**
 * EnvironmentSelector Component
 * Toggle between Production, Sandbox A, and Sandbox B environments
 */

import { cn } from '../../../utils/cn';
import type { PromptContext } from '../../../types/testMonitor.types';

export type { PromptContext };

interface EnvironmentSelectorProps {
  selectedEnvironment: PromptContext;
  onSelect: (environment: PromptContext) => void;
  disabled?: boolean;
  /** Optional: Show pending changes count per environment */
  pendingChanges?: Record<PromptContext, number>;
}

const ENVIRONMENT_CONFIG: Record<PromptContext, {
  label: string;
  shortLabel: string;
  selectedClass: string;
  icon: string;
}> = {
  production: {
    label: 'Production',
    shortLabel: 'Prod',
    selectedClass: 'bg-green-600 text-white shadow-sm',
    icon: 'P',
  },
  sandbox_a: {
    label: 'Sandbox A',
    shortLabel: 'A',
    selectedClass: 'bg-blue-600 text-white shadow-sm',
    icon: 'A',
  },
  sandbox_b: {
    label: 'Sandbox B',
    shortLabel: 'B',
    selectedClass: 'bg-purple-600 text-white shadow-sm',
    icon: 'B',
  },
};

export function EnvironmentSelector({
  selectedEnvironment,
  onSelect,
  disabled = false,
  pendingChanges,
}: EnvironmentSelectorProps) {
  const environments: PromptContext[] = ['production', 'sandbox_a', 'sandbox_b'];

  return (
    <div className="inline-flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {environments.map((env) => {
        const config = ENVIRONMENT_CONFIG[env];
        const isSelected = selectedEnvironment === env;
        const changes = pendingChanges?.[env] ?? 0;

        return (
          <button
            key={env}
            onClick={() => onSelect(env)}
            disabled={disabled}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap',
              isSelected
                ? config.selectedClass
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span className="inline-flex items-center gap-2">
              <span className="font-bold">{config.icon}</span>
              <span>{config.label}</span>
              {changes > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-xs rounded-full',
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  )}
                >
                  {changes}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact version for use in headers/toolbars
 */
export function EnvironmentBadge({
  environment,
  className,
}: {
  environment: PromptContext;
  className?: string;
}) {
  const config = ENVIRONMENT_CONFIG[environment];

  const badgeColors: Record<PromptContext, string> = {
    production: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    sandbox_a: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    sandbox_b: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md',
        badgeColors[environment],
        className
      )}
    >
      <span className="font-bold">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
