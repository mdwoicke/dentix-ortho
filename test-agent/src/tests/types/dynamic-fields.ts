/**
 * Dynamic Field Types for Goal-Oriented Testing
 *
 * Allows persona fields to be either fixed values or dynamically generated
 * at test runtime using Faker.js.
 */

/**
 * Supported dynamic field types for generation
 */
export type DynamicFieldType =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'date'
  | 'dateOfBirth'
  | 'boolean'
  | 'insuranceProvider'
  | 'insuranceId'
  | 'location'
  | 'timeOfDay'
  | 'specialNeeds';

/**
 * Constraints for field generation
 */
export interface FieldConstraints {
  // Date constraints
  minDate?: string;  // ISO date string YYYY-MM-DD
  maxDate?: string;  // ISO date string YYYY-MM-DD
  minAge?: number;   // For dateOfBirth - generates DOB for person of this min age
  maxAge?: number;   // For dateOfBirth - generates DOB for person of this max age

  // Phone constraints
  phoneFormat?: string;  // e.g., '###-###-####' or '##########'

  // Selection pool constraints (for insuranceProvider, location, etc.)
  options?: string[];  // Pick randomly from these options

  // Boolean constraints
  probability?: number;  // 0-1, probability of generating true (default 0.5)

  // String constraints
  prefix?: string;  // Prefix to add to generated value
  suffix?: string;  // Suffix to add to generated value
}

/**
 * Specification for a dynamically generated field value
 */
export interface DynamicFieldSpec<T = unknown> {
  /** Marker to identify this as a dynamic field */
  _dynamic: true;

  /** Field type for generation */
  fieldType: DynamicFieldType;

  /** Optional constraints for generation */
  constraints?: FieldConstraints;

  /**
   * Optional seed for reproducibility.
   * If provided, this specific field will use this seed.
   * If null/undefined, uses the global generator seed.
   */
  seed?: number | null;
}

/**
 * Type helper: A field that can be either a fixed value or a dynamic spec
 */
export type MaybeDynamic<T> = T | DynamicFieldSpec<T>;

/**
 * Type guard to check if a value is a DynamicFieldSpec
 */
export function isDynamicField<T>(value: T | DynamicFieldSpec<T>): value is DynamicFieldSpec<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_dynamic' in value &&
    (value as DynamicFieldSpec<T>)._dynamic === true
  );
}

/**
 * Check if any field in an object contains dynamic specs
 */
export function hasDynamicFields(obj: Record<string, unknown>): boolean {
  for (const value of Object.values(obj)) {
    if (isDynamicField(value)) {
      return true;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null && hasDynamicFields(item as Record<string, unknown>)) {
          return true;
        }
      }
    }
    if (typeof value === 'object' && value !== null && !isDynamicField(value)) {
      if (hasDynamicFields(value as Record<string, unknown>)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Factory functions to create dynamic field specs easily
 */
export const dynamic = {
  /**
   * Generate a random first name
   */
  firstName: (constraints?: Partial<FieldConstraints>): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'firstName',
    constraints,
  }),

  /**
   * Generate a random last name
   */
  lastName: (constraints?: Partial<FieldConstraints>): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'lastName',
    constraints,
  }),

  /**
   * Generate a random full name
   */
  fullName: (constraints?: Partial<FieldConstraints>): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'fullName',
    constraints,
  }),

  /**
   * Generate a random phone number
   * @param format - Phone format pattern (default: 10-digit)
   */
  phone: (format?: string): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'phone',
    constraints: format ? { phoneFormat: format } : undefined,
  }),

  /**
   * Generate a random email address
   */
  email: (constraints?: Partial<FieldConstraints>): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'email',
    constraints,
  }),

  /**
   * Generate a random date within constraints
   * @param minDate - Minimum date (ISO string)
   * @param maxDate - Maximum date (ISO string)
   */
  date: (minDate?: string, maxDate?: string): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'date',
    constraints: { minDate, maxDate },
  }),

  /**
   * Generate a date of birth for an orthodontic patient
   * @param minAge - Minimum age (default: 7)
   * @param maxAge - Maximum age (default: 18)
   */
  dateOfBirth: (minAge?: number, maxAge?: number): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'dateOfBirth',
    constraints: { minAge, maxAge },
  }),

  /**
   * Generate a random boolean
   * @param probability - Probability of true (0-1, default: 0.5)
   */
  boolean: (probability?: number): DynamicFieldSpec<boolean> => ({
    _dynamic: true,
    fieldType: 'boolean',
    constraints: probability !== undefined ? { probability } : undefined,
  }),

  /**
   * Generate a random insurance provider from a pool
   * @param options - Custom pool of providers (uses default if not provided)
   */
  insuranceProvider: (options?: string[]): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'insuranceProvider',
    constraints: options ? { options } : undefined,
  }),

  /**
   * Generate a random insurance ID
   */
  insuranceId: (constraints?: Partial<FieldConstraints>): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'insuranceId',
    constraints,
  }),

  /**
   * Generate a random location from a pool
   * @param options - Custom pool of locations (uses default if not provided)
   */
  location: (options?: string[]): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'location',
    constraints: options ? { options } : undefined,
  }),

  /**
   * Generate a random time of day preference
   */
  timeOfDay: (): DynamicFieldSpec<'morning' | 'afternoon' | 'any'> => ({
    _dynamic: true,
    fieldType: 'timeOfDay',
    constraints: { options: ['morning', 'afternoon', 'any'] },
  }),

  /**
   * Generate random special needs (or none)
   * @param options - Pool of special needs options
   * @param probability - Probability of having special needs (default: 0.1)
   */
  specialNeeds: (options?: string[], probability?: number): DynamicFieldSpec<string> => ({
    _dynamic: true,
    fieldType: 'specialNeeds',
    constraints: {
      options: options || ['None', 'Autism', 'ADHD', 'Sensory sensitivity', 'Anxiety'],
      probability: probability ?? 0.1,
    },
  }),
};

/**
 * Default pools for dynamic generation
 */
export const DEFAULT_POOLS = {
  insuranceProviders: [
    'Keystone First',
    'Aetna Better Health',
    'Blue Cross Blue Shield',
    'United Healthcare',
    'Cigna',
    'AmeriHealth',
    'Highmark',
    'Independence Blue Cross',
    'Geisinger Health Plan',
  ],

  locations: [
    'Alleghany',
    'Philadelphia',
  ],

  specialNeeds: [
    'None',
    'Autism',
    'ADHD',
    'Sensory sensitivity',
    'Anxiety',
    'Down syndrome',
    'Cerebral palsy',
  ],
};

/**
 * Default constraints for field types
 */
export const DEFAULT_CONSTRAINTS: Record<DynamicFieldType, FieldConstraints> = {
  firstName: {},
  lastName: {},
  fullName: {},
  phone: { phoneFormat: '##########' },
  email: {},
  date: {},
  dateOfBirth: { minAge: 7, maxAge: 18 },
  boolean: { probability: 0.5 },
  insuranceProvider: { options: DEFAULT_POOLS.insuranceProviders },
  insuranceId: {},
  location: { options: DEFAULT_POOLS.locations },
  timeOfDay: { options: ['morning', 'afternoon', 'any'] },
  specialNeeds: { options: DEFAULT_POOLS.specialNeeds, probability: 0.1 },
};
