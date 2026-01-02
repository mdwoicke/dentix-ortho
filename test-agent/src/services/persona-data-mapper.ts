/**
 * Persona Data Mapper Service
 *
 * Maps DataFieldCategory to actual persona data.
 * Handles multi-child scenarios and provides type-safe access.
 */

import type { DataFieldCategory } from '../schemas/response-category-schemas';
import type { UserPersona, DataInventory, ChildData } from '../tests/types/persona';

// =============================================================================
// Response Context
// =============================================================================

export interface DataMapperContext {
  /** Current child index for multi-child scenarios */
  currentChildIndex: number;
  /** Fields already provided in this conversation */
  providedFields: Set<DataFieldCategory>;
}

// =============================================================================
// Data Mapper Functions
// =============================================================================

type DataMapperFn = (
  inventory: DataInventory,
  context: DataMapperContext
) => string | null;

/**
 * Mapping from DataFieldCategory to persona data extraction
 */
const DATA_MAPPERS: Record<DataFieldCategory, DataMapperFn> = {
  // Identity fields
  caller_name: (inv) =>
    `${inv.parentFirstName} ${inv.parentLastName}`,

  caller_name_spelling: (inv) => {
    const fullName = `${inv.parentFirstName} ${inv.parentLastName}`;
    // Spell out name: "J-O-H-N S-M-I-T-H"
    return fullName.split('').join('-').toUpperCase();
  },

  caller_phone: (inv) =>
    inv.parentPhone,

  caller_email: (inv) => {
    // Return actual email if available, otherwise generate a fallback
    // This prevents infinite loops when agent asks for email and persona has none
    if (inv.parentEmail) return inv.parentEmail;
    // Generate fallback email from first name
    const firstName = inv.parentFirstName?.toLowerCase() || 'user';
    return `${firstName.replace(/[^a-z]/g, '')}@email.com`;
  },

  // Child fields
  child_count: (inv) => {
    const count = inv.children.length;
    if (count === 0) return 'No children';
    if (count === 1) return 'One child';
    if (count === 2) return 'Two children';
    if (count === 3) return 'Three children';
    return `${count} children`;
  },

  child_name: (inv, ctx) => {
    const child = getChild(inv, ctx.currentChildIndex);
    if (!child) return null;
    return `${child.firstName} ${child.lastName}`;
  },

  child_dob: (inv, ctx) => {
    const child = getChild(inv, ctx.currentChildIndex);
    if (!child) return null;
    const dob = new Date(child.dateOfBirth);
    return dob.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  },

  child_age: (inv, ctx) => {
    const child = getChild(inv, ctx.currentChildIndex);
    if (!child) return null;
    const dob = new Date(child.dateOfBirth);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return `${age} years old`;
  },

  // History fields
  new_patient_status: (inv, ctx) => {
    const child = getChild(inv, ctx.currentChildIndex);
    if (!child) return 'Yes, a new patient';
    return child.isNewPatient ? 'Yes, a new patient' : 'No, an existing patient';
  },

  previous_visit: (inv) =>
    inv.previousVisitToOffice ? 'Yes, we have been there before' : 'No, this is our first visit',

  previous_ortho_treatment: (inv, ctx) => {
    const child = getChild(inv, ctx.currentChildIndex);
    if (!child) return 'No previous treatment';
    return child.hadBracesBefore
      ? 'Yes, had braces before'
      : 'No previous orthodontic treatment';
  },

  // Insurance & needs
  insurance_info: (inv) => {
    if (!inv.hasInsurance) return 'No insurance';
    if (!inv.insuranceProvider) return "I'm not sure of the insurance";
    return inv.insuranceProvider;
  },

  special_needs: (inv, ctx) => {
    const child = getChild(inv, ctx.currentChildIndex);
    if (!child?.specialNeeds) return 'No special needs';
    return child.specialNeeds;
  },

  // Preference fields
  time_preference: (inv) => {
    if (inv.preferredTimeOfDay === 'morning') return 'Morning works best';
    if (inv.preferredTimeOfDay === 'afternoon') return 'Afternoon works best';
    if (inv.preferredTimeOfDay === 'any') return 'Any time works';

    if (inv.preferredDateRange) {
      const start = new Date(inv.preferredDateRange.start);
      const end = new Date(inv.preferredDateRange.end);
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      return `Between ${start.toLocaleDateString('en-US', options)} and ${end.toLocaleDateString('en-US', options)}`;
    }

    return 'Any time works for me';
  },

  location_preference: (inv) =>
    inv.preferredLocation || 'Either location works',

  day_preference: (inv) => {
    if (!inv.preferredDays || inv.preferredDays.length === 0) {
      return 'Any day works';
    }
    if (inv.preferredDays.length === 1) {
      return inv.preferredDays[0];
    }
    const last = inv.preferredDays[inv.preferredDays.length - 1];
    const rest = inv.preferredDays.slice(0, -1);
    return `${rest.join(', ')} or ${last}`;
  },

  // Meta fields
  other: () => null,
  unknown: () => null,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get child at index, with bounds checking
 */
function getChild(inv: DataInventory, index: number): ChildData | null {
  if (inv.children.length === 0) return null;
  if (index < 0 || index >= inv.children.length) {
    return inv.children[0]; // Default to first child
  }
  return inv.children[index];
}

// =============================================================================
// PersonaDataMapper Class
// =============================================================================

export class PersonaDataMapper {
  private persona: UserPersona;
  private context: DataMapperContext;

  constructor(persona: UserPersona, initialContext?: Partial<DataMapperContext>) {
    this.persona = persona;
    this.context = {
      currentChildIndex: 0,
      providedFields: new Set(),
      ...initialContext,
    };
  }

  /**
   * Get data for a specific field category
   */
  getData(field: DataFieldCategory): string | null {
    const mapper = DATA_MAPPERS[field];
    if (!mapper) {
      console.warn(`[PersonaDataMapper] No mapper for field: ${field}`);
      return null;
    }
    return mapper(this.persona.inventory, this.context);
  }

  /**
   * Get data for multiple fields
   */
  getMultipleData(fields: DataFieldCategory[]): string[] {
    const results: string[] = [];
    for (const field of fields) {
      const data = this.getData(field);
      if (data) {
        results.push(data);
      }
    }
    return results;
  }

  /**
   * Mark a field as provided
   */
  markProvided(field: DataFieldCategory): void {
    this.context.providedFields.add(field);
  }

  /**
   * Check if a field has been provided
   */
  wasProvided(field: DataFieldCategory): boolean {
    return this.context.providedFields.has(field);
  }

  /**
   * Get all provided fields
   */
  getProvidedFields(): DataFieldCategory[] {
    return Array.from(this.context.providedFields);
  }

  /**
   * Advance to next child
   */
  advanceChildIndex(): void {
    if (this.context.currentChildIndex < this.persona.inventory.children.length - 1) {
      this.context.currentChildIndex++;
    }
  }

  /**
   * Check if we're on last child
   */
  isLastChild(): boolean {
    return this.context.currentChildIndex >= this.persona.inventory.children.length - 1;
  }

  /**
   * Get current child index
   */
  getCurrentChildIndex(): number {
    return this.context.currentChildIndex;
  }

  /**
   * Set current child index
   */
  setCurrentChildIndex(index: number): void {
    if (index >= 0 && index < this.persona.inventory.children.length) {
      this.context.currentChildIndex = index;
    }
  }

  /**
   * Detect if agent is asking about next child and advance accordingly
   */
  detectAndAdvanceChild(agentMessage: string): boolean {
    const nextChildPatterns = [
      /\b(next|other|second|third|another)\s+(child|kid|patient|sibling)\b/i,
      /\b(second|third)\s+(child|kid)\b/i,
      /\bnow for\s+(the\s+)?(other|next|second)\b/i,
    ];

    for (const pattern of nextChildPatterns) {
      if (pattern.test(agentMessage)) {
        if (!this.isLastChild()) {
          this.advanceChildIndex();
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get current context
   */
  getContext(): DataMapperContext {
    return { ...this.context };
  }

  /**
   * Update context
   */
  updateContext(updates: Partial<DataMapperContext>): void {
    if (updates.currentChildIndex !== undefined) {
      this.context.currentChildIndex = updates.currentChildIndex;
    }
    if (updates.providedFields) {
      for (const field of updates.providedFields) {
        this.context.providedFields.add(field);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDataMapper(
  persona: UserPersona,
  initialContext?: Partial<DataMapperContext>
): PersonaDataMapper {
  return new PersonaDataMapper(persona, initialContext);
}
