/**
 * Skills Registry Service
 * Manages skill definitions and command building for Skills Runner.
 * Database-backed with tenant isolation; falls back to skills.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSSHTarget } from '../config/ssh';
import { getDatabase } from '../config/database';

export interface SkillInput {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  required?: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface Skill {
  id: string;
  name: string;
  description?: string;
  command: string;
  category: string;
  inputs: SkillInput[];
  skillType?: string | null;
}

export interface SkillsConfig {
  skills: Skill[];
}

const CONFIG_PATH = path.join(__dirname, '../../config/skills.json');

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/** Check if the tenant_skills table exists (migration 008 applied) */
function hasTenantSkillsTable(): boolean {
  try {
    const db = getDatabase();
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_skills'"
    ).get();
    return !!row;
  } catch {
    return false;
  }
}

interface TenantSkillRow {
  id: number;
  tenant_id: number;
  skill_id: string;
  name: string;
  description: string | null;
  command: string;
  category: string;
  inputs: string;
  skill_type: string | null;
  is_active: number;
  sort_order: number;
}

/** Map a database row to a Skill object */
function rowToSkill(row: TenantSkillRow): Skill {
  let inputs: SkillInput[] = [];
  try {
    inputs = JSON.parse(row.inputs);
  } catch { /* empty */ }

  return {
    id: row.skill_id,
    name: row.name,
    description: row.description || undefined,
    command: row.command,
    category: row.category,
    inputs,
    skillType: row.skill_type || undefined,
  };
}

// ---------------------------------------------------------------------------
// JSON file fallback (pre-migration)
// ---------------------------------------------------------------------------

function loadSkillsFromFile(): SkillsConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { skills: [] };
    }
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(configContent);
    // Normalize skillType from the raw JSON
    const skills = (parsed.skills || []).map((s: any) => ({
      ...s,
      skillType: s.skillType || undefined,
    }));
    return { skills };
  } catch (error) {
    console.error('Error loading skills config:', error);
    return { skills: [] };
  }
}

function saveSkillsToFile(config: SkillsConfig): void {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving skills config:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all skills for a tenant. Falls back to JSON file if DB not available.
 */
export function getSkills(tenantId?: number): Skill[] {
  if (tenantId && hasTenantSkillsTable()) {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM tenant_skills WHERE tenant_id = ? AND is_active = 1 ORDER BY sort_order, id'
    ).all(tenantId) as TenantSkillRow[];
    return rows.map(rowToSkill);
  }
  return loadSkillsFromFile().skills;
}

/**
 * Get a specific skill by ID, scoped to tenant.
 */
export function getSkill(skillId: string, tenantId?: number): Skill | undefined {
  if (tenantId && hasTenantSkillsTable()) {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT * FROM tenant_skills WHERE tenant_id = ? AND skill_id = ? AND is_active = 1'
    ).get(tenantId, skillId) as TenantSkillRow | undefined;
    return row ? rowToSkill(row) : undefined;
  }
  return loadSkillsFromFile().skills.find(s => s.id === skillId);
}

/**
 * Get skills grouped by category, scoped to tenant.
 */
export function getSkillsByCategory(tenantId?: number): Record<string, Skill[]> {
  const skills = getSkills(tenantId);
  return skills.reduce((acc, skill) => {
    const category = skill.category || 'uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(skill);
    return acc;
  }, {} as Record<string, Skill[]>);
}

/**
 * Build command string from skill and inputs
 */
export function buildCommand(
  skill: Skill,
  inputs: Record<string, string | number | boolean>,
  targetId: string
): string {
  let command = skill.command;
  const target = getSSHTarget(targetId);

  // Replace workDir placeholder
  if (target?.workDir) {
    command = command.replace(/\{\{workDir\}\}/g, target.workDir);
  }

  // Process each input
  for (const input of skill.inputs) {
    const value = inputs[input.name];
    const hasValue = value !== undefined && value !== null && value !== '';

    // Direct placeholder replacement
    const placeholder = `{{${input.name}}}`;
    if (command.includes(placeholder)) {
      command = command.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), hasValue ? String(value) : '');
    }

    // Argument placeholder replacement (e.g., {{scenariosArg}} becomes --scenarios VALUE or empty)
    const argPlaceholder = `{{${input.name}Arg}}`;
    if (command.includes(argPlaceholder)) {
      let argValue = '';
      if (hasValue) {
        // Convert camelCase to kebab-case for CLI args
        const argName = input.name.replace(/([A-Z])/g, '-$1').toLowerCase();
        argValue = `--${argName} ${String(value)}`;
      }
      command = command.replace(new RegExp(argPlaceholder.replace(/[{}]/g, '\\$&'), 'g'), argValue);
    }
  }

  // Clean up multiple spaces and trailing spaces
  command = command.replace(/\s+/g, ' ').trim();

  return command;
}

/**
 * Validate inputs against skill definition
 */
export function validateInputs(
  skill: Skill,
  inputs: Record<string, string | number | boolean>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const inputDef of skill.inputs) {
    const value = inputs[inputDef.name];

    // Check required
    if (inputDef.required && (value === undefined || value === null || value === '')) {
      errors.push(`${inputDef.label || inputDef.name} is required`);
      continue;
    }

    // Skip further validation if empty and not required
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Type-specific validation
    if (inputDef.type === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`${inputDef.label || inputDef.name} must be a number`);
      } else {
        if (inputDef.min !== undefined && numValue < inputDef.min) {
          errors.push(`${inputDef.label || inputDef.name} must be at least ${inputDef.min}`);
        }
        if (inputDef.max !== undefined && numValue > inputDef.max) {
          errors.push(`${inputDef.label || inputDef.name} must be at most ${inputDef.max}`);
        }
      }
    }

    if (inputDef.type === 'select' && inputDef.options) {
      const validValues = inputDef.options.map(o => o.value);
      if (!validValues.includes(String(value))) {
        errors.push(`${inputDef.label || inputDef.name} must be one of: ${validValues.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Add or update a skill, scoped to tenant.
 */
export function addSkill(skill: Skill, tenantId?: number): void {
  if (tenantId && hasTenantSkillsTable()) {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO tenant_skills
        (tenant_id, skill_id, name, description, command, category, inputs, skill_type, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      skill.id,
      skill.name,
      skill.description || null,
      skill.command,
      skill.category || 'custom',
      JSON.stringify(skill.inputs || []),
      skill.skillType || null,
    );
    return;
  }

  // Fallback: update JSON file
  const config = loadSkillsFromFile();
  const existingIndex = config.skills.findIndex(s => s.id === skill.id);

  if (existingIndex >= 0) {
    config.skills[existingIndex] = skill;
  } else {
    config.skills.push(skill);
  }

  saveSkillsToFile(config);
}

/**
 * Delete a skill, scoped to tenant.
 */
export function deleteSkill(skillId: string, tenantId?: number): boolean {
  if (tenantId && hasTenantSkillsTable()) {
    const db = getDatabase();
    const result = db.prepare(
      'DELETE FROM tenant_skills WHERE tenant_id = ? AND skill_id = ?'
    ).run(tenantId, skillId);
    return result.changes > 0;
  }

  // Fallback: update JSON file
  const config = loadSkillsFromFile();
  const initialLength = config.skills.length;
  config.skills = config.skills.filter(s => s.id !== skillId);

  if (config.skills.length < initialLength) {
    saveSkillsToFile(config);
    return true;
  }
  return false;
}

// Export singleton-like functions grouped
export const skillsRegistry = {
  getSkills,
  getSkill,
  getSkillsByCategory,
  buildCommand,
  validateInputs,
  addSkill,
  deleteSkill
};
