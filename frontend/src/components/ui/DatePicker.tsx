/**
 * DatePicker Component
 * Date input with formatting
 */

import React, { forwardRef } from 'react';
import { format, parse } from 'date-fns';
import { Input } from './Input';
import type { InputProps } from './Input';

export interface DatePickerProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
  value?: string; // ISO date string (YYYY-MM-DD)
  onChange?: (value: string) => void;
  minDate?: string; // ISO date string
  maxDate?: string; // ISO date string
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onChange, minDate, maxDate, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onChange) {
        onChange(e.target.value);
      }
    };

    return (
      <Input
        ref={ref}
        type="date"
        value={value || ''}
        onChange={handleChange}
        min={minDate}
        max={maxDate}
        {...props}
      />
    );
  }
);

DatePicker.displayName = 'DatePicker';

/**
 * Format a date value for display
 */
export function formatDateValue(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const date = parse(value, 'yyyy-MM-dd', new Date());
    return format(date, 'MMM d, yyyy');
  } catch {
    return value;
  }
}
