/**
 * Prompt Service
 * Manages prompt working copies, versioning, and fix application
 */

import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

// Prompt file mappings
const PROMPT_FILE_MAPPINGS: Record<string, { path: string; displayName: string }> = {
  system_prompt: {
    path: path.resolve(__dirname, '../../../docs/Chord_Cloud9_SystemPrompt.md'),
    displayName: 'System Prompt',
  },
  scheduling_tool: {
    path: path.resolve(__dirname, '../../../docs/chord_dso_scheduling-StepwiseSearch.js'),
    displayName: 'Scheduling Tool',
  },
  patient_tool: {
    path: path.resolve(__dirname, '../../../docs/chord_dso_patient-FIXED.js'),
    displayName: 'Patient Tool',
  },
};

export interface PromptFile {
  fileKey: string;
  filePath: string;
  displayName: string;
  version: number;
  lastFixId: string | null;
  updatedAt: string;
}

export interface PromptVersionHistory {
  id: number;
  fileKey: string;
  version: number;
  content: string;
  fixId: string | null;
  changeDescription: string | null;
  createdAt: string;
}

export interface GeneratedFix {
  fixId: string;
  type: 'prompt' | 'tool';
  targetFile: string;
  changeDescription: string;
  changeCode: string;
  location: {
    section?: string;
    function?: string;
    afterLine?: string;
  } | null;
}

/**
 * Get writable database connection
 */
function getWritableDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });
}

/**
 * Get read-only database connection
 */
function getReadOnlyDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
}

/**
 * Initialize working copies from disk files if they don't exist
 */
export function initializeWorkingCopies(): void {
  const db = getWritableDb();

  try {
    for (const [fileKey, mapping] of Object.entries(PROMPT_FILE_MAPPINGS)) {
      // Check if working copy already exists
      const existing = db.prepare(
        'SELECT id FROM prompt_working_copies WHERE file_key = ?'
      ).get(fileKey);

      if (!existing) {
        // Read from disk and create initial working copy
        if (fs.existsSync(mapping.path)) {
          const content = fs.readFileSync(mapping.path, 'utf-8');
          const now = new Date().toISOString();

          // Create working copy
          db.prepare(`
            INSERT INTO prompt_working_copies (file_key, file_path, display_name, content, version, updated_at)
            VALUES (?, ?, ?, ?, 1, ?)
          `).run(fileKey, mapping.path, mapping.displayName, content, now);

          // Create initial version history entry
          db.prepare(`
            INSERT INTO prompt_version_history (file_key, version, content, change_description, created_at)
            VALUES (?, 1, ?, 'Initial version from disk', ?)
          `).run(fileKey, content, now);
        }
      }
    }
  } finally {
    db.close();
  }
}

/**
 * Get all prompt files with their current version info
 */
export function getPromptFiles(): PromptFile[] {
  // Ensure working copies are initialized
  initializeWorkingCopies();

  const db = getReadOnlyDb();
  try {
    const rows = db.prepare(`
      SELECT file_key, file_path, version, last_fix_id, updated_at
      FROM prompt_working_copies
      ORDER BY file_key
    `).all() as any[];

    return rows.map(row => ({
      fileKey: row.file_key,
      filePath: row.file_path,
      displayName: PROMPT_FILE_MAPPINGS[row.file_key]?.displayName || row.file_key,
      version: row.version,
      lastFixId: row.last_fix_id,
      updatedAt: row.updated_at,
    }));
  } finally {
    db.close();
  }
}

/**
 * Get current content for a specific prompt file
 */
export function getPromptContent(fileKey: string): { content: string; version: number } | null {
  // Ensure working copies are initialized
  initializeWorkingCopies();

  const db = getReadOnlyDb();
  try {
    const row = db.prepare(`
      SELECT content, version FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    if (!row) {
      return null;
    }

    return {
      content: row.content,
      version: row.version,
    };
  } finally {
    db.close();
  }
}

/**
 * Get version history for a prompt file
 */
export function getPromptHistory(fileKey: string, limit: number = 20): PromptVersionHistory[] {
  const db = getReadOnlyDb();
  try {
    const rows = db.prepare(`
      SELECT id, file_key, version, content, fix_id, change_description, created_at
      FROM prompt_version_history
      WHERE file_key = ?
      ORDER BY version DESC
      LIMIT ?
    `).all(fileKey, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      fileKey: row.file_key,
      version: row.version,
      content: row.content,
      fixId: row.fix_id,
      changeDescription: row.change_description,
      createdAt: row.created_at,
    }));
  } finally {
    db.close();
  }
}

/**
 * Apply a fix to a prompt and create a new version
 */
export function applyFix(fileKey: string, fixId: string): { newVersion: number; content: string } {
  // Ensure working copies are initialized
  initializeWorkingCopies();

  const db = getWritableDb();
  try {
    // Get current working copy
    const current = db.prepare(`
      SELECT content, version FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    if (!current) {
      throw new Error(`Prompt file not found: ${fileKey}`);
    }

    // Get the fix details
    const fix = db.prepare(`
      SELECT fix_id, type, target_file, change_description, change_code, location_json
      FROM generated_fixes
      WHERE fix_id = ?
    `).get(fixId) as any;

    if (!fix) {
      throw new Error(`Fix not found: ${fixId}`);
    }

    // Parse location if present
    const location = fix.location_json ? JSON.parse(fix.location_json) : null;

    // Merge the fix into the current content
    const mergedContent = mergeFixIntoContent(current.content, {
      fixId: fix.fix_id,
      type: fix.type,
      targetFile: fix.target_file,
      changeDescription: fix.change_description,
      changeCode: fix.change_code,
      location,
    });

    const newVersion = current.version + 1;
    const now = new Date().toISOString();

    // Update working copy
    db.prepare(`
      UPDATE prompt_working_copies
      SET content = ?, version = ?, last_fix_id = ?, updated_at = ?
      WHERE file_key = ?
    `).run(mergedContent, newVersion, fixId, now, fileKey);

    // Create version history entry
    db.prepare(`
      INSERT INTO prompt_version_history (file_key, version, content, fix_id, change_description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(fileKey, newVersion, mergedContent, fixId, fix.change_description, now);

    // Update fix status to 'applied'
    db.prepare(`
      UPDATE generated_fixes SET status = 'applied' WHERE fix_id = ?
    `).run(fixId);

    return {
      newVersion,
      content: mergedContent,
    };
  } finally {
    db.close();
  }
}

/**
 * Merge a fix's change code into the existing content
 * Handles location-based insertion for prompts and tools
 */
function mergeFixIntoContent(content: string, fix: GeneratedFix): string {
  const { changeCode, location } = fix;

  // If no location specified, append to end
  if (!location) {
    return content + '\n\n' + changeCode;
  }

  const lines = content.split('\n');

  // Handle section-based insertion (for prompts with XML-like sections)
  if (location.section) {
    const sectionPattern = new RegExp(`<${location.section}[^>]*>`, 'i');
    const sectionEndPattern = new RegExp(`</${location.section}>`, 'i');

    let insideSection = false;
    let sectionEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (sectionPattern.test(lines[i])) {
        insideSection = true;
      }
      if (insideSection && sectionEndPattern.test(lines[i])) {
        sectionEndIndex = i;
        break;
      }
    }

    // Insert before the closing tag
    if (sectionEndIndex > 0) {
      lines.splice(sectionEndIndex, 0, '', changeCode);
      return lines.join('\n');
    }
  }

  // Handle function-based insertion (for JS files)
  if (location.function) {
    const funcPattern = new RegExp(`(function\\s+${location.function}|const\\s+${location.function}\\s*=)`, 'i');

    for (let i = 0; i < lines.length; i++) {
      if (funcPattern.test(lines[i])) {
        // Find the closing brace of the function (simplified)
        let braceCount = 0;
        let funcEnd = -1;
        for (let j = i; j < lines.length; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          if (braceCount === 0 && j > i) {
            funcEnd = j;
            break;
          }
        }
        if (funcEnd > 0) {
          // Insert before the closing brace
          lines.splice(funcEnd, 0, changeCode);
          return lines.join('\n');
        }
      }
    }
  }

  // Handle afterLine insertion
  if (location.afterLine) {
    const afterLinePattern = new RegExp(location.afterLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    for (let i = 0; i < lines.length; i++) {
      if (afterLinePattern.test(lines[i])) {
        lines.splice(i + 1, 0, '', changeCode);
        return lines.join('\n');
      }
    }
  }

  // Fallback: append to end
  return content + '\n\n' + changeCode;
}

/**
 * Get content of a specific version
 */
export function getVersionContent(fileKey: string, version: number): string | null {
  const db = getReadOnlyDb();
  try {
    const row = db.prepare(`
      SELECT content FROM prompt_version_history
      WHERE file_key = ? AND version = ?
    `).get(fileKey, version) as any;

    return row ? row.content : null;
  } finally {
    db.close();
  }
}

/**
 * Sync working copy to disk (write current version to the actual file)
 */
export function syncToDisk(fileKey: string): boolean {
  const db = getReadOnlyDb();
  try {
    const row = db.prepare(`
      SELECT content, file_path FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    if (!row) {
      return false;
    }

    fs.writeFileSync(row.file_path, row.content, 'utf-8');
    return true;
  } finally {
    db.close();
  }
}
