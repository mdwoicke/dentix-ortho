/**
 * Goal Test Service
 * Manages goal-oriented test case CRUD operations and TypeScript file generation
 */

import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ChildDataDTO {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  isNewPatient: boolean;
  hadBracesBefore?: boolean;
  specialNeeds?: string;
}

export interface DataInventoryDTO {
  parentFirstName: string;
  parentLastName: string;
  parentPhone: string;
  parentEmail?: string;
  children: ChildDataDTO[];
  hasInsurance?: boolean;
  insuranceProvider?: string;
  preferredLocation?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'any';
  preferredDateRange?: {
    start: string;
    end: string;
  };
  previousVisitToOffice?: boolean;
  previousOrthoTreatment?: boolean;
}

export interface PersonaTraitsDTO {
  verbosity: 'terse' | 'normal' | 'verbose';
  providesExtraInfo: boolean;
  patienceLevel?: 'patient' | 'moderate' | 'impatient';
  techSavviness?: 'low' | 'moderate' | 'high';
}

export interface UserPersonaDTO {
  name: string;
  description?: string;
  inventory: DataInventoryDTO;
  traits: PersonaTraitsDTO;
}

export type CollectableFieldDTO =
  | 'parent_name' | 'parent_name_spelling' | 'parent_phone' | 'parent_email'
  | 'child_count' | 'child_names' | 'child_dob' | 'child_age'
  | 'is_new_patient' | 'previous_visit' | 'previous_ortho'
  | 'insurance' | 'special_needs' | 'time_preference' | 'location_preference';

export type GoalTypeDTO =
  | 'data_collection'
  | 'booking_confirmed'
  | 'transfer_initiated'
  | 'conversation_ended'
  | 'error_handled'
  | 'custom';

export interface ConversationGoalDTO {
  id: string;
  type: GoalTypeDTO;
  description: string;
  requiredFields?: CollectableFieldDTO[];
  priority: number;
  required: boolean;
}

export type ConstraintTypeDTO =
  | 'must_happen'
  | 'must_not_happen'
  | 'max_turns'
  | 'max_time';

export interface TestConstraintDTO {
  type: ConstraintTypeDTO;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  maxTurns?: number;
  maxTimeMs?: number;
}

export interface ResponseConfigDTO {
  maxTurns: number;
  useLlmResponses: boolean;
  handleUnknownIntents: 'fail' | 'clarify' | 'generic';
}

export interface GoalTestCaseRecord {
  id?: number;
  caseId: string;
  name: string;
  description: string;
  category: 'happy-path' | 'edge-case' | 'error-handling';
  tags: string[];
  persona: UserPersonaDTO;
  goals: ConversationGoalDTO[];
  constraints: TestConstraintDTO[];
  responseConfig: ResponseConfigDTO;
  initialMessage: string;
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalTestCaseStats {
  total: number;
  byCategory: Record<string, number>;
  archived: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

// ============================================================================
// DEFAULTS & PRESETS
// ============================================================================

export const DEFAULT_TRAITS: PersonaTraitsDTO = {
  verbosity: 'normal',
  providesExtraInfo: false,
  patienceLevel: 'moderate',
  techSavviness: 'moderate',
};

export const DEFAULT_PERSONA: UserPersonaDTO = {
  name: 'New Parent',
  description: 'Default persona for testing',
  inventory: {
    parentFirstName: 'Jane',
    parentLastName: 'Doe',
    parentPhone: '2155550000',
    parentEmail: 'jane.doe@example.com',
    children: [{
      firstName: 'Child',
      lastName: 'Doe',
      dateOfBirth: '2015-01-15',
      isNewPatient: true,
    }],
    hasInsurance: true,
    insuranceProvider: 'Keystone First',
    preferredTimeOfDay: 'any',
  },
  traits: DEFAULT_TRAITS,
};

export const DEFAULT_RESPONSE_CONFIG: ResponseConfigDTO = {
  maxTurns: 25,
  useLlmResponses: false,
  handleUnknownIntents: 'clarify',
};

export const PERSONA_PRESETS = [
  {
    id: 'sarah-johnson',
    name: 'Sarah Johnson',
    description: 'Parent with one child, new patient, has insurance',
    inventory: {
      parentFirstName: 'Sarah',
      parentLastName: 'Johnson',
      parentPhone: '2155551234',
      parentEmail: 'sarah@email.com',
      children: [{ firstName: 'Emma', lastName: 'Johnson', dateOfBirth: '2014-03-15', isNewPatient: true }],
      hasInsurance: true,
      insuranceProvider: 'Keystone First',
    },
    traits: DEFAULT_TRAITS,
  },
  {
    id: 'michael-davis',
    name: 'Michael Davis',
    description: 'Parent with two children, new patients, no insurance',
    inventory: {
      parentFirstName: 'Michael',
      parentLastName: 'Davis',
      parentPhone: '2155555678',
      parentEmail: 'michael.davis@email.com',
      children: [
        { firstName: 'Ethan', lastName: 'Davis', dateOfBirth: '2012-07-22', isNewPatient: true },
        { firstName: 'Olivia', lastName: 'Davis', dateOfBirth: '2015-11-08', isNewPatient: true },
      ],
      hasInsurance: false,
    },
    traits: DEFAULT_TRAITS,
  },
  {
    id: 'existing-patient',
    name: 'Robert Chen',
    description: 'Returning patient with existing record',
    inventory: {
      parentFirstName: 'Robert',
      parentLastName: 'Chen',
      parentPhone: '2155559012',
      parentEmail: 'robert.chen@email.com',
      children: [{ firstName: 'Lucas', lastName: 'Chen', dateOfBirth: '2011-04-18', isNewPatient: false }],
      hasInsurance: true,
      insuranceProvider: 'Blue Cross',
      previousVisitToOffice: true,
    },
    traits: DEFAULT_TRAITS,
  },
];

export const COLLECTABLE_FIELDS = [
  { value: 'parent_name', label: 'Parent Name' },
  { value: 'parent_name_spelling', label: 'Name Spelling' },
  { value: 'parent_phone', label: 'Phone Number' },
  { value: 'parent_email', label: 'Email Address' },
  { value: 'child_count', label: 'Child Count' },
  { value: 'child_names', label: 'Child Names' },
  { value: 'child_dob', label: 'Child DOB' },
  { value: 'child_age', label: 'Child Age' },
  { value: 'is_new_patient', label: 'New Patient Status' },
  { value: 'previous_visit', label: 'Previous Visit' },
  { value: 'previous_ortho', label: 'Previous Ortho' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'special_needs', label: 'Special Needs' },
  { value: 'time_preference', label: 'Time Preference' },
  { value: 'location_preference', label: 'Location Preference' },
];

export const GOAL_TYPES = [
  { value: 'data_collection', label: 'Data Collection', description: 'Collect required information fields' },
  { value: 'booking_confirmed', label: 'Booking Confirmed', description: 'Complete appointment booking' },
  { value: 'transfer_initiated', label: 'Transfer Initiated', description: 'Transfer to live agent' },
  { value: 'conversation_ended', label: 'Conversation Ended', description: 'End conversation properly' },
  { value: 'error_handled', label: 'Error Handled', description: 'Handle errors gracefully' },
  { value: 'custom', label: 'Custom', description: 'Custom success criteria' },
];

export const CONSTRAINT_TYPES = [
  { value: 'must_happen', label: 'Must Happen', description: 'Something must occur during the conversation' },
  { value: 'must_not_happen', label: 'Must Not Happen', description: 'Something must NOT occur' },
  { value: 'max_turns', label: 'Max Turns', description: 'Limit the number of conversation turns' },
  { value: 'max_time', label: 'Max Time', description: 'Limit the total conversation time' },
];

// ============================================================================
// DATABASE HELPERS
// ============================================================================

let tableInitialized = false;

function ensureTable(db: BetterSqlite3.Database): void {
  if (tableInitialized) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT CHECK(category IN ('happy-path', 'edge-case', 'error-handling')) NOT NULL,
      tags_json TEXT DEFAULT '[]',
      persona_json TEXT NOT NULL,
      goals_json TEXT DEFAULT '[]',
      constraints_json TEXT DEFAULT '[]',
      response_config_json TEXT NOT NULL,
      initial_message TEXT NOT NULL,
      is_archived INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_goal_test_cases_category ON goal_test_cases(category);
    CREATE INDEX IF NOT EXISTS idx_goal_test_cases_archived ON goal_test_cases(is_archived);
    CREATE INDEX IF NOT EXISTS idx_goal_test_cases_case_id ON goal_test_cases(case_id);
  `);

  tableInitialized = true;
}

function getWritableDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });
  ensureTable(db);
  return db;
}

function getReadOnlyDb(): BetterSqlite3.Database {
  // For read-only, we need to ensure table exists first with a writable connection
  if (!tableInitialized) {
    const writeDb = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });
    ensureTable(writeDb);
    writeDb.close();
  }
  return new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Get all goal test cases (optionally filtered)
 */
export function getGoalTestCases(options?: { category?: string; includeArchived?: boolean }): GoalTestCaseRecord[] {
  const db = getReadOnlyDb();
  try {
    let query = `
      SELECT id, case_id, name, description, category, tags_json, persona_json,
             goals_json, constraints_json, response_config_json, initial_message,
             is_archived, version, created_at, updated_at
      FROM goal_test_cases
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (!options?.includeArchived) {
      conditions.push('is_archived = 0');
    }

    if (options?.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY category, case_id';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      description: row.description || '',
      category: row.category,
      tags: JSON.parse(row.tags_json || '[]'),
      persona: JSON.parse(row.persona_json),
      goals: JSON.parse(row.goals_json || '[]'),
      constraints: JSON.parse(row.constraints_json || '[]'),
      responseConfig: JSON.parse(row.response_config_json),
      initialMessage: row.initial_message,
      isArchived: row.is_archived === 1,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } finally {
    db.close();
  }
}

/**
 * Get a single goal test case by ID
 */
export function getGoalTestCase(caseId: string): GoalTestCaseRecord | null {
  const db = getReadOnlyDb();
  try {
    const row = db.prepare(`
      SELECT id, case_id, name, description, category, tags_json, persona_json,
             goals_json, constraints_json, response_config_json, initial_message,
             is_archived, version, created_at, updated_at
      FROM goal_test_cases
      WHERE case_id = ?
    `).get(caseId) as any;

    if (!row) return null;

    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      description: row.description || '',
      category: row.category,
      tags: JSON.parse(row.tags_json || '[]'),
      persona: JSON.parse(row.persona_json),
      goals: JSON.parse(row.goals_json || '[]'),
      constraints: JSON.parse(row.constraints_json || '[]'),
      responseConfig: JSON.parse(row.response_config_json),
      initialMessage: row.initial_message,
      isArchived: row.is_archived === 1,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    db.close();
  }
}

/**
 * Create a new goal test case
 */
export function createGoalTestCase(testCase: Omit<GoalTestCaseRecord, 'id' | 'version' | 'createdAt' | 'updatedAt'>): GoalTestCaseRecord {
  const db = getWritableDb();
  try {
    const now = new Date().toISOString();

    const info = db.prepare(`
      INSERT INTO goal_test_cases (case_id, name, description, category, tags_json, persona_json, goals_json, constraints_json, response_config_json, initial_message, is_archived, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      testCase.caseId,
      testCase.name,
      testCase.description,
      testCase.category,
      JSON.stringify(testCase.tags),
      JSON.stringify(testCase.persona),
      JSON.stringify(testCase.goals),
      JSON.stringify(testCase.constraints),
      JSON.stringify(testCase.responseConfig),
      testCase.initialMessage,
      testCase.isArchived ? 1 : 0,
      now,
      now
    );

    return {
      id: info.lastInsertRowid as number,
      ...testCase,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  } finally {
    db.close();
  }
}

/**
 * Update an existing goal test case
 */
export function updateGoalTestCase(caseId: string, updates: Partial<Omit<GoalTestCaseRecord, 'id' | 'caseId' | 'createdAt'>>): GoalTestCaseRecord | null {
  const db = getWritableDb();
  try {
    // First get the existing record
    const existingRow = db.prepare(`
      SELECT id, case_id, name, description, category, tags_json, persona_json,
             goals_json, constraints_json, response_config_json, initial_message,
             is_archived, version, created_at, updated_at
      FROM goal_test_cases
      WHERE case_id = ?
    `).get(caseId) as any;

    if (!existingRow) return null;

    const existing = {
      id: existingRow.id,
      caseId: existingRow.case_id,
      name: existingRow.name,
      description: existingRow.description || '',
      category: existingRow.category,
      tags: JSON.parse(existingRow.tags_json || '[]'),
      persona: JSON.parse(existingRow.persona_json),
      goals: JSON.parse(existingRow.goals_json || '[]'),
      constraints: JSON.parse(existingRow.constraints_json || '[]'),
      responseConfig: JSON.parse(existingRow.response_config_json),
      initialMessage: existingRow.initial_message,
      isArchived: existingRow.is_archived === 1,
      version: existingRow.version,
      createdAt: existingRow.created_at,
      updatedAt: existingRow.updated_at,
    };

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    // Build update fields
    const updated = {
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      category: updates.category ?? existing.category,
      tags: updates.tags ?? existing.tags,
      persona: updates.persona ?? existing.persona,
      goals: updates.goals ?? existing.goals,
      constraints: updates.constraints ?? existing.constraints,
      responseConfig: updates.responseConfig ?? existing.responseConfig,
      initialMessage: updates.initialMessage ?? existing.initialMessage,
      isArchived: updates.isArchived ?? existing.isArchived,
    };

    db.prepare(`
      UPDATE goal_test_cases
      SET name = ?, description = ?, category = ?, tags_json = ?, persona_json = ?,
          goals_json = ?, constraints_json = ?, response_config_json = ?, initial_message = ?,
          is_archived = ?, version = ?, updated_at = ?
      WHERE case_id = ?
    `).run(
      updated.name,
      updated.description,
      updated.category,
      JSON.stringify(updated.tags),
      JSON.stringify(updated.persona),
      JSON.stringify(updated.goals),
      JSON.stringify(updated.constraints),
      JSON.stringify(updated.responseConfig),
      updated.initialMessage,
      updated.isArchived ? 1 : 0,
      newVersion,
      now,
      caseId
    );

    return {
      id: existing.id,
      caseId,
      ...updated,
      version: newVersion,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  } finally {
    db.close();
  }
}

/**
 * Archive a goal test case (soft delete)
 */
export function archiveGoalTestCase(caseId: string): boolean {
  const db = getWritableDb();
  try {
    const result = db.prepare(`
      UPDATE goal_test_cases SET is_archived = 1, updated_at = ? WHERE case_id = ?
    `).run(new Date().toISOString(), caseId);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * Permanently delete a goal test case
 */
export function deleteGoalTestCase(caseId: string): boolean {
  const db = getWritableDb();
  try {
    const result = db.prepare(`DELETE FROM goal_test_cases WHERE case_id = ?`).run(caseId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * Clone a goal test case with a new ID
 */
export function cloneGoalTestCase(caseId: string, newCaseId: string): GoalTestCaseRecord | null {
  const existing = getGoalTestCase(caseId);
  if (!existing) return null;

  return createGoalTestCase({
    caseId: newCaseId,
    name: `${existing.name} (Copy)`,
    description: existing.description,
    category: existing.category,
    tags: [...existing.tags],
    persona: JSON.parse(JSON.stringify(existing.persona)),
    goals: JSON.parse(JSON.stringify(existing.goals)),
    constraints: JSON.parse(JSON.stringify(existing.constraints)),
    responseConfig: JSON.parse(JSON.stringify(existing.responseConfig)),
    initialMessage: existing.initialMessage,
    isArchived: false,
  });
}

/**
 * Get goal test case statistics
 */
export function getGoalTestCaseStats(): GoalTestCaseStats {
  const db = getReadOnlyDb();
  try {
    const total = (db.prepare('SELECT COUNT(*) as count FROM goal_test_cases WHERE is_archived = 0').get() as any)?.count || 0;
    const archived = (db.prepare('SELECT COUNT(*) as count FROM goal_test_cases WHERE is_archived = 1').get() as any)?.count || 0;

    const byCategoryRows = db.prepare(`
      SELECT category, COUNT(*) as count FROM goal_test_cases WHERE is_archived = 0 GROUP BY category
    `).all() as any[];

    const byCategory: Record<string, number> = {};
    for (const row of byCategoryRows) {
      byCategory[row.category] = row.count;
    }

    return { total, byCategory, archived };
  } finally {
    db.close();
  }
}

/**
 * Get all unique tags from goal test cases
 */
export function getAllTags(): string[] {
  const db = getReadOnlyDb();
  try {
    const rows = db.prepare(`SELECT tags_json FROM goal_test_cases WHERE is_archived = 0`).all() as any[];

    const tagSet = new Set<string>();
    for (const row of rows) {
      const tags = JSON.parse(row.tags_json || '[]');
      for (const tag of tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort();
  } finally {
    db.close();
  }
}

/**
 * Check if a goal test case ID exists
 */
export function goalTestCaseExists(caseId: string): boolean {
  const db = getReadOnlyDb();
  try {
    const row = db.prepare('SELECT 1 FROM goal_test_cases WHERE case_id = ?').get(caseId);
    return !!row;
  } finally {
    db.close();
  }
}

/**
 * Generate the next available case ID for a category
 */
export function generateNextCaseId(category: 'happy-path' | 'edge-case' | 'error-handling'): string {
  const prefix = category === 'happy-path' ? 'GOAL-HAPPY' :
                 category === 'edge-case' ? 'GOAL-EDGE' : 'GOAL-ERR';

  const db = getReadOnlyDb();
  try {
    const rows = db.prepare(`
      SELECT case_id FROM goal_test_cases WHERE case_id LIKE ?
    `).all(`${prefix}-%`) as any[];

    let maxNum = 0;
    for (const row of rows) {
      const match = row.case_id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
  } finally {
    db.close();
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a goal test case before saving
 */
export function validateGoalTestCase(testCase: Partial<GoalTestCaseRecord>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!testCase.caseId || testCase.caseId.trim() === '') {
    errors.push({ field: 'caseId', message: 'Case ID is required' });
  } else if (!/^GOAL-[A-Z]+-\d{3}$/.test(testCase.caseId)) {
    errors.push({ field: 'caseId', message: 'Case ID must match pattern: GOAL-PREFIX-NNN (e.g., GOAL-HAPPY-001)' });
  }

  if (!testCase.name || testCase.name.trim() === '') {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  if (!testCase.category) {
    errors.push({ field: 'category', message: 'Category is required' });
  } else if (!['happy-path', 'edge-case', 'error-handling'].includes(testCase.category)) {
    errors.push({ field: 'category', message: 'Invalid category' });
  }

  // Persona validation
  if (!testCase.persona) {
    errors.push({ field: 'persona', message: 'Persona is required' });
  } else {
    if (!testCase.persona.name || testCase.persona.name.trim() === '') {
      errors.push({ field: 'persona.name', message: 'Persona name is required' });
    }
    if (!testCase.persona.inventory) {
      errors.push({ field: 'persona.inventory', message: 'Persona inventory is required' });
    } else {
      if (!testCase.persona.inventory.parentFirstName) {
        errors.push({ field: 'persona.inventory.parentFirstName', message: 'Parent first name is required' });
      }
      if (!testCase.persona.inventory.parentPhone) {
        errors.push({ field: 'persona.inventory.parentPhone', message: 'Parent phone is required' });
      }
      if (!testCase.persona.inventory.children || testCase.persona.inventory.children.length === 0) {
        errors.push({ field: 'persona.inventory.children', message: 'At least one child is required' });
      }
    }
  }

  // Goals validation
  if (!testCase.goals || testCase.goals.length === 0) {
    errors.push({ field: 'goals', message: 'At least one goal is required' });
  } else {
    testCase.goals.forEach((goal, index) => {
      if (!goal.id || goal.id.trim() === '') {
        errors.push({ field: `goals[${index}].id`, message: `Goal ${index + 1}: ID is required` });
      }
      if (!goal.type) {
        errors.push({ field: `goals[${index}].type`, message: `Goal ${index + 1}: Type is required` });
      }
      if (goal.type === 'data_collection' && (!goal.requiredFields || goal.requiredFields.length === 0)) {
        errors.push({ field: `goals[${index}].requiredFields`, message: `Goal ${index + 1}: Data collection goal requires at least one field` });
      }
    });
  }

  // Initial message validation
  if (!testCase.initialMessage || testCase.initialMessage.trim() === '') {
    errors.push({ field: 'initialMessage', message: 'Initial message is required' });
  }

  return errors;
}

// ============================================================================
// TYPESCRIPT FILE GENERATION
// ============================================================================

const SCENARIOS_DIR = path.resolve(__dirname, '../../../test-agent/src/tests/scenarios');

/**
 * Generate TypeScript code for a single goal test case
 */
function generateGoalTestCaseCode(testCase: GoalTestCaseRecord): string {
  const goalsCode = testCase.goals.map(goal => {
    const fieldsCode = goal.requiredFields && goal.requiredFields.length > 0
      ? `requiredFields: [${goal.requiredFields.map(f => `'${f}'`).join(', ')}],`
      : '';
    return `    {
      id: ${JSON.stringify(goal.id)},
      type: ${JSON.stringify(goal.type)},
      description: ${JSON.stringify(goal.description)},
      ${fieldsCode}
      priority: ${goal.priority},
      required: ${goal.required},
    }`;
  }).join(',\n');

  const constraintsCode = testCase.constraints.map(constraint => {
    let extraFields = '';
    if (constraint.type === 'max_turns' && constraint.maxTurns) {
      extraFields = `maxTurns: ${constraint.maxTurns},`;
    }
    if (constraint.type === 'max_time' && constraint.maxTimeMs) {
      extraFields = `maxTimeMs: ${constraint.maxTimeMs},`;
    }
    return `    {
      type: ${JSON.stringify(constraint.type)},
      description: ${JSON.stringify(constraint.description)},
      severity: ${JSON.stringify(constraint.severity)},
      ${extraFields}
    }`;
  }).join(',\n');

  const personaCode = JSON.stringify(testCase.persona, null, 2).replace(/\n/g, '\n  ');

  return `  {
    id: ${JSON.stringify(testCase.caseId)},
    name: ${JSON.stringify(testCase.name)},
    description: ${JSON.stringify(testCase.description)},
    category: ${JSON.stringify(testCase.category)},
    tags: ${JSON.stringify(testCase.tags)},
    persona: ${personaCode},
    goals: [
${goalsCode}
    ],
    constraints: [
${constraintsCode}
    ],
    responseConfig: ${JSON.stringify(testCase.responseConfig)},
    initialMessage: ${JSON.stringify(testCase.initialMessage)},
  }`;
}

/**
 * Generate a TypeScript file for a category of goal test cases
 */
function generateGoalCategoryFile(category: string, testCases: GoalTestCaseRecord[]): string {
  const categoryName = 'goal' + category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const testCasesCode = testCases.map(tc => generateGoalTestCaseCode(tc)).join(',\n\n');

  return `/**
 * Goal-Oriented ${category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Test Scenarios
 *
 * Auto-generated from Test Monitor UI
 * DO NOT EDIT DIRECTLY - Use the Goal Tests tab in Test Monitor
 *
 * Generated at: ${new Date().toISOString()}
 */

import type { GoalOrientedTestCase } from '../types/goal-test';

export const ${categoryName}Scenarios: GoalOrientedTestCase[] = [
${testCasesCode}
];
`;
}

/**
 * Sync all goal test cases from database to TypeScript files
 */
export function syncToTypeScript(): { success: boolean; filesWritten: string[]; errors: string[] } {
  const filesWritten: string[] = [];
  const errors: string[] = [];

  try {
    // Ensure scenarios directory exists
    if (!fs.existsSync(SCENARIOS_DIR)) {
      fs.mkdirSync(SCENARIOS_DIR, { recursive: true });
    }

    // Get all non-archived goal test cases grouped by category
    const allTestCases = getGoalTestCases({ includeArchived: false });

    const byCategory: Record<string, GoalTestCaseRecord[]> = {
      'happy-path': [],
      'edge-case': [],
      'error-handling': [],
    };

    for (const tc of allTestCases) {
      if (byCategory[tc.category]) {
        byCategory[tc.category].push(tc);
      }
    }

    // Generate files for each category
    for (const [category, testCases] of Object.entries(byCategory)) {
      if (testCases.length === 0) continue;

      const fileName = `generated-goal-${category}.ts`;
      const filePath = path.join(SCENARIOS_DIR, fileName);
      const content = generateGoalCategoryFile(category, testCases);

      fs.writeFileSync(filePath, content, 'utf-8');
      filesWritten.push(fileName);
    }

    // Generate index file that exports all generated goal scenarios
    if (filesWritten.length > 0) {
      const indexContent = `/**
 * Generated Goal Test Scenarios Index
 *
 * Auto-generated from Test Monitor UI
 * DO NOT EDIT DIRECTLY
 *
 * Generated at: ${new Date().toISOString()}
 */

${filesWritten.map(f => {
  const category = f.replace('generated-goal-', '').replace('.ts', '');
  const varName = 'goal' + category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') + 'Scenarios';
  return `import { ${varName} } from './${f.replace('.ts', '')}';`;
}).join('\n')}

export const generatedGoalScenarios = [
  ${filesWritten.map(f => {
    const category = f.replace('generated-goal-', '').replace('.ts', '');
    return `...goal${category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Scenarios`;
  }).join(',\n  ')}
];
`;

      fs.writeFileSync(path.join(SCENARIOS_DIR, 'generated-goal-index.ts'), indexContent, 'utf-8');
      filesWritten.push('generated-goal-index.ts');
    }

    return { success: true, filesWritten, errors };
  } catch (error: any) {
    errors.push(error.message);
    return { success: false, filesWritten, errors };
  }
}
