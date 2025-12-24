/**
 * FormField Component
 * Reusable form field wrapper with react-hook-form integration
 */

import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Input, Select, DatePicker } from '../ui';
import type { InputProps, SelectProps, DatePickerProps } from '../ui';

export interface FormFieldProps {
  name: string;
  label?: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'date' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: SelectProps['options'];
  helperText?: string;
  disabled?: boolean;
}

export function FormField({
  name,
  label,
  type = 'text',
  required = false,
  placeholder,
  options,
  helperText,
  disabled = false,
}: FormFieldProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();

  const error = errors[name]?.message as string | undefined;

  if (type === 'select' && options) {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            {...field}
            label={label}
            error={error}
            helperText={helperText}
            required={required}
            placeholder={placeholder}
            options={options}
            disabled={disabled}
          />
        )}
      />
    );
  }

  if (type === 'date') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <DatePicker
            {...field}
            label={label}
            error={error}
            helperText={helperText}
            required={required}
            placeholder={placeholder}
            disabled={disabled}
          />
        )}
      />
    );
  }

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Input
          {...field}
          type={type}
          label={label}
          error={error}
          helperText={helperText}
          required={required}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    />
  );
}
