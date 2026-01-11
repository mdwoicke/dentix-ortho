/**
 * Skills Registry Service
 * Manages skill definitions and command building for Skills Runner
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSSHTarget } from '../config/ssh';

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
}

export interface SkillsConfig {
  skills: Skill[];
}

const CONFIG_PATH = path.join(__dirname, '../../config/skills.json');

/**
 * Load skills from config file
 */
export function loadSkills(): SkillsConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { skills: [] };
    }

    const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(configContent) as SkillsConfig;
  } catch (error) {
    console.error('Error loading skills config:', error);
    return { skills: [] };
  }
}

/**
 * Save skills to config file
 */
export function saveSkills(config: SkillsConfig): void {
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

/**
 * Get all skills
 */
export function getSkills(): Skill[] {
  return loadSkills().skills;
}

/**
 * Get a specific skill by ID
 */
export function getSkill(skillId: string): Skill | undefined {
  return loadSkills().skills.find(s => s.id === skillId);
}

/**
 * Get skills grouped by category
 */
export function getSkillsByCategory(): Record<string, Skill[]> {
  const skills = getSkills();
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
 * Add a new skill
 */
export function addSkill(skill: Skill): void {
  const config = loadSkills();
  const existingIndex = config.skills.findIndex(s => s.id === skill.id);

  if (existingIndex >= 0) {
    config.skills[existingIndex] = skill;
  } else {
    config.skills.push(skill);
  }

  saveSkills(config);
}

/**
 * Delete a skill
 */
export function deleteSkill(skillId: string): boolean {
  const config = loadSkills();
  const initialLength = config.skills.length;
  config.skills = config.skills.filter(s => s.id !== skillId);

  if (config.skills.length < initialLength) {
    saveSkills(config);
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
