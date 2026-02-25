/**
 * Chord Dental IVA Test Personas
 *
 * Personas based on real Langfuse call traces from the Chord dental IVA ("Allie").
 * Key differences from Ortho personas:
 * - callerDID in custom field (IVA reads from ANI/caller ID)
 * - Chord locations: Bethlehem (4096) / Aston (4097)
 * - Parent DOB is collected early in the flow
 * - declineEmail flag for common "no email" pattern
 */

import type { UserPersona, PersonaTraits } from '../types/persona';

// ============================================================================
// CHORD-SPECIFIC TRAITS
// ============================================================================

const NORMAL_TRAITS: PersonaTraits = {
  verbosity: 'normal',
  providesExtraInfo: false,
  patienceLevel: 'patient',
  techSavviness: 'moderate',
};

const TERSE_TRAITS: PersonaTraits = {
  verbosity: 'terse',
  providesExtraInfo: false,
  patienceLevel: 'patient',
  techSavviness: 'moderate',
};

// ============================================================================
// CHORD PERSONAS
// ============================================================================

/**
 * Jennifer Martinez - Standard single child case at Bethlehem
 * Based on Langfuse trace: new patient, in-network insurance, full happy path
 */
export const CHORD_JENNIFER_SINGLE: UserPersona = {
  name: 'Jennifer Martinez',
  description: 'Parent with one child, new patient, Delta Dental (in-network), Bethlehem location',
  inventory: {
    parentFirstName: 'Jennifer',
    parentLastName: 'Martinez',
    parentPhone: '2154401234',
    parentEmail: 'jennifer.martinez@email.com',
    parentDateOfBirth: '1987-04-15',
    children: [
      {
        firstName: 'Sofia',
        lastName: 'Martinez',
        dateOfBirth: '2019-08-22',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Delta Dental',
    insuranceMemberId: 'DD789456123',
    insuranceGroupNumber: 'GRP44567',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Bethlehem',
    preferredTimeOfDay: 'morning',
    custom: {
      callerDID: '+12154401234',
      chordLocationId: '4096',
      declineEmail: false,
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * Amanda Thompson - Aston location, out-of-network insurance
 * Tests the OON insurance flow with $99 special offer
 */
export const CHORD_PARENT_ASTON_OON: UserPersona = {
  name: 'Amanda Thompson',
  description: 'Parent with one child, new patient, Cigna (out-of-network), Aston location',
  inventory: {
    parentFirstName: 'Amanda',
    parentLastName: 'Thompson',
    parentPhone: '2154405678',
    parentEmail: 'amanda.t@email.com',
    parentDateOfBirth: '1990-11-03',
    children: [
      {
        firstName: 'Liam',
        lastName: 'Thompson',
        dateOfBirth: '2020-03-10',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Cigna',
    insuranceMemberId: 'CIG555888222',
    insuranceGroupNumber: 'CIG3456',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Aston',
    preferredTimeOfDay: 'afternoon',
    custom: {
      callerDID: '+12154405678',
      chordLocationId: '4097',
      declineEmail: false,
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * Rachel Kim - Two siblings at Bethlehem
 * Tests multi-child flow with grouped_slots
 */
export const CHORD_PARENT_TWO_KIDS: UserPersona = {
  name: 'Rachel Kim',
  description: 'Parent with two children, new patients, Aetna (in-network), Bethlehem location',
  inventory: {
    parentFirstName: 'Rachel',
    parentLastName: 'Kim',
    parentPhone: '2154409012',
    parentEmail: 'rachel.kim@email.com',
    parentDateOfBirth: '1985-06-28',
    children: [
      {
        firstName: 'Ethan',
        lastName: 'Kim',
        dateOfBirth: '2018-01-15',
        isNewPatient: true,
        hadBracesBefore: false,
      },
      {
        firstName: 'Mia',
        lastName: 'Kim',
        dateOfBirth: '2020-09-05',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Aetna',
    insuranceMemberId: 'AET333666999',
    insuranceGroupNumber: 'AET7890',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Bethlehem',
    preferredTimeOfDay: 'morning',
    custom: {
      callerDID: '+12154409012',
      chordLocationId: '4096',
      declineEmail: false,
    },
  },
  traits: NORMAL_TRAITS,
};

/**
 * Karen Davis - Terse caller at Aston
 * Minimal responses, declines email, tests terse interaction handling
 */
export const CHORD_TERSE_CALLER: UserPersona = {
  name: 'Karen Davis',
  description: 'Terse parent, one child, Delta Dental, Aston location, declines email',
  inventory: {
    parentFirstName: 'Karen',
    parentLastName: 'Davis',
    parentPhone: '2154403456',
    parentDateOfBirth: '1992-02-14',
    children: [
      {
        firstName: 'Noah',
        lastName: 'Davis',
        dateOfBirth: '2019-12-01',
        isNewPatient: true,
        hadBracesBefore: false,
      },
    ],
    hasInsurance: true,
    insuranceProvider: 'Delta Dental',
    insuranceMemberId: 'DD111444777',
    insuranceGroupNumber: 'GRP55678',
    previousVisitToOffice: false,
    previousOrthoTreatment: false,
    preferredLocation: 'Aston',
    preferredTimeOfDay: 'any',
    custom: {
      callerDID: '+12154403456',
      chordLocationId: '4097',
      declineEmail: true,
    },
  },
  traits: TERSE_TRAITS,
};

// ============================================================================
// CHORD PERSONA CATALOG
// ============================================================================

export const CHORD_PERSONAS: Record<string, UserPersona> = {
  'chord-jennifer-single': CHORD_JENNIFER_SINGLE,
  'chord-parent-aston-oon': CHORD_PARENT_ASTON_OON,
  'chord-parent-two-kids': CHORD_PARENT_TWO_KIDS,
  'chord-terse-caller': CHORD_TERSE_CALLER,
};

export function getChordPersona(key: string): UserPersona | null {
  return CHORD_PERSONAS[key] || null;
}

export function listChordPersonaKeys(): string[] {
  return Object.keys(CHORD_PERSONAS);
}
