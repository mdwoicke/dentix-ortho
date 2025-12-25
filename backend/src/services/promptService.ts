/**
 * Prompt Service
 * Manages prompt working copies, versioning, and fix application
 *
 * IMPORTANT: All fixes are validated before saving to prevent broken code.
 * - JavaScript files are syntax-checked using vm.compileFunction
 * - Brace matching is validated for all files
 * - Invalid merges are rejected with detailed error messages
 *
 * FLOWISE COMPATIBILITY:
 * - Flowise uses Mustache templating where {{...}} is the template syntax
 * - All literal curly braces in prompt content must be escaped as {{ and }}
 * - The escapeForFlowise() function handles this automatically
 */

import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

// ============================================================================
// FLOWISE BRACE ESCAPING
// ============================================================================

/**
 * Escape curly braces for Flowise Mustache template compatibility.
 *
 * Flowise uses Mustache templating where:
 * - {{variable}} is used for variable substitution
 * - Single { or } in content causes "Single '}' in template" errors
 *
 * This function converts:
 * - { → {{ (unless already escaped)
 * - } → }} (unless already escaped)
 *
 * @param content - The raw prompt content
 * @returns Content with braces escaped for Flowise
 */
export function escapeForFlowise(content: string): string {
  if (!content) return content;

  // Track positions to escape (we need to process in reverse to maintain indices)
  const replacements: { index: number; from: string; to: string }[] = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';
    const prevChar = content[i - 1] || '';

    if (char === '{') {
      // Check if already escaped (part of {{ )
      if (nextChar !== '{' && prevChar !== '{') {
        replacements.push({ index: i, from: '{', to: '{{' });
      } else if (nextChar === '{') {
        // Skip the next brace as it's part of {{
        i++;
      }
    } else if (char === '}') {
      // Check if already escaped (part of }} )
      if (nextChar !== '}' && prevChar !== '}') {
        replacements.push({ index: i, from: '}', to: '}}' });
      } else if (nextChar === '}') {
        // Skip the next brace as it's part of }}
        i++;
      }
    }
  }

  // Apply replacements in reverse order to maintain correct indices
  let result = content;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { index, from, to } = replacements[i];
    result = result.substring(0, index) + to + result.substring(index + from.length);
  }

  return result;
}

/**
 * Unescape curly braces from Flowise format back to normal.
 *
 * This function converts:
 * - {{ → {
 * - }} → }
 *
 * @param content - The Flowise-escaped content
 * @returns Content with braces unescaped
 */
export function unescapeFromFlowise(content: string): string {
  if (!content) return content;

  // Simple replacement - {{ becomes {, }} becomes }
  return content.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
}

/**
 * Detect if content has unescaped braces that would cause Flowise errors.
 *
 * @param content - The content to check
 * @returns Object with detection results
 */
export function detectUnescapedBraces(content: string): {
  hasUnescaped: boolean;
  count: number;
  positions: { index: number; char: string; context: string }[];
} {
  const positions: { index: number; char: string; context: string }[] = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';
    const prevChar = content[i - 1] || '';

    if (char === '{' && nextChar !== '{' && prevChar !== '{') {
      const start = Math.max(0, i - 15);
      const end = Math.min(content.length, i + 25);
      const context = content.substring(start, end).replace(/\n/g, '\\n');
      positions.push({ index: i, char: '{', context });
    } else if (char === '}' && nextChar !== '}' && prevChar !== '}') {
      const start = Math.max(0, i - 15);
      const end = Math.min(content.length, i + 25);
      const context = content.substring(start, end).replace(/\n/g, '\\n');
      positions.push({ index: i, char: '}', context });
    }
  }

  return {
    hasUnescaped: positions.length > 0,
    count: positions.length,
    positions,
  };
}

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

// ============================================================================
// CONTENT VALIDATION
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate content based on file type
 */
function validateContent(content: string, fileKey: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for basic issues
  if (!content || content.trim().length === 0) {
    errors.push('Content is empty');
    return { valid: false, errors, warnings };
  }

  // Determine if this is a JavaScript file
  const isJavaScriptFile = fileKey.includes('tool') || fileKey.endsWith('.js');

  // For JS files, validate syntax using vm.compileFunction (comprehensive validation)
  // Skip simple brace validation for JS files - vm.compileFunction handles this better
  if (isJavaScriptFile) {
    const jsValidation = validateJavaScriptSyntax(content);
    if (!jsValidation.valid) {
      errors.push(...jsValidation.errors);
    }
    warnings.push(...jsValidation.warnings);
  } else {
    // For non-JS files (prompts, markdown), validate braces are balanced
    const braceValidation = validateBraces(content);
    if (!braceValidation.valid) {
      errors.push(...braceValidation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that braces are balanced in the content
 */
function validateBraces(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Track brace positions for better error messages
  const stack: { char: string; line: number; col: number }[] = [];
  const lines = content.split('\n');
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const closers: Record<string, string> = { '}': '{', ']': '[', ')': '(' };

  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    inLineComment = false;

    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      const prevChar = col > 0 ? line[col - 1] : '';
      const nextChar = col < line.length - 1 ? line[col + 1] : '';

      // Handle comments
      if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
        inLineComment = true;
        break;
      }
      if (!inString && !inBlockComment && char === '/' && nextChar === '*') {
        inBlockComment = true;
        col++;
        continue;
      }
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        col++;
        continue;
      }
      if (inLineComment || inBlockComment) continue;

      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }
      if (inString) continue;

      // Track braces
      if (pairs[char]) {
        stack.push({ char, line: lineNum + 1, col: col + 1 });
      } else if (closers[char]) {
        const expected = closers[char];
        if (stack.length === 0) {
          errors.push(`Unexpected '${char}' at line ${lineNum + 1}, col ${col + 1} - no matching opener`);
        } else if (stack[stack.length - 1].char !== expected) {
          const top = stack[stack.length - 1];
          errors.push(`Mismatched brace: expected '${pairs[top.char]}' to close '${top.char}' from line ${top.line}, but found '${char}' at line ${lineNum + 1}`);
        } else {
          stack.pop();
        }
      }
    }
  }

  // Check for unclosed braces
  for (const unclosed of stack) {
    errors.push(`Unclosed '${unclosed.char}' at line ${unclosed.line}, col ${unclosed.col}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate JavaScript syntax using vm.compileFunction
 */
function validateJavaScriptSyntax(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Wrap in an async function to support await and return statements
    const wrappedCode = `(async function() {\n${content}\n})`;
    vm.compileFunction(wrappedCode, [], { filename: 'validation.js' });
  } catch (error: any) {
    // Extract line number from error if possible
    const lineMatch = error.message?.match(/line (\d+)/i);
    const line = lineMatch ? parseInt(lineMatch[1]) - 1 : 'unknown'; // -1 for wrapper
    errors.push(`JavaScript syntax error at line ${line}: ${error.message}`);
  }

  // Check for common issues that might not be syntax errors
  if (content.includes('cleanedParams') && !content.includes('const cleanedParams')) {
    warnings.push('Reference to "cleanedParams" found but not defined - did you mean "params"?');
  }

  return { valid: errors.length === 0, errors, warnings };
}

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
 *
 * IMPORTANT: This function validates the merged content BEFORE saving.
 * If validation fails, the fix is NOT applied and an error is thrown.
 */
export function applyFix(fileKey: string, fixId: string): { newVersion: number; content: string; warnings?: string[] } {
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

    // Attempt to merge the fix into the current content
    let mergedContent: string;
    try {
      mergedContent = mergeFixIntoContent(current.content, {
        fixId: fix.fix_id,
        type: fix.type,
        targetFile: fix.target_file,
        changeDescription: fix.change_description,
        changeCode: fix.change_code,
        location,
      });
    } catch (mergeError: any) {
      throw new Error(`Failed to merge fix: ${mergeError.message}`);
    }

    // CRITICAL: Validate the merged content before saving
    const validation = validateContent(mergedContent, fileKey);

    if (!validation.valid) {
      // Log the validation errors for debugging
      console.error(`[promptService] Fix validation failed for ${fileKey}:`);
      validation.errors.forEach(err => console.error(`  - ${err}`));

      throw new Error(
        `Fix would create invalid content. Errors:\n${validation.errors.join('\n')}\n\n` +
        `The fix was NOT applied. Please review the fix code and try again.`
      );
    }

    // Log any warnings
    if (validation.warnings.length > 0) {
      console.warn(`[promptService] Fix applied with warnings for ${fileKey}:`);
      validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
    }

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
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } finally {
    db.close();
  }
}

/**
 * Merge a fix's change code into the existing content
 * Handles location-based insertion for prompts and tools
 *
 * IMPORTANT: This function tries multiple strategies to find the right insertion point.
 * It will NOT blindly append to end - that's what caused the broken file issue.
 */
function mergeFixIntoContent(content: string, fix: GeneratedFix): string {
  const { changeCode, location } = fix;
  const lines = content.split('\n');

  // Strategy 1: Use explicit location if provided
  if (location) {
    // Handle section-based insertion (for prompts with XML-like sections)
    if (location.section) {
      const result = insertIntoSection(lines, location.section, changeCode);
      if (result) return result;
    }

    // Handle function-based insertion (for JS files)
    if (location.function) {
      const result = insertIntoFunction(lines, location.function, changeCode);
      if (result) return result;
    }

    // Handle afterLine insertion
    if (location.afterLine) {
      const result = insertAfterLine(lines, location.afterLine, changeCode);
      if (result) return result;
    }
  }

  // Strategy 2: Try to detect insertion point from the changeCode itself
  const smartResult = smartInsert(lines, changeCode, fix.targetFile);
  if (smartResult) return smartResult;

  // Strategy 3: FAIL SAFE - Don't blindly append, throw an error instead
  // This prevents the broken file scenario
  throw new Error(
    `Could not determine safe insertion point for fix. ` +
    `Target: ${fix.targetFile}, Location: ${JSON.stringify(location)}. ` +
    `Please specify a more precise location (section, function, or afterLine).`
  );
}

/**
 * Insert code into an XML-like section
 */
function insertIntoSection(lines: string[], section: string, code: string): string | null {
  const sectionPattern = new RegExp(`<${section}[^>]*>`, 'i');
  const sectionEndPattern = new RegExp(`</${section}>`, 'i');

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

  if (sectionEndIndex > 0) {
    lines.splice(sectionEndIndex, 0, '', code);
    return lines.join('\n');
  }

  return null;
}

/**
 * Insert code into a JavaScript function body
 */
function insertIntoFunction(lines: string[], funcName: string, code: string): string | null {
  const funcPattern = new RegExp(
    `(function\\s+${funcName}\\s*\\(|const\\s+${funcName}\\s*=\\s*(async\\s+)?function|const\\s+${funcName}\\s*=\\s*(async\\s+)?\\()`,
    'i'
  );

  for (let i = 0; i < lines.length; i++) {
    if (funcPattern.test(lines[i])) {
      // Find the opening brace and track to the closing brace
      let braceCount = 0;
      let startedCounting = false;
      let funcEnd = -1;

      for (let j = i; j < lines.length; j++) {
        const line = lines[j];
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            startedCounting = true;
          } else if (char === '}') {
            braceCount--;
          }
        }

        if (startedCounting && braceCount === 0) {
          funcEnd = j;
          break;
        }
      }

      if (funcEnd > i) {
        // Insert before the closing brace, with proper indentation
        const indent = lines[funcEnd].match(/^(\s*)/)?.[1] || '';
        const indentedCode = code.split('\n').map(l => indent + '  ' + l).join('\n');
        lines.splice(funcEnd, 0, indentedCode);
        return lines.join('\n');
      }
    }
  }

  return null;
}

/**
 * Insert code after a specific line pattern
 */
function insertAfterLine(lines: string[], afterLine: string, code: string): string | null {
  const escapedPattern = afterLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const afterLinePattern = new RegExp(escapedPattern, 'i');

  for (let i = 0; i < lines.length; i++) {
    if (afterLinePattern.test(lines[i])) {
      lines.splice(i + 1, 0, '', code);
      return lines.join('\n');
    }
  }

  return null;
}

/**
 * Smart insertion - try to detect where the code should go based on its content
 */
function smartInsert(lines: string[], code: string, targetFile: string): string | null {
  // Detect if this is a switch case modification
  const caseMatch = code.match(/case\s+['"]([^'"]+)['"]\s*:/);
  if (caseMatch) {
    const caseName = caseMatch[1];
    return insertIntoCaseBlock(lines, caseName, code);
  }

  // Detect if this modifies a specific variable assignment
  const varMatch = code.match(/^(\s*)(const|let|var)?\s*(\w+)\s*(=|\+=|-=)/);
  if (varMatch) {
    const varName = varMatch[3];
    return insertNearVariable(lines, varName, code);
  }

  // Detect if this is adding to an object property
  const propMatch = code.match(/^(\s*)(\w+)\s*:\s*/);
  if (propMatch) {
    const propName = propMatch[2];
    // Try to find the object context
    return insertIntoObjectWithProperty(lines, propName, code);
  }

  return null;
}

/**
 * Insert code into a switch case block
 */
function insertIntoCaseBlock(lines: string[], caseName: string, code: string): string | null {
  const casePattern = new RegExp(`case\\s+['"]${caseName}['"]\\s*:`, 'i');

  for (let i = 0; i < lines.length; i++) {
    if (casePattern.test(lines[i])) {
      // Find the opening brace of the case block
      let braceCount = 0;
      let startedCounting = false;
      let caseBlockEnd = -1;

      for (let j = i; j < lines.length; j++) {
        const line = lines[j];

        // Check if we hit the next case or default
        if (j > i && /^\s*(case\s+|default\s*:)/.test(line)) {
          caseBlockEnd = j - 1;
          break;
        }

        for (const char of line) {
          if (char === '{') {
            braceCount++;
            startedCounting = true;
          } else if (char === '}') {
            braceCount--;
            if (startedCounting && braceCount === 0) {
              caseBlockEnd = j;
              break;
            }
          }
        }

        if (caseBlockEnd > 0) break;
      }

      if (caseBlockEnd > i) {
        // Insert at the beginning of the case block (after the case line and opening brace)
        const insertPoint = findFirstCodeLineInCase(lines, i);
        if (insertPoint > i) {
          const indent = lines[insertPoint].match(/^(\s*)/)?.[1] || '                ';
          const indentedCode = code.split('\n').map(l => l.trim() ? indent + l.trim() : l).join('\n');
          lines.splice(insertPoint, 0, indentedCode);
          return lines.join('\n');
        }
      }
    }
  }

  return null;
}

/**
 * Find the first code line inside a case block
 */
function findFirstCodeLineInCase(lines: string[], caseLineIndex: number): number {
  // Look for the opening brace
  for (let i = caseLineIndex; i < Math.min(caseLineIndex + 5, lines.length); i++) {
    if (lines[i].includes('{')) {
      // Return the line after the brace
      return i + 1;
    }
  }
  // If no brace found, return line after case
  return caseLineIndex + 1;
}

/**
 * Insert code near a variable definition
 */
function insertNearVariable(lines: string[], varName: string, code: string): string | null {
  const varPattern = new RegExp(`(const|let|var)\\s+${varName}\\s*=`);

  for (let i = 0; i < lines.length; i++) {
    if (varPattern.test(lines[i])) {
      // Find the end of the variable assignment
      let braceCount = 0;
      let endLine = i;

      for (let j = i; j < lines.length; j++) {
        const line = lines[j];
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        if (line.includes(';') && braceCount === 0) {
          endLine = j;
          break;
        }
      }

      lines.splice(endLine + 1, 0, '', code);
      return lines.join('\n');
    }
  }

  return null;
}

/**
 * Insert code into an object that has a specific property
 */
function insertIntoObjectWithProperty(lines: string[], propName: string, code: string): string | null {
  // This is a complex operation - for now, return null and let it fail safe
  return null;
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

/**
 * Save new content as a new version
 * This allows direct content updates without going through the fix system
 *
 * @param fileKey - The file key (system_prompt, scheduling_tool, etc.)
 * @param content - The new content to save
 * @param changeDescription - Description of the change
 * @returns The new version number and any warnings
 */
export function saveNewVersion(
  fileKey: string,
  content: string,
  changeDescription: string
): { newVersion: number; content: string; warnings?: string[] } {
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

    // Validate the new content before saving
    const validation = validateContent(content, fileKey);
    if (!validation.valid) {
      throw new Error(
        `Content validation failed:\n${validation.errors.join('\n')}\n\n` +
        `The new version was NOT saved to prevent broken content.`
      );
    }

    const newVersion = current.version + 1;
    const now = new Date().toISOString();

    // Update working copy
    db.prepare(`
      UPDATE prompt_working_copies
      SET content = ?, version = ?, updated_at = ?
      WHERE file_key = ?
    `).run(content, newVersion, now, fileKey);

    // Create version history entry
    db.prepare(`
      INSERT INTO prompt_version_history (file_key, version, content, fix_id, change_description, created_at)
      VALUES (?, ?, ?, NULL, ?, ?)
    `).run(fileKey, newVersion, content, changeDescription, now);

    return {
      newVersion,
      content,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } finally {
    db.close();
  }
}

/**
 * Reset working copy from disk (discard all changes and reload from source file)
 */
export function resetFromDisk(fileKey: string): { version: number; content: string } {
  const mapping = PROMPT_FILE_MAPPINGS[fileKey];
  if (!mapping) {
    throw new Error(`Unknown file key: ${fileKey}`);
  }

  if (!fs.existsSync(mapping.path)) {
    throw new Error(`Source file not found: ${mapping.path}`);
  }

  const content = fs.readFileSync(mapping.path, 'utf-8');
  const db = getWritableDb();

  try {
    const current = db.prepare(`
      SELECT version FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    const newVersion = current ? current.version + 1 : 1;
    const now = new Date().toISOString();

    if (current) {
      // Update existing working copy
      db.prepare(`
        UPDATE prompt_working_copies
        SET content = ?, version = ?, updated_at = ?, last_fix_id = NULL
        WHERE file_key = ?
      `).run(content, newVersion, now, fileKey);
    } else {
      // Create new working copy
      db.prepare(`
        INSERT INTO prompt_working_copies (file_key, file_path, display_name, content, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(fileKey, mapping.path, mapping.displayName, content, newVersion, now);
    }

    // Create version history entry
    db.prepare(`
      INSERT INTO prompt_version_history (file_key, version, content, fix_id, change_description, created_at)
      VALUES (?, ?, ?, NULL, 'Reset from disk file', ?)
    `).run(fileKey, newVersion, content, now);

    return { version: newVersion, content };
  } finally {
    db.close();
  }
}
