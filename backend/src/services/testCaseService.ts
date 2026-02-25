/**
 * Test Case Service
 * Manages test case CRUD operations and TypeScript file generation
 */

import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TestCaseStepDTO {
  id: string;
  description?: string;
  userMessage: string;
  expectedPatterns: string[];
  unexpectedPatterns: string[];
  semanticExpectations: SemanticExpectationDTO[];
  negativeExpectations: NegativeExpectationDTO[];
  timeout?: number;
  delay?: number;
  optional?: boolean;
}

export interface SemanticExpectationDTO {
  type: string;
  description: string;
  customCriteria?: string;
  required: boolean;
}

export interface NegativeExpectationDTO {
  type: string;
  description: string;
  customCriteria?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ExpectationDTO {
  type: 'conversation-complete' | 'final-state' | 'no-errors' | 'custom';
  description: string;
}

export interface TestCaseRecord {
  id?: number;
  caseId: string;
  name: string;
  description: string;
  category: 'happy-path' | 'edge-case' | 'error-handling';
  tags: string[];
  steps: TestCaseStepDTO[];
  expectations: ExpectationDTO[];
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseStats {
  total: number;
  byCategory: Record<string, number>;
  archived: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

let tableInitialized = false;

function ensureTable(db: BetterSqlite3.Database): void {
  if (tableInitialized) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT CHECK(category IN ('happy-path', 'edge-case', 'error-handling')) NOT NULL,
      tags_json TEXT DEFAULT '[]',
      steps_json TEXT DEFAULT '[]',
      expectations_json TEXT DEFAULT '[]',
      is_archived INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases(category);
    CREATE INDEX IF NOT EXISTS idx_test_cases_archived ON test_cases(is_archived);
    CREATE INDEX IF NOT EXISTS idx_test_cases_case_id ON test_cases(case_id);
  `);

  // Migration: add tenant_id if not present
  const cols = db.pragma('table_info(test_cases)') as { name: string }[];
  if (!cols.some(c => c.name === 'tenant_id')) {
    db.exec(`
      ALTER TABLE test_cases ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1;
      DROP INDEX IF EXISTS idx_test_cases_case_id;
      CREATE UNIQUE INDEX idx_test_cases_tenant_case ON test_cases(tenant_id, case_id);
      CREATE INDEX idx_test_cases_tenant ON test_cases(tenant_id);
    `);
  }

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
 * Get all test cases (optionally filtered)
 */
export function getTestCases(options?: { category?: string; includeArchived?: boolean }, tenantId: number = 1): TestCaseRecord[] {
  const db = getReadOnlyDb();
  try {
    let query = `
      SELECT id, case_id, name, description, category, tags_json, steps_json,
             expectations_json, is_archived, version, created_at, updated_at
      FROM test_cases
    `;
    const conditions: string[] = ['tenant_id = ?'];
    const params: any[] = [tenantId];

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
      steps: JSON.parse(row.steps_json || '[]'),
      expectations: JSON.parse(row.expectations_json || '[]'),
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
 * Get a single test case by ID
 */
export function getTestCase(caseId: string, tenantId: number = 1): TestCaseRecord | null {
  const db = getReadOnlyDb();
  try {
    const row = db.prepare(`
      SELECT id, case_id, name, description, category, tags_json, steps_json,
             expectations_json, is_archived, version, created_at, updated_at
      FROM test_cases
      WHERE case_id = ? AND tenant_id = ?
    `).get(caseId, tenantId) as any;

    if (!row) return null;

    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      description: row.description || '',
      category: row.category,
      tags: JSON.parse(row.tags_json || '[]'),
      steps: JSON.parse(row.steps_json || '[]'),
      expectations: JSON.parse(row.expectations_json || '[]'),
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
 * Create a new test case
 */
export function createTestCase(testCase: Omit<TestCaseRecord, 'id' | 'version' | 'createdAt' | 'updatedAt'>, tenantId: number = 1): TestCaseRecord {
  const db = getWritableDb();
  try {
    const now = new Date().toISOString();

    const info = db.prepare(`
      INSERT INTO test_cases (case_id, name, description, category, tags_json, steps_json, expectations_json, is_archived, version, created_at, updated_at, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      testCase.caseId,
      testCase.name,
      testCase.description,
      testCase.category,
      JSON.stringify(testCase.tags),
      JSON.stringify(testCase.steps),
      JSON.stringify(testCase.expectations),
      testCase.isArchived ? 1 : 0,
      now,
      now,
      tenantId
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
 * Update an existing test case
 */
export function updateTestCase(caseId: string, updates: Partial<Omit<TestCaseRecord, 'id' | 'caseId' | 'createdAt'>>, tenantId: number = 1): TestCaseRecord | null {
  const db = getWritableDb();
  try {
    // First get the existing record
    const existingRow = db.prepare(`
      SELECT id, case_id, name, description, category, tags_json, steps_json,
             expectations_json, is_archived, version, created_at, updated_at
      FROM test_cases
      WHERE case_id = ? AND tenant_id = ?
    `).get(caseId, tenantId) as any;

    if (!existingRow) return null;

    const existing = {
      id: existingRow.id,
      caseId: existingRow.case_id,
      name: existingRow.name,
      description: existingRow.description || '',
      category: existingRow.category,
      tags: JSON.parse(existingRow.tags_json || '[]'),
      steps: JSON.parse(existingRow.steps_json || '[]'),
      expectations: JSON.parse(existingRow.expectations_json || '[]'),
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
      steps: updates.steps ?? existing.steps,
      expectations: updates.expectations ?? existing.expectations,
      isArchived: updates.isArchived ?? existing.isArchived,
    };

    db.prepare(`
      UPDATE test_cases
      SET name = ?, description = ?, category = ?, tags_json = ?, steps_json = ?,
          expectations_json = ?, is_archived = ?, version = ?, updated_at = ?
      WHERE case_id = ? AND tenant_id = ?
    `).run(
      updated.name,
      updated.description,
      updated.category,
      JSON.stringify(updated.tags),
      JSON.stringify(updated.steps),
      JSON.stringify(updated.expectations),
      updated.isArchived ? 1 : 0,
      newVersion,
      now,
      caseId,
      tenantId
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
 * Archive a test case (soft delete)
 */
export function archiveTestCase(caseId: string, tenantId: number = 1): boolean {
  const db = getWritableDb();
  try {
    const result = db.prepare(`
      UPDATE test_cases SET is_archived = 1, updated_at = ? WHERE case_id = ? AND tenant_id = ?
    `).run(new Date().toISOString(), caseId, tenantId);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * Permanently delete a test case
 */
export function deleteTestCase(caseId: string, tenantId: number = 1): boolean {
  const db = getWritableDb();
  try {
    const result = db.prepare(`DELETE FROM test_cases WHERE case_id = ? AND tenant_id = ?`).run(caseId, tenantId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * Clone a test case with a new ID
 */
export function cloneTestCase(caseId: string, newCaseId: string, tenantId: number = 1): TestCaseRecord | null {
  const existing = getTestCase(caseId, tenantId);
  if (!existing) return null;

  return createTestCase({
    caseId: newCaseId,
    name: `${existing.name} (Copy)`,
    description: existing.description,
    category: existing.category,
    tags: [...existing.tags],
    steps: JSON.parse(JSON.stringify(existing.steps)),
    expectations: JSON.parse(JSON.stringify(existing.expectations)),
    isArchived: false,
  }, tenantId);
}

/**
 * Get test case statistics
 */
export function getTestCaseStats(tenantId: number = 1): TestCaseStats {
  const db = getReadOnlyDb();
  try {
    const total = (db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE is_archived = 0 AND tenant_id = ?').get(tenantId) as any)?.count || 0;
    const archived = (db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE is_archived = 1 AND tenant_id = ?').get(tenantId) as any)?.count || 0;

    const byCategoryRows = db.prepare(`
      SELECT category, COUNT(*) as count FROM test_cases WHERE is_archived = 0 AND tenant_id = ? GROUP BY category
    `).all(tenantId) as any[];

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
 * Get all unique tags from test cases
 */
export function getAllTags(tenantId: number = 1): string[] {
  const db = getReadOnlyDb();
  try {
    const rows = db.prepare(`SELECT tags_json FROM test_cases WHERE is_archived = 0 AND tenant_id = ?`).all(tenantId) as any[];

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
 * Check if a test case ID exists
 */
export function testCaseExists(caseId: string, tenantId: number = 1): boolean {
  const db = getReadOnlyDb();
  try {
    const row = db.prepare('SELECT 1 FROM test_cases WHERE case_id = ? AND tenant_id = ?').get(caseId, tenantId);
    return !!row;
  } finally {
    db.close();
  }
}

/**
 * Generate the next available case ID for a category
 */
export function generateNextCaseId(category: 'happy-path' | 'edge-case' | 'error-handling', tenantId: number = 1): string {
  const prefix = category === 'happy-path' ? 'HAPPY' :
                 category === 'edge-case' ? 'EDGE' : 'ERR';

  const db = getReadOnlyDb();
  try {
    const rows = db.prepare(`
      SELECT case_id FROM test_cases WHERE case_id LIKE ? AND tenant_id = ?
    `).all(`${prefix}-%`, tenantId) as any[];

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
 * Validate a test case before saving
 */
export function validateTestCase(testCase: Partial<TestCaseRecord>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!testCase.caseId || testCase.caseId.trim() === '') {
    errors.push({ field: 'caseId', message: 'Case ID is required' });
  } else if (!/^[A-Z]+-\d{3}$/.test(testCase.caseId)) {
    errors.push({ field: 'caseId', message: 'Case ID must match pattern: PREFIX-NNN (e.g., HAPPY-001)' });
  }

  if (!testCase.name || testCase.name.trim() === '') {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  if (!testCase.category) {
    errors.push({ field: 'category', message: 'Category is required' });
  } else if (!['happy-path', 'edge-case', 'error-handling'].includes(testCase.category)) {
    errors.push({ field: 'category', message: 'Invalid category' });
  }

  // Steps validation
  if (!testCase.steps || testCase.steps.length === 0) {
    errors.push({ field: 'steps', message: 'At least one step is required' });
  } else {
    testCase.steps.forEach((step, index) => {
      if (!step.id || step.id.trim() === '') {
        errors.push({ field: `steps[${index}].id`, message: `Step ${index + 1}: ID is required` });
      }
      if (!step.userMessage || step.userMessage.trim() === '') {
        errors.push({ field: `steps[${index}].userMessage`, message: `Step ${index + 1}: User message is required` });
      }

      // Validate regex patterns
      step.expectedPatterns?.forEach((pattern, pIndex) => {
        try {
          new RegExp(pattern);
        } catch (e) {
          errors.push({ field: `steps[${index}].expectedPatterns[${pIndex}]`, message: `Step ${index + 1}: Invalid regex pattern: ${pattern}` });
        }
      });

      step.unexpectedPatterns?.forEach((pattern, pIndex) => {
        try {
          new RegExp(pattern);
        } catch (e) {
          errors.push({ field: `steps[${index}].unexpectedPatterns[${pIndex}]`, message: `Step ${index + 1}: Invalid regex pattern: ${pattern}` });
        }
      });
    });
  }

  return errors;
}

// ============================================================================
// TYPESCRIPT FILE GENERATION
// ============================================================================

const SCENARIOS_DIR = path.resolve(__dirname, '../../../test-agent/src/tests/scenarios');

/**
 * Generate TypeScript code for a single test case
 */
function generateTestCaseCode(testCase: TestCaseRecord): string {
  const stepsCode = testCase.steps.map(step => {
    const semanticExpCode = step.semanticExpectations?.map(se => {
      if (se.type === 'custom') {
        return `se.custom(${JSON.stringify(se.customCriteria || se.description)}, ${se.required})`;
      }
      const helperName = se.type.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (se.type === 'asks_for_info' && se.description !== 'Should ask for information') {
        return `se.askForInfo(${JSON.stringify(se.description)})`;
      }
      return `se.${helperName}()`;
    }).join(',\n          ') || '';

    const negativeExpCode = step.negativeExpectations?.map(ne => {
      if (ne.type === 'custom') {
        return `ne.custom(${JSON.stringify(ne.customCriteria || ne.description)}, ${JSON.stringify(ne.severity)})`;
      }
      const helperName = 'no' + ne.type.replace(/^(contains_|exposes_|contradicts_|ignores_|uses_)/, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^([a-z])/, (_, c) => c.toUpperCase());
      return `ne.${helperName}()`;
    }).join(',\n          ') || '';

    return `    {
      id: ${JSON.stringify(step.id)},
      description: ${JSON.stringify(step.description || '')},
      userMessage: ${JSON.stringify(step.userMessage)},
      expectedPatterns: [${step.expectedPatterns.map(p => `/${p}/i`).join(', ')}],
      unexpectedPatterns: [${step.unexpectedPatterns.map(p => `/${p}/i`).join(', ')}],
      ${semanticExpCode ? `semanticExpectations: [\n          ${semanticExpCode}\n        ],` : 'semanticExpectations: [],'}
      ${negativeExpCode ? `negativeExpectations: [\n          ${negativeExpCode}\n        ],` : 'negativeExpectations: [],'}
      ${step.timeout ? `timeout: ${step.timeout},` : ''}
      ${step.delay ? `delay: ${step.delay},` : ''}
      ${step.optional ? `optional: true,` : ''}
    }`;
  }).join(',\n');

  const expectationsCode = testCase.expectations.map(exp => {
    return `    {
      type: ${JSON.stringify(exp.type)},
      description: ${JSON.stringify(exp.description)},
    }`;
  }).join(',\n');

  return `  {
    id: ${JSON.stringify(testCase.caseId)},
    name: ${JSON.stringify(testCase.name)},
    description: ${JSON.stringify(testCase.description)},
    category: ${JSON.stringify(testCase.category)},
    tags: ${JSON.stringify(testCase.tags)},
    dataRequirements: [],
    steps: [
${stepsCode}
    ],
    expectations: [
${expectationsCode}
    ],
  }`;
}

/**
 * Generate a TypeScript file for a category of test cases
 */
function generateCategoryFile(category: string, testCases: TestCaseRecord[]): string {
  const categoryName = category.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const testCasesCode = testCases.map(tc => generateTestCaseCode(tc)).join(',\n\n');

  return `/**
 * ${category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Test Scenarios
 *
 * Auto-generated from Test Monitor UI
 * DO NOT EDIT DIRECTLY - Use the Test Cases tab in Test Monitor
 *
 * Generated at: ${new Date().toISOString()}
 */

import { TestCase, semanticExpectations as se, negativeExpectations as ne } from '../test-case';

export const ${categoryName}Scenarios: TestCase[] = [
${testCasesCode}
];
`;
}

/**
 * Sync all test cases from database to TypeScript files
 */
export function syncToTypeScript(tenantId: number = 1): { success: boolean; filesWritten: string[]; errors: string[] } {
  const filesWritten: string[] = [];
  const errors: string[] = [];

  try {
    // Ensure scenarios directory exists
    if (!fs.existsSync(SCENARIOS_DIR)) {
      fs.mkdirSync(SCENARIOS_DIR, { recursive: true });
    }

    // Get all non-archived test cases grouped by category
    const allTestCases = getTestCases({ includeArchived: false }, tenantId);

    const byCategory: Record<string, TestCaseRecord[]> = {
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

      const fileName = `generated-${category}.ts`;
      const filePath = path.join(SCENARIOS_DIR, fileName);
      const content = generateCategoryFile(category, testCases);

      fs.writeFileSync(filePath, content, 'utf-8');
      filesWritten.push(fileName);
    }

    // Generate index file that exports all generated scenarios
    const indexContent = `/**
 * Generated Test Scenarios Index
 *
 * Auto-generated from Test Monitor UI
 * DO NOT EDIT DIRECTLY
 *
 * Generated at: ${new Date().toISOString()}
 */

${filesWritten.map(f => {
  const category = f.replace('generated-', '').replace('.ts', '');
  const varName = category.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 'Scenarios';
  return `import { ${varName} } from './${f.replace('.ts', '')}';`;
}).join('\n')}

export const generatedScenarios = [
  ${filesWritten.map(f => {
    const category = f.replace('generated-', '').replace('.ts', '');
    return `...${category.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Scenarios`;
  }).join(',\n  ')}
];
`;

    fs.writeFileSync(path.join(SCENARIOS_DIR, 'generated-index.ts'), indexContent, 'utf-8');
    filesWritten.push('generated-index.ts');

    return { success: true, filesWritten, errors };
  } catch (error: any) {
    errors.push(error.message);
    return { success: false, filesWritten, errors };
  }
}

// ============================================================================
// SEMANTIC EXPECTATION PRESETS
// ============================================================================

export const SEMANTIC_EXPECTATION_PRESETS = [
  { type: 'contains_greeting', label: 'Greeting', description: 'Response should contain a greeting' },
  { type: 'asks_for_name', label: 'Ask for Name', description: 'Should ask for caller name' },
  { type: 'asks_for_info', label: 'Ask for Info', description: 'Should ask for information' },
  { type: 'confirms_info', label: 'Confirm Info', description: 'Should confirm the information provided' },
  { type: 'confirms_booking', label: 'Confirm Booking', description: 'Should confirm the booking was made' },
  { type: 'offers_options', label: 'Offer Options', description: 'Should offer choices or options' },
  { type: 'acknowledges_input', label: 'Acknowledge', description: 'Should acknowledge what was said' },
  { type: 'handles_error', label: 'Handle Error', description: 'Should handle error gracefully' },
  { type: 'asks_for_dob', label: 'Ask for DOB', description: 'Should ask for date of birth' },
  { type: 'asks_for_insurance', label: 'Ask for Insurance', description: 'Should ask about insurance' },
  { type: 'asks_for_email', label: 'Ask for Email', description: 'Should ask for email address' },
  { type: 'mentions_location', label: 'Mention Location', description: 'Should mention the location' },
  { type: 'transfers_to_agent', label: 'Transfer to Agent', description: 'Should transfer to a live agent' },
];

export const NEGATIVE_EXPECTATION_PRESETS = [
  { type: 'contains_error', label: 'No Errors', description: 'Should not contain errors', severity: 'critical' },
  { type: 'exposes_internal', label: 'No Internal Details', description: 'Should not expose internal implementation details', severity: 'high' },
  { type: 'contradicts_previous', label: 'No Contradiction', description: 'Should not contradict earlier statements', severity: 'high' },
  { type: 'ignores_input', label: 'No Ignoring', description: 'Should not ignore what the user said', severity: 'medium' },
  { type: 'uses_banned_words', label: 'No Banned Words', description: 'Should not use banned words (sorry, problem, etc.)', severity: 'low' },
];
