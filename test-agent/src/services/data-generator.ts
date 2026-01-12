/**
 * Data Generator Service
 *
 * Resolves dynamic field specifications to concrete values using Faker.js.
 * Supports seeded generation for reproducibility.
 */

import { faker } from '@faker-js/faker';
import type {
  DynamicFieldSpec,
  DynamicFieldType,
  FieldConstraints,
} from '../tests/types/dynamic-fields';
import { isDynamicField, DEFAULT_POOLS, DEFAULT_CONSTRAINTS } from '../tests/types/dynamic-fields';
import type {
  DataInventory,
  ChildData,
  DynamicDataInventory,
  DynamicChildData,
  UserPersona,
  DynamicUserPersona,
  ResolutionMetadata,
  ResolvedPersona,
} from '../tests/types/persona';

/**
 * Service for generating dynamic data using Faker.js
 */
export class DataGeneratorService {
  private seed: number;
  private resolvedFields: string[] = [];

  /**
   * Create a new data generator
   * @param seed - Optional seed for reproducibility. If not provided, generates random seed.
   */
  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 1_000_000_000);
    faker.seed(this.seed);
  }

  /**
   * Get the seed used for this generator (for reproducibility)
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Get list of fields that were dynamically resolved
   */
  getResolvedFields(): string[] {
    return [...this.resolvedFields];
  }

  /**
   * Reset the resolved fields tracking
   */
  resetTracking(): void {
    this.resolvedFields = [];
  }

  /**
   * Resolve a complete persona with dynamic fields to concrete values
   */
  resolvePersona(persona: DynamicUserPersona): ResolvedPersona {
    this.resetTracking();

    const resolvedInventory = this.resolveInventory(persona.inventory);

    const resolved: UserPersona = {
      name: persona.name,
      description: persona.description,
      inventory: resolvedInventory,
      traits: persona.traits,
    };

    const metadata: ResolutionMetadata = {
      seed: this.seed,
      resolvedAt: new Date().toISOString(),
      dynamicFields: this.getResolvedFields(),
    };

    return {
      template: persona,
      resolved,
      metadata,
    };
  }

  /**
   * Resolve a dynamic inventory to concrete values
   */
  resolveInventory(inventory: DynamicDataInventory): DataInventory {
    return {
      parentFirstName: this.resolveField(inventory.parentFirstName, 'firstName', 'parentFirstName'),
      parentLastName: this.resolveField(inventory.parentLastName, 'lastName', 'parentLastName'),
      parentPhone: this.resolveField(inventory.parentPhone, 'phone', 'parentPhone'),
      parentEmail: inventory.parentEmail !== undefined
        ? this.resolveField(inventory.parentEmail, 'email', 'parentEmail')
        : undefined,

      children: inventory.children.map((child, index) => this.resolveChild(child, index)),

      hasInsurance: inventory.hasInsurance !== undefined
        ? this.resolveField(inventory.hasInsurance, 'boolean', 'hasInsurance')
        : undefined,
      insuranceProvider: inventory.insuranceProvider !== undefined
        ? this.resolveField(inventory.insuranceProvider, 'insuranceProvider', 'insuranceProvider')
        : undefined,
      insuranceId: inventory.insuranceId !== undefined
        ? this.resolveField(inventory.insuranceId, 'insuranceId', 'insuranceId')
        : undefined,

      preferredLocation: inventory.preferredLocation !== undefined
        ? this.resolveField(inventory.preferredLocation, 'location', 'preferredLocation')
        : undefined,
      preferredDays: inventory.preferredDays as string[] | undefined,
      preferredTimeOfDay: inventory.preferredTimeOfDay !== undefined
        ? this.resolveField(inventory.preferredTimeOfDay, 'timeOfDay', 'preferredTimeOfDay')
        : undefined,
      preferredDateRange: inventory.preferredDateRange as { start: string; end: string } | undefined,

      previousVisitToOffice: inventory.previousVisitToOffice !== undefined
        ? this.resolveField(inventory.previousVisitToOffice, 'boolean', 'previousVisitToOffice')
        : undefined,
      previousOrthoTreatment: inventory.previousOrthoTreatment !== undefined
        ? this.resolveField(inventory.previousOrthoTreatment, 'boolean', 'previousOrthoTreatment')
        : undefined,

      custom: inventory.custom as Record<string, unknown> | undefined,
    };
  }

  /**
   * Resolve a single child's data
   */
  private resolveChild(child: DynamicChildData, index: number): ChildData {
    const prefix = `children[${index}]`;
    return {
      firstName: this.resolveField(child.firstName, 'firstName', `${prefix}.firstName`),
      lastName: this.resolveField(child.lastName, 'lastName', `${prefix}.lastName`),
      dateOfBirth: this.resolveField(child.dateOfBirth, 'dateOfBirth', `${prefix}.dateOfBirth`),
      isNewPatient: this.resolveField(child.isNewPatient, 'boolean', `${prefix}.isNewPatient`),
      hadBracesBefore: child.hadBracesBefore !== undefined
        ? this.resolveField(child.hadBracesBefore, 'boolean', `${prefix}.hadBracesBefore`)
        : undefined,
      specialNeeds: child.specialNeeds !== undefined
        ? this.resolveField(child.specialNeeds, 'specialNeeds', `${prefix}.specialNeeds`)
        : undefined,
    };
  }

  /**
   * Resolve a single field (dynamic or static)
   */
  private resolveField<T>(
    value: T | DynamicFieldSpec<T>,
    defaultType: DynamicFieldType,
    fieldPath: string
  ): T {
    if (!isDynamicField(value)) {
      return value as T;
    }

    // Track that this field was dynamically generated
    this.resolvedFields.push(fieldPath);

    return this.generateValue(value) as T;
  }

  /**
   * Generate a value based on field spec
   */
  private generateValue(spec: DynamicFieldSpec): unknown {
    const constraints = {
      ...DEFAULT_CONSTRAINTS[spec.fieldType],
      ...spec.constraints,
    };

    switch (spec.fieldType) {
      case 'firstName':
        return this.generateFirstName(constraints);

      case 'lastName':
        return this.generateLastName(constraints);

      case 'fullName':
        return this.generateFullName(constraints);

      case 'phone':
        return this.generatePhone(constraints);

      case 'email':
        return this.generateEmail(constraints);

      case 'date':
        return this.generateDate(constraints);

      case 'dateOfBirth':
        return this.generateDateOfBirth(constraints);

      case 'boolean':
        return this.generateBoolean(constraints);

      case 'insuranceProvider':
        return this.generateFromPool(
          constraints.options || DEFAULT_POOLS.insuranceProviders
        );

      case 'insuranceId':
        return this.generateInsuranceId(constraints);

      case 'location':
        return this.generateFromPool(
          constraints.options || DEFAULT_POOLS.locations
        );

      case 'timeOfDay':
        return this.generateFromPool(
          constraints.options || DEFAULT_POOLS.timeOfDay
        );

      case 'specialNeeds':
        return this.generateSpecialNeeds(constraints);

      case 'verbosity':
        return this.generateFromPool(
          constraints.options || DEFAULT_POOLS.verbosity
        );

      case 'patienceLevel':
        return this.generateFromPool(
          constraints.options || DEFAULT_POOLS.patienceLevel
        );

      default:
        return faker.lorem.word();
    }
  }

  /**
   * Generate first name
   */
  private generateFirstName(constraints: FieldConstraints): string {
    let name = faker.person.firstName();
    if (constraints.prefix) name = constraints.prefix + name;
    if (constraints.suffix) name = name + constraints.suffix;
    return name;
  }

  /**
   * Generate last name
   */
  private generateLastName(constraints: FieldConstraints): string {
    let name = faker.person.lastName();
    if (constraints.prefix) name = constraints.prefix + name;
    if (constraints.suffix) name = name + constraints.suffix;
    return name;
  }

  /**
   * Generate full name
   */
  private generateFullName(constraints: FieldConstraints): string {
    let name = faker.person.fullName();
    if (constraints.prefix) name = constraints.prefix + name;
    if (constraints.suffix) name = name + constraints.suffix;
    return name;
  }

  /**
   * Generate phone number (10-digit format for US)
   */
  private generatePhone(constraints: FieldConstraints): string {
    const format = constraints.phoneFormat || '##########';

    // Generate based on format
    if (format === '##########') {
      // Generate 10 random digits (avoiding 0 or 1 as first digit)
      const areaCode = faker.number.int({ min: 200, max: 999 });
      const exchange = faker.number.int({ min: 200, max: 999 });
      const subscriber = faker.number.int({ min: 1000, max: 9999 });
      return `${areaCode}${exchange}${subscriber}`;
    } else if (format === '###-###-####') {
      const areaCode = faker.number.int({ min: 200, max: 999 });
      const exchange = faker.number.int({ min: 200, max: 999 });
      const subscriber = faker.number.int({ min: 1000, max: 9999 });
      return `${areaCode}-${exchange}-${subscriber}`;
    } else {
      // Custom format - replace # with digits
      return format.replace(/#/g, () => faker.number.int({ min: 0, max: 9 }).toString());
    }
  }

  /**
   * Generate email address
   */
  private generateEmail(constraints: FieldConstraints): string {
    let email = faker.internet.email().toLowerCase();
    if (constraints.prefix) email = constraints.prefix + email;
    if (constraints.suffix) email = email + constraints.suffix;
    return email;
  }

  /**
   * Generate date within constraints
   */
  private generateDate(constraints: FieldConstraints): string {
    const from = constraints.minDate
      ? new Date(constraints.minDate)
      : new Date('2026-01-01');
    const to = constraints.maxDate
      ? new Date(constraints.maxDate)
      : new Date('2026-12-31');

    return faker.date.between({ from, to }).toISOString().split('T')[0];
  }

  /**
   * Generate date of birth for an orthodontic patient
   */
  private generateDateOfBirth(constraints: FieldConstraints): string {
    const minAge = constraints.minAge ?? 7;
    const maxAge = constraints.maxAge ?? 18;

    const today = new Date();

    // Calculate date range based on age
    const maxDate = new Date(today);
    maxDate.setFullYear(maxDate.getFullYear() - minAge);

    const minDate = new Date(today);
    minDate.setFullYear(minDate.getFullYear() - maxAge - 1);
    minDate.setDate(minDate.getDate() + 1); // Ensure max age is not exceeded

    return faker.date.between({ from: minDate, to: maxDate }).toISOString().split('T')[0];
  }

  /**
   * Generate boolean with probability
   */
  private generateBoolean(constraints: FieldConstraints): boolean {
    const probability = constraints.probability ?? 0.5;
    return faker.number.float({ min: 0, max: 1 }) < probability;
  }

  /**
   * Generate value from a pool of options
   */
  private generateFromPool(options: string[]): string {
    if (options.length === 0) {
      return '';
    }
    return faker.helpers.arrayElement(options);
  }

  /**
   * Generate insurance ID (alphanumeric format)
   */
  private generateInsuranceId(constraints: FieldConstraints): string {
    const prefix = constraints.prefix || '';
    const suffix = constraints.suffix || '';

    // Generate format like "XYZ123456789"
    const letters = faker.string.alpha({ length: 3, casing: 'upper' });
    const numbers = faker.string.numeric({ length: 9 });

    return prefix + letters + numbers + suffix;
  }

  /**
   * Generate special needs (with probability of having any)
   */
  private generateSpecialNeeds(constraints: FieldConstraints): string {
    const probability = constraints.probability ?? 0.1;
    const options = constraints.options || DEFAULT_POOLS.specialNeeds;

    // First, determine if the person has special needs
    const hasSpecialNeeds = faker.number.float({ min: 0, max: 1 }) < probability;

    if (!hasSpecialNeeds) {
      return 'None';
    }

    // Filter out "None" from options when selecting a special need
    const specialNeedsOptions = options.filter(opt => opt.toLowerCase() !== 'none');

    if (specialNeedsOptions.length === 0) {
      return 'None';
    }

    return faker.helpers.arrayElement(specialNeedsOptions);
  }
}

/**
 * Create a data generator with a random seed
 */
export function createDataGenerator(seed?: number): DataGeneratorService {
  return new DataGeneratorService(seed);
}

/**
 * Resolve a persona's dynamic fields to concrete values
 *
 * Convenience function that creates a generator, resolves, and returns results.
 */
export function resolvePersona(
  persona: DynamicUserPersona,
  seed?: number
): ResolvedPersona {
  const generator = new DataGeneratorService(seed);
  return generator.resolvePersona(persona);
}

/**
 * Check if a persona has any dynamic fields
 */
export function personaHasDynamicFields(persona: DynamicUserPersona): boolean {
  const inventory = persona.inventory;

  // Check parent fields
  if (isDynamicField(inventory.parentFirstName)) return true;
  if (isDynamicField(inventory.parentLastName)) return true;
  if (isDynamicField(inventory.parentPhone)) return true;
  if (inventory.parentEmail && isDynamicField(inventory.parentEmail)) return true;

  // Check children
  for (const child of inventory.children) {
    if (isDynamicField(child.firstName)) return true;
    if (isDynamicField(child.lastName)) return true;
    if (isDynamicField(child.dateOfBirth)) return true;
    if (isDynamicField(child.isNewPatient)) return true;
    if (child.hadBracesBefore !== undefined && isDynamicField(child.hadBracesBefore)) return true;
    if (child.specialNeeds !== undefined && isDynamicField(child.specialNeeds)) return true;
  }

  // Check insurance
  if (inventory.hasInsurance !== undefined && isDynamicField(inventory.hasInsurance)) return true;
  if (inventory.insuranceProvider !== undefined && isDynamicField(inventory.insuranceProvider)) return true;
  if (inventory.insuranceId !== undefined && isDynamicField(inventory.insuranceId)) return true;

  // Check preferences
  if (inventory.preferredLocation !== undefined && isDynamicField(inventory.preferredLocation)) return true;
  if (inventory.preferredTimeOfDay !== undefined && isDynamicField(inventory.preferredTimeOfDay)) return true;

  // Check history
  if (inventory.previousVisitToOffice !== undefined && isDynamicField(inventory.previousVisitToOffice)) return true;
  if (inventory.previousOrthoTreatment !== undefined && isDynamicField(inventory.previousOrthoTreatment)) return true;

  return false;
}
