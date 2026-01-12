/**
 * SearchableSelect Component
 * Dropdown with search/filter capability - supports typing and pasting
 */

import { useState, useRef, useEffect, forwardRef, useCallback } from 'react';
import { cn } from '../../utils/cn';
import type { SelectOption } from '../../types';

export interface SearchableSelectProps<T = string>
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption<T>[];
  value?: T;
  onChange?: (value: T) => void;
  placeholder?: string;
}

export const SearchableSelect = forwardRef<HTMLInputElement, SearchableSelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      value,
      onChange,
      placeholder,
      className,
      id,
      disabled,
      required,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selectId = id || `searchable-select-${Math.random().toString(36).substr(2, 9)}`;

    // Get display value for current selection
    const selectedOption = options.find((opt) => String(opt.value) === String(value));
    const displayValue = selectedOption?.label || '';

    // Filter options based on search term - search both label and value
    const filteredOptions = options.filter((option) => {
      const searchLower = searchTerm.toLowerCase();
      const labelMatch = option.label.toLowerCase().includes(searchLower);
      const valueMatch = String(option.value).toLowerCase().includes(searchLower);
      return labelMatch || valueMatch;
    });

    // Handle clicking outside to close dropdown
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
          setSearchTerm('');
          setHighlightedIndex(-1);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Scroll highlighted option into view
    useEffect(() => {
      if (highlightedIndex >= 0 && listRef.current) {
        const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
        if (highlightedElement) {
          highlightedElement.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [highlightedIndex]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
      setIsOpen(true);
      setHighlightedIndex(0);
    };

    const handleInputFocus = () => {
      setIsOpen(true);
      setSearchTerm('');
      setHighlightedIndex(-1);
    };

    const handleOptionSelect = useCallback((option: SelectOption) => {
      if (option.disabled) return;

      if (onChange) {
        onChange(option.value);
      }
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }, [onChange]);

    // Handle paste events - check if pasted text matches an option value (e.g., GUID)
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData('text').trim();

      // Check if pasted text exactly matches an option value
      const matchingOption = options.find(
        (opt) => String(opt.value).toLowerCase() === pastedText.toLowerCase()
      );

      if (matchingOption) {
        // Found a match by value - select it immediately
        e.preventDefault();
        handleOptionSelect(matchingOption);
      }
      // If no value match, let the normal onChange handle it as a search term
    }, [options, handleOptionSelect]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
            handleOptionSelect(filteredOptions[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSearchTerm('');
          setHighlightedIndex(-1);
          break;
        case 'Tab':
          setIsOpen(false);
          setSearchTerm('');
          setHighlightedIndex(-1);
          break;
      }
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onChange) {
        onChange('' as any);
      }
      setSearchTerm('');
      setIsOpen(false);
      inputRef.current?.focus();
    };

    return (
      <div className="w-full" ref={containerRef}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5 transition-colors"
          >
            {label}
            {required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <input
            ref={(node) => {
              // Handle both refs
              (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            id={selectId}
            type="text"
            value={isOpen ? searchTerm : displayValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            className={cn(
              'block w-full rounded-md border shadow-sm transition-colors',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-offset-0',
              'disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed',
              error
                ? 'border-red-300 dark:border-red-500 text-red-900 dark:text-red-200 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500 dark:focus:ring-red-400'
                : 'border-gray-300 dark:border-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400',
              'px-3 py-2.5 text-sm pr-10',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined
            }
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            role="combobox"
            aria-controls={`${selectId}-listbox`}
            {...props}
          />

          {/* Dropdown arrow / Clear button */}
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            {value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
                aria-label="Clear selection"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => !disabled && setIsOpen(!isOpen)}
              className={cn(
                'p-1 text-gray-400',
                !disabled && 'hover:text-gray-600 dark:hover:text-gray-300'
              )}
              tabIndex={-1}
              aria-label="Toggle dropdown"
            >
              <svg
                className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Dropdown list */}
          {isOpen && (
            <ul
              ref={listRef}
              id={`${selectId}-listbox`}
              role="listbox"
              className={cn(
                'absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md',
                'bg-white dark:bg-gray-700 shadow-lg border border-gray-200 dark:border-gray-600',
                'py-1 text-sm'
              )}
            >
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-2 text-gray-500 dark:text-gray-400 text-center">
                  {searchTerm ? 'No matches found' : 'No options available'}
                </li>
              ) : (
                filteredOptions.map((option, index) => (
                  <li
                    key={String(option.value) || index}
                    role="option"
                    aria-selected={String(option.value) === String(value)}
                    onClick={() => handleOptionSelect(option)}
                    className={cn(
                      'px-3 py-2 cursor-pointer',
                      option.disabled && 'opacity-50 cursor-not-allowed',
                      !option.disabled && 'hover:bg-gray-100 dark:hover:bg-gray-600',
                      index === highlightedIndex && 'bg-blue-50 dark:bg-blue-900/30',
                      String(option.value) === String(value) &&
                        'bg-blue-100 dark:bg-blue-800/50 text-blue-900 dark:text-blue-100 font-medium'
                    )}
                  >
                    {option.label}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400 transition-colors" id={`${selectId}-error`}>
            {error}
          </p>
        )}
        {!error && helperText && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300 transition-colors" id={`${selectId}-helper`}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';
