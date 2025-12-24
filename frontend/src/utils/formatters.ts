/**
 * Formatter Utilities
 * Functions for formatting dates, phone numbers, names, etc.
 */

import { format, parseISO, isValid, parse } from 'date-fns';

/**
 * Format a date string or Date object
 * @param date - Date string or Date object
 * @param formatStr - Format string (default: 'MM/dd/yyyy')
 * @returns Formatted date string or empty string if invalid
 *
 * @example
 * formatDate('2024-01-15') // => '01/15/2024'
 * formatDate(new Date(), 'MMM d, yyyy') // => 'Jan 15, 2024'
 * formatDate('9/10/2000 12:00:00 AM') // => '09/10/2000'
 */
export function formatDate(date: string | Date | null | undefined, formatStr: string = 'MM/dd/yyyy'): string {
  if (!date) return '';

  try {
    let dateObj: Date;

    if (typeof date === 'string') {
      // Try parsing as ISO format first
      dateObj = parseISO(date);

      // If invalid, try parsing Cloud 9 format: "M/d/yyyy h:mm:ss a"
      if (!isValid(dateObj)) {
        dateObj = parse(date, 'M/d/yyyy h:mm:ss a', new Date());
      }

      // If still invalid, try as native Date constructor (handles various formats)
      if (!isValid(dateObj)) {
        dateObj = new Date(date);
      }
    } else {
      dateObj = date;
    }

    if (!isValid(dateObj)) return '';
    return format(dateObj, formatStr);
  } catch {
    return '';
  }
}

/**
 * Format a time string or Date object to time
 * @param date - Date string or Date object
 * @param formatStr - Format string (default: 'h:mm a')
 * @returns Formatted time string or empty string if invalid
 *
 * @example
 * formatTime('2024-01-15T14:30:00') // => '2:30 PM'
 * formatTime(new Date(), 'HH:mm') // => '14:30'
 * formatTime('9/10/2000 12:00:00 AM') // => '12:00 AM'
 */
export function formatTime(date: string | Date | null | undefined, formatStr: string = 'h:mm a'): string {
  if (!date) return '';

  try {
    let dateObj: Date;

    if (typeof date === 'string') {
      // Try parsing as ISO format first
      dateObj = parseISO(date);

      // If invalid, try parsing Cloud 9 format: "M/d/yyyy h:mm:ss a"
      if (!isValid(dateObj)) {
        dateObj = parse(date, 'M/d/yyyy h:mm:ss a', new Date());
      }

      // If still invalid, try as native Date constructor (handles various formats)
      if (!isValid(dateObj)) {
        dateObj = new Date(date);
      }
    } else {
      dateObj = date;
    }

    if (!isValid(dateObj)) return '';
    return format(dateObj, formatStr);
  } catch {
    return '';
  }
}

/**
 * Format a phone number to (XXX) XXX-XXXX format
 * @param phone - Phone number string
 * @returns Formatted phone number
 *
 * @example
 * formatPhoneNumber('5551234567') // => '(555) 123-4567'
 * formatPhoneNumber('555-123-4567') // => '(555) 123-4567'
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';

  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Format based on length
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  // Return original if not standard format
  return phone;
}

/**
 * Format a name with proper capitalization
 * @param name - Name string
 * @returns Formatted name
 *
 * @example
 * formatName('john doe') // => 'John Doe'
 * formatName('MARY SMITH') // => 'Mary Smith'
 */
export function formatName(name: string | null | undefined): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a full name from first and last name
 * @param firstName - First name
 * @param lastName - Last name
 * @param format - Format type: 'full' (John Doe), 'last-first' (Doe, John)
 * @returns Formatted full name
 */
export function formatFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  format: 'full' | 'last-first' = 'full'
): string {
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';

  if (!first && !last) return '';
  if (!first) return last;
  if (!last) return first;

  return format === 'last-first' ? `${last}, ${first}` : `${first} ${last}`;
}

/**
 * Format appointment status for display
 * @param status - Appointment status
 * @returns Formatted status string
 */
export function formatAppointmentStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';

  // Convert to title case
  return status
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format duration in minutes to human-readable string
 * @param minutes - Duration in minutes
 * @returns Formatted duration string
 *
 * @example
 * formatDuration(45) // => '45 min'
 * formatDuration(90) // => '1h 30min'
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '';

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}min`;
}

/**
 * Format environment for display
 * @param env - Environment string
 * @returns Formatted environment
 */
export function formatEnvironment(env: 'sandbox' | 'production' | string): string {
  if (env === 'sandbox') return 'Sandbox';
  if (env === 'production') return 'Production';
  return env.charAt(0).toUpperCase() + env.slice(1).toLowerCase();
}

/**
 * Truncate text to a maximum length
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export function truncate(text: string | null | undefined, maxLength: number = 50): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
