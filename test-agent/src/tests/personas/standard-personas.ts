/**
 * Standard Test Personas
 *
 * Pre-built personas for common test scenarios.
 * These match the data used in existing sequential tests.
 */

import type { UserPersona, DataInventory, PersonaTraits } from '../types/persona';

// ============================================================================
// PERSONA TRAITS PRESETS
// ============================================================================

const TERSE_TRAITS: PersonaTraits = {
  verbosity: 'terse',
  providesExtraInfo: false,
  patienceLevel: 'patient',
  techSavviness: 'moderate',
};

const NORMAL_TRAITS: PersonaTraits = {
  verbosity: 'normal',
  providesExtraInfo: false,
  patienceLevel: 'patient',
  techSavviness: 'moderate',
};

const VERBOSE_TRAITS: PersonaTraits = {
  verbosity: 'verbose',
  providesExtraInfo: true,
  patienceLevel: 'patient',
  techSavviness: 'moderate',
};

// ============================================================================
// STANDARD PERSONAS
// ============================================================================

/**
 * Sarah Johnson - Standard single child case
 * Matches HAPPY-001 test data
 */
export const SARAH_JOHNSON: UserPersona = {
  name: 'Sarah Johnson',
  description: 'Parent with one child, new patient, Keystone First insurance',
  inventory: {
    parentFirstName: 'Sarah',
    parentLastName: 'Johnson',
    parentPhone: '2155551234',
    parentEmail: 'sarah@email.com',
    children: [
      {
        firstName: 'Emma',
        lastName: 'Johnson',
        dateOfBirth: '2014-03-15',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Keystone First',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Alleghany',
    preferredTimeOfDay: 'any',
    preferredDateRange: {
      start: '2026-01-01',
      end: '2026-01-15',
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * Michael Davis - Two children case
 * Matches HAPPY-002 test data
 */
export const MICHAEL_DAVIS: UserPersona = {
  name: 'Michael Davis',
  description: 'Parent with two children, new patients, Aetna Better Health insurance',
  inventory: {
    parentFirstName: 'Michael',
    parentLastName: 'Davis',
    parentPhone: '2155559876',
    parentEmail: 'mike@email.com',
    children: [
      {
        firstName: 'Jake',
        lastName: 'Davis',
        dateOfBirth: '2012-01-10',
        isNewPatient: true,
        hadBracesBefore: false,
      },
      {
        firstName: 'Lily',
        lastName: 'Davis',
        dateOfBirth: '2015-05-20',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Aetna Better Health',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Alleghany',
    preferredTimeOfDay: 'any',
    preferredDateRange: {
      start: '2026-01-01',
      end: '2026-01-15',
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * Jane Smith - Quick info provider
 * Matches HAPPY-003 test data
 */
export const JANE_SMITH: UserPersona = {
  name: 'Jane Smith',
  description: 'Efficient parent who provides info upfront',
  inventory: {
    parentFirstName: 'Jane',
    parentLastName: 'Smith',
    parentPhone: '2155551111',
    parentEmail: 'jane@email.com',
    children: [
      {
        firstName: 'Emma',
        lastName: 'Smith',
        dateOfBirth: '2014-02-05',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Keystone First',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Alleghany',
    preferredTimeOfDay: 'any',
    preferredDateRange: {
      start: '2026-01-01',
      end: '2026-01-15',
    },
  },
  traits: VERBOSE_TRAITS,
};

/**
 * Robert Chen - Returning patient
 */
export const ROBERT_CHEN: UserPersona = {
  name: 'Robert Chen',
  description: 'Returning patient with previous visit history',
  inventory: {
    parentFirstName: 'Robert',
    parentLastName: 'Chen',
    parentPhone: '2155552222',
    parentEmail: 'robert.chen@email.com',
    children: [
      {
        firstName: 'Lucas',
        lastName: 'Chen',
        dateOfBirth: '2013-08-22',
        isNewPatient: false,
        hadBracesBefore: true,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Blue Cross Blue Shield',
    previousVisitToOffice: true,
    previousOrthoTreatment: true,
    preferredLocation: 'Philadelphia',
    preferredTimeOfDay: 'morning',
    preferredDateRange: {
      start: '2026-01-01',
      end: '2026-01-31',
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * Maria Garcia - No insurance case
 */
export const MARIA_GARCIA: UserPersona = {
  name: 'Maria Garcia',
  description: 'Parent without insurance coverage',
  inventory: {
    parentFirstName: 'Maria',
    parentLastName: 'Garcia',
    parentPhone: '2155553333',
    parentEmail: 'maria.garcia@email.com',
    children: [
      {
        firstName: 'Sofia',
        lastName: 'Garcia',
        dateOfBirth: '2015-11-30',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: false,
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Alleghany',
    preferredTimeOfDay: 'afternoon',
    preferredDateRange: {
      start: '2026-01-01',
      end: '2026-02-28',
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * David Wilson - Special needs case
 */
export const DAVID_WILSON: UserPersona = {
  name: 'David Wilson',
  description: 'Parent with child who has special needs',
  inventory: {
    parentFirstName: 'David',
    parentLastName: 'Wilson',
    parentPhone: '2155554444',
    parentEmail: 'david.wilson@email.com',
    children: [
      {
        firstName: 'Ethan',
        lastName: 'Wilson',
        dateOfBirth: '2014-06-15',
        isNewPatient: true,
        hadBracesBefore: false,
        specialNeeds: 'Autism - needs quiet environment and extra patience',
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'United Healthcare',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Alleghany',
    preferredTimeOfDay: 'morning',
    preferredDateRange: {
      start: '2026-01-01',
      end: '2026-01-31',
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * Terse Tom - Minimal responses
 */
export const TERSE_TOM: UserPersona = {
  name: 'Tom Brown',
  description: 'Parent who gives very brief answers',
  inventory: {
    parentFirstName: 'Tom',
    parentLastName: 'Brown',
    parentPhone: '2155555555',
    parentEmail: 'tom@email.com',
    children: [
      {
        firstName: 'Max',
        lastName: 'Brown',
        dateOfBirth: '2013-04-10',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Cigna',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Philadelphia',
    preferredTimeOfDay: 'any',
    preferredDateRange: {
      start: '2026-01-01',
      end: '2026-01-31',
    },
  },
  traits: TERSE_TRAITS,
};

// ============================================================================
// PERSONA CATALOG
// ============================================================================

/**
 * All standard personas
 */
export const STANDARD_PERSONAS: Record<string, UserPersona> = {
  'sarah-johnson': SARAH_JOHNSON,
  'michael-davis': MICHAEL_DAVIS,
  'jane-smith': JANE_SMITH,
  'robert-chen': ROBERT_CHEN,
  'maria-garcia': MARIA_GARCIA,
  'david-wilson': DAVID_WILSON,
  'terse-tom': TERSE_TOM,
};

/**
 * Get persona by key
 */
export function getPersona(key: string): UserPersona | null {
  return STANDARD_PERSONAS[key] || null;
}

/**
 * List all persona keys
 */
export function listPersonaKeys(): string[] {
  return Object.keys(STANDARD_PERSONAS);
}
