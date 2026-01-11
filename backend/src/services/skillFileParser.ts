/**
 * Skill File Parser Service
 * Parses Claude skill .MD files with YAML frontmatter
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ParsedSkillFile {
  /** Skill name from frontmatter or filename */
  name: string;
  /** Skill description from frontmatter */
  description?: string;
  /** Preferred model from frontmatter */
  model?: string;
  /** Full markdown content (used as system prompt) */
  content: string;
  /** Original file path */
  filePath: string;
}

export interface SkillFileInfo {
  /** Relative path from project root */
  path: string;
  /** Skill name */
  name: string;
  /** Skill description */
  description?: string;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse YAML frontmatter from content
 * Extracts content between --- markers at the start of the file
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];

  // Simple YAML parsing (key: value pairs)
  const frontmatter: Record<string, string> = {};
  const lines = frontmatterStr.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Extract skill name from filename
 */
function extractNameFromFilename(filePath: string): string {
  const basename = path.basename(filePath, '.md');
  // Convert kebab-case to Title Case
  return basename
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse a skill .MD file
 */
export function parseSkillFile(filePath: string, projectRoot?: string): ParsedSkillFile {
  // Resolve the file path
  const resolvedPath = projectRoot
    ? path.resolve(projectRoot, filePath)
    : path.resolve(filePath);

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Skill file not found: ${resolvedPath}`);
  }

  // Read file content
  const content = fs.readFileSync(resolvedPath, 'utf-8');

  // Parse frontmatter
  const { frontmatter, body } = parseFrontmatter(content);

  // Extract skill info
  const name = frontmatter.name || extractNameFromFilename(filePath);
  const description = frontmatter.description;
  const model = frontmatter.model;

  return {
    name,
    description,
    model,
    content: body.trim(),
    filePath: resolvedPath,
  };
}

/**
 * Discover all skill files in a directory
 * @param skillsDir - Absolute path to the skills directory
 * @param projectRoot - Optional project root for computing relative paths
 */
export function discoverSkillFiles(skillsDir: string, projectRoot?: string): SkillFileInfo[] {
  const skills: SkillFileInfo[] = [];

  // Check if directory exists
  if (!fs.existsSync(skillsDir)) {
    console.warn(`[SkillFileParser] Skills directory not found: ${skillsDir}`);
    return skills;
  }

  // Read directory
  const files = fs.readdirSync(skillsDir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filePath = path.join(skillsDir, file);

    try {
      // Read and parse frontmatter only (for efficiency)
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);

      const name = frontmatter.name || extractNameFromFilename(file);
      const description = frontmatter.description;

      // Return relative path if projectRoot is provided, otherwise absolute
      const relativePath = projectRoot
        ? path.relative(projectRoot, filePath).replace(/\\/g, '/')
        : filePath;

      skills.push({
        path: relativePath,
        name,
        description,
      });
    } catch (error) {
      console.warn(`[SkillFileParser] Failed to parse ${file}:`, error);
    }
  }

  // Sort by name
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return skills;
}

/**
 * Get the default skills directory path
 */
export function getDefaultSkillsDir(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'skills');
}
