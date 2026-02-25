import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';

/**
 * Migration 008: Tenant Skills
 *
 * Creates a tenant_skills table so each tenant gets its own curated skill set.
 * Seeds from backend/config/skills.json:
 *   - Ortho  (tenant_id=1): all 35 skills
 *   - Dominos (tenant_id=4): all 35 skills
 *   - Chord   (tenant_id=5): 26 shared + 4 Chord-specific = 30 skills
 */

const MIGRATION_ID = '008_tenant_skills';

const ORTHO_TENANT_ID = 1;
const DOMINOS_TENANT_ID = 4;
const CHORD_TENANT_ID = 5;

/** Skill IDs that are Ortho-specific and excluded from Chord */
const CHORD_EXCLUDED_SKILLS = new Set([
  'nodered-deploy',
  'nodered-list-flows',
  'nodered-copy-flow',
  'agent-trace-session',
  'agent-analyze-failure-pattern',
  'agent-analyze-sibling-failures',
  'agent-full-session-analysis',
  'agent-analyze-recent-failures',
  'agent-analyze-trace',
]);

interface RawSkill {
  id: string;
  name: string;
  description?: string;
  command?: string;
  category?: string;
  inputs?: unknown[];
  skillType?: string;
}

/** Chord-specific skills not in skills.json */
const CHORD_ONLY_SKILLS: Array<{
  skill_id: string;
  name: string;
  description: string;
  command: string;
  category: string;
  inputs: string;
  sort_order: number;
}> = [
  {
    skill_id: 'chord-e2e-test',
    name: 'Chord E2E Test',
    description: 'Run Chord end-to-end tests against NexHealth via Node-RED',
    command: 'py C:/Users/mwoic/PycharmProjects/PythonProject/chord_e2e_package/test_chord_e2e.py --target {{target}} --location {{location}}',
    category: 'test-agent',
    inputs: JSON.stringify([
      { name: 'target', label: 'Target', type: 'select', required: false, default: 'prod', options: [{ value: 'prod', label: 'Production LB' }, { value: 'dmn2', label: 'DMN-2 Patched' }, { value: 'both', label: 'Both' }], description: 'API target environment' },
      { name: 'location', label: 'Location', type: 'select', required: false, default: 'both', options: [{ value: 'beth', label: 'Bethlehem (4096)' }, { value: 'aston', label: 'Aston (4097)' }, { value: 'both', label: 'Both' }], description: 'Dental office location' },
    ]),
    sort_order: 100,
  },
  {
    skill_id: 'chord-langfuse-traces',
    name: 'Chord Langfuse Traces',
    description: 'Analyze recent Chord Langfuse traces',
    command: 'py C:/Users/mwoic/PycharmProjects/PythonProject/chord_e2e_package/test_chord_e2e.py --langfuse-only --minutes {{minutes}}',
    category: 'agents',
    inputs: JSON.stringify([
      { name: 'minutes', label: 'Minutes', type: 'number', required: false, default: 60, min: 5, max: 1440, description: 'How many minutes back to analyze' },
    ]),
    sort_order: 101,
  },
  {
    skill_id: 'chord-list-management',
    name: 'Chord List Management',
    description: 'Verify IntelePeer List Management data for Chord locations',
    command: 'py C:/Users/mwoic/PycharmProjects/PythonProject/chord_e2e_package/tests/test_list_management.py --location {{location}} --all',
    category: 'utility',
    inputs: JSON.stringify([
      { name: 'location', label: 'Location ID', type: 'select', required: false, default: '4097', options: [{ value: '4096', label: 'Bethlehem (4096)' }, { value: '4097', label: 'Aston (4097)' }], description: 'IntelePeer location ID' },
    ]),
    sort_order: 102,
  },
  {
    skill_id: 'chord-bulletproof-test',
    name: 'Chord Bulletproof Test',
    description: 'Run Chord bulletproof test harness',
    command: 'py C:/Users/mwoic/PycharmProjects/PythonProject/chord_e2e_package/tests/Test_E2E_Aston_Bulletproof.py --target {{target}} --good-only',
    category: 'test-agent',
    inputs: JSON.stringify([
      { name: 'target', label: 'Target', type: 'select', required: false, default: 'dmn2', options: [{ value: 'prod', label: 'Production LB' }, { value: 'dmn2', label: 'DMN-2 Patched' }], description: 'API target environment' },
    ]),
    sort_order: 103,
  },
];

export function run(db: Database.Database): void {
  // Idempotency: skip if table already exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_skills'"
  ).get();

  if (tableExists) {
    logger.info(`Migration ${MIGRATION_ID}: already applied, skipping`);
    return;
  }

  logger.info(`Migration ${MIGRATION_ID}: applying...`);

  // Load skills from JSON
  const skillsJsonPath = path.join(__dirname, '../../../config/skills.json');
  let rawSkills: RawSkill[] = [];
  try {
    const content = fs.readFileSync(skillsJsonPath, 'utf-8');
    const parsed = JSON.parse(content);
    rawSkills = parsed.skills || [];
  } catch (error) {
    logger.error(`Migration ${MIGRATION_ID}: failed to read skills.json`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const migrate = db.transaction(() => {
    // Create table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        skill_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        command TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'custom',
        inputs TEXT NOT NULL DEFAULT '[]',
        skill_type TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, skill_id)
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ts_tenant ON tenant_skills(tenant_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ts_category ON tenant_skills(tenant_id, category)`);

    // Prepare insert statement
    const insert = db.prepare(`
      INSERT OR REPLACE INTO tenant_skills
        (tenant_id, skill_id, name, description, command, category, inputs, skill_type, sort_order)
      VALUES
        (@tenant_id, @skill_id, @name, @description, @command, @category, @inputs, @skill_type, @sort_order)
    `);

    // Helper to insert all skills for a tenant
    function insertSkillsForTenant(tenantId: number, excludeSet?: Set<string>) {
      for (let i = 0; i < rawSkills.length; i++) {
        const skill = rawSkills[i];
        if (excludeSet && excludeSet.has(skill.id)) continue;

        insert.run({
          tenant_id: tenantId,
          skill_id: skill.id,
          name: skill.name,
          description: skill.description || null,
          command: skill.command || '',
          category: skill.category || 'custom',
          inputs: JSON.stringify(skill.inputs || []),
          skill_type: skill.skillType || null,
          sort_order: i,
        });
      }
    }

    // Ortho: all skills
    insertSkillsForTenant(ORTHO_TENANT_ID);

    // Dominos: all skills
    insertSkillsForTenant(DOMINOS_TENANT_ID);

    // Chord: shared skills (excluding Ortho-specific) + Chord-only skills
    insertSkillsForTenant(CHORD_TENANT_ID, CHORD_EXCLUDED_SKILLS);

    for (const chordSkill of CHORD_ONLY_SKILLS) {
      insert.run({
        tenant_id: CHORD_TENANT_ID,
        skill_id: chordSkill.skill_id,
        name: chordSkill.name,
        description: chordSkill.description,
        command: chordSkill.command,
        category: chordSkill.category,
        inputs: chordSkill.inputs,
        skill_type: null,
        sort_order: chordSkill.sort_order,
      });
    }
  });

  migrate();
  logger.info(`Migration ${MIGRATION_ID}: applied successfully — seeded skills for tenants 1, 4, 5`);
}
