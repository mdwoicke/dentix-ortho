/**
 * Stats Card Component
 * Individual statistic card for the Goal Test Dashboard
 */

import React from 'react';
import { clsx } from 'clsx';

interface StatsCardProps {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue';
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  onClick?: () => void;
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const colorStyles = {
  default: {
    bg: 'bg-gray-50 dark:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-900 dark:text-gray-100',
    label: 'text-gray-500 dark:text-gray-400',
    icon: 'text-gray-400 dark:text-gray-500',
    active: 'ring-2 ring-gray-400 dark:ring-gray-500',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-400',
    label: 'text-green-600 dark:text-green-500',
    icon: 'text-green-500 dark:text-green-400',
    active: 'ring-2 ring-green-400 dark:ring-green-500',
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-700 dark:text-yellow-400',
    label: 'text-yellow-600 dark:text-yellow-500',
    icon: 'text-yellow-500 dark:text-yellow-400',
    active: 'ring-2 ring-yellow-400 dark:ring-yellow-500',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    label: 'text-red-600 dark:text-red-500',
    icon: 'text-red-500 dark:text-red-400',
    active: 'ring-2 ring-red-400 dark:ring-red-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-400',
    label: 'text-blue-600 dark:text-blue-500',
    icon: 'text-blue-500 dark:text-blue-400',
    active: 'ring-2 ring-blue-400 dark:ring-blue-500',
  },
};

const sizeStyles = {
  sm: {
    padding: 'px-3 py-2',
    value: 'text-lg font-semibold',
    label: 'text-xs',
    icon: 'w-4 h-4',
  },
  md: {
    padding: 'px-4 py-3',
    value: 'text-2xl font-bold',
    label: 'text-sm',
    icon: 'w-5 h-5',
  },
  lg: {
    padding: 'px-5 py-4',
    value: 'text-3xl font-bold',
    label: 'text-base',
    icon: 'w-6 h-6',
  },
};

export function StatsCard({
  label,
  value,
  icon,
  color = 'default',
  trend,
  onClick,
  isActive = false,
  size = 'md',
}: StatsCardProps) {
  const styles = colorStyles[color];
  const sizes = sizeStyles[size];

  return (
    <div
      className={clsx(
        'rounded-lg border transition-all duration-200',
        styles.bg,
        styles.border,
        sizes.padding,
        onClick && 'cursor-pointer hover:shadow-md',
        isActive && styles.active
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className={clsx(sizes.label, styles.label, 'font-medium uppercase tracking-wide truncate')}>
            {label}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={clsx(sizes.value, styles.text)}>
              {value}
            </span>
            {trend && (
              <span
                className={clsx(
                  'text-xs font-medium',
                  trend.direction === 'up' && 'text-green-500',
                  trend.direction === 'down' && 'text-red-500',
                  trend.direction === 'neutral' && 'text-gray-400'
                )}
              >
                {trend.direction === 'up' && '+'}
                {trend.direction === 'down' && '-'}
                {trend.value}%
              </span>
            )}
          </div>
        </div>
        {icon && (
          <div className={clsx(sizes.icon, styles.icon, 'flex-shrink-0 ml-3')}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export default StatsCard;
