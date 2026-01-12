/**
 * Template Resolver
 *
 * Resolves template placeholders in strings using persona data.
 * Supports {{fieldName}} syntax for dynamic content.
 *
 * Example:
 *   "Hi, I'm {{parentFirstName}} {{parentLastName}}"
 *   -> "Hi, I'm Sarah Test"
 */

import type { UserPersona, DataInventory, ChildData } from '../tests/types/persona';

/**
 * Resolve template placeholders in a string using persona data.
 *
 * Supported placeholders:
 * - {{parentFirstName}} - Parent's first name
 * - {{parentLastName}} - Parent's last name
 * - {{parentPhone}} - Parent's phone number
 * - {{parentEmail}} - Parent's email
 * - {{children[0].firstName}} - First child's first name (index 0-based)
 * - {{children[0].lastName}} - First child's last name
 * - {{children[0].dateOfBirth}} - First child's date of birth
 * - {{childCount}} - Number of children
 * - {{insuranceProvider}} - Insurance provider name
 * - {{preferredLocation}} - Preferred location
 * - {{preferredTimeOfDay}} - Preferred time of day
 *
 * @param template - String containing {{placeholder}} syntax
 * @param persona - The user persona with inventory data
 * @returns Resolved string with placeholders replaced by actual values
 */
export function resolveTemplate(template: string, persona: UserPersona): string {
  if (!template || typeof template !== 'string') {
    return template;
  }

  // Check if template has any placeholders
  if (!template.includes('{{')) {
    return template;
  }

  const inv = persona.inventory;
  let result = template;

  // Resolve simple inventory fields
  const simpleFields: Record<string, string | undefined> = {
    parentFirstName: inv.parentFirstName,
    parentLastName: inv.parentLastName,
    parentPhone: inv.parentPhone,
    parentEmail: inv.parentEmail,
    insuranceProvider: inv.insuranceProvider,
    preferredLocation: inv.preferredLocation,
    preferredTimeOfDay: inv.preferredTimeOfDay,
    childCount: String(inv.children?.length || 0),
  };

  // Replace simple fields
  for (const [field, value] of Object.entries(simpleFields)) {
    const placeholder = `{{${field}}}`;
    if (result.includes(placeholder) && value !== undefined) {
      result = result.replace(new RegExp(escapeRegex(placeholder), 'g'), value);
    }
  }

  // Resolve child array fields: {{children[N].fieldName}}
  const childPattern = /\{\{children\[(\d+)\]\.(\w+)\}\}/g;
  result = result.replace(childPattern, (match, indexStr, fieldName) => {
    const index = parseInt(indexStr, 10);
    const child = inv.children?.[index];
    if (!child) {
      console.warn(`[TemplateResolver] Child at index ${index} not found`);
      return match; // Keep original if child doesn't exist
    }

    const value = getChildFieldValue(child, fieldName);
    if (value === undefined) {
      console.warn(`[TemplateResolver] Child field '${fieldName}' not found`);
      return match; // Keep original if field doesn't exist
    }

    return value;
  });

  // Resolve shorthand for first child: {{childFirstName}}, {{childLastName}}, etc.
  const firstChild = inv.children?.[0];
  if (firstChild) {
    const childShorthands: Record<string, string | undefined> = {
      childFirstName: firstChild.firstName,
      childLastName: firstChild.lastName,
      childDateOfBirth: formatDateOfBirth(firstChild.dateOfBirth),
      childAge: calculateAge(firstChild.dateOfBirth),
    };

    for (const [field, value] of Object.entries(childShorthands)) {
      const placeholder = `{{${field}}}`;
      if (result.includes(placeholder) && value !== undefined) {
        result = result.replace(new RegExp(escapeRegex(placeholder), 'g'), value);
      }
    }
  }

  // Resolve persona-level fields
  if (result.includes('{{personaName}}')) {
    result = result.replace(/\{\{personaName\}\}/g, persona.name || '');
  }

  // Warn about any remaining unresolved placeholders
  const unresolvedPattern = /\{\{[^}]+\}\}/g;
  const unresolved = result.match(unresolvedPattern);
  if (unresolved && unresolved.length > 0) {
    console.warn(`[TemplateResolver] Unresolved placeholders: ${unresolved.join(', ')}`);
  }

  return result;
}

/**
 * Get a field value from a child object
 */
function getChildFieldValue(child: ChildData, fieldName: string): string | undefined {
  switch (fieldName) {
    case 'firstName':
      return child.firstName;
    case 'lastName':
      return child.lastName;
    case 'dateOfBirth':
      return formatDateOfBirth(child.dateOfBirth);
    case 'isNewPatient':
      return child.isNewPatient ? 'yes' : 'no';
    case 'hadBracesBefore':
      return child.hadBracesBefore ? 'yes' : 'no';
    case 'specialNeeds':
      return child.specialNeeds || 'none';
    case 'age':
      return calculateAge(child.dateOfBirth);
    case 'fullName':
      return `${child.firstName} ${child.lastName}`;
    default:
      return undefined;
  }
}

/**
 * Format a date of birth string to a readable format
 */
function formatDateOfBirth(dob: string): string {
  if (!dob) return '';
  try {
    const date = new Date(dob);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dob;
  }
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dob: string): string {
  if (!dob) return '';
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return String(age);
  } catch {
    return '';
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a string contains template placeholders
 */
export function hasTemplatePlaceholders(str: string): boolean {
  return typeof str === 'string' && /\{\{[^}]+\}\}/.test(str);
}

/**
 * Get all placeholder names from a template string
 */
export function getPlaceholderNames(template: string): string[] {
  if (!template || typeof template !== 'string') {
    return [];
  }

  const pattern = /\{\{([^}]+)\}\}/g;
  const names: string[] = [];
  let match;

  while ((match = pattern.exec(template)) !== null) {
    names.push(match[1]);
  }

  return names;
}
