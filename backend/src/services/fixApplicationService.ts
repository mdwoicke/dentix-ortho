/**
 * Fix Application Service
 *
 * Provides preview, conflict detection, and batch application of fixes.
 * Enables safe fix workflows with dry-run capability.
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import * as Diff from 'diff';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

export interface GeneratedFix {
  fixId: string;
  runId: string;
  type: 'prompt' | 'tool';
  targetFile: string;
  changeDescription: string;
  changeCode: string;
  location?: {
    section?: string;
    afterLine?: number;
    beforeLine?: number;
    replaceSection?: string;
  };
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  affectedTests: string[];
  status: 'pending' | 'applied' | 'rejected' | 'verified';
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface FixConflict {
  fix1Id: string;
  fix2Id: string;
  conflictType: 'overlapping_lines' | 'same_section' | 'semantic_conflict';
  description: string;
  resolution: 'apply_fix1_first' | 'apply_fix2_first' | 'merge' | 'manual';
}

export interface FixPreview {
  fixId: string;
  targetFile: string;
  currentContent: string;
  proposedContent: string;
  diffHunks: DiffHunk[];
  diffStats: {
    additions: number;
    deletions: number;
    changes: number;
  };
  validationResult: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  conflictingFixes: FixConflict[];
  impactedTests: string[];
  estimatedRiskLevel: 'low' | 'medium' | 'high';
}

export interface BatchApplicationResult {
  success: boolean;
  appliedFixes: string[];
  failedFixes: { fixId: string; error: string }[];
  conflicts: FixConflict[];
  newVersions: { fileKey: string; version: number }[];
}

/**
 * Get database connection
 */
function getDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_AGENT_DB_PATH);
}

/**
 * Get a fix by ID
 */
export function getFixById(fixId: string): GeneratedFix | null {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, status
      FROM generated_fixes
      WHERE fix_id = ?
    `).get(fixId) as any;

    if (!row) return null;

    return {
      fixId: row.fix_id,
      runId: row.run_id,
      type: row.type,
      targetFile: row.target_file,
      changeDescription: row.change_description,
      changeCode: row.change_code,
      location: row.location_json ? JSON.parse(row.location_json) : undefined,
      priority: row.priority,
      confidence: row.confidence,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      status: row.status,
    };
  } finally {
    db.close();
  }
}

/**
 * Get current content for a file key
 */
export function getCurrentContent(fileKey: string): string | null {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT content FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    return row?.content || null;
  } finally {
    db.close();
  }
}

/**
 * Simulate applying a fix without actually saving it
 */
export function simulateFixApplication(content: string, fix: GeneratedFix): string {
  const { changeCode, location } = fix;
  const lines = content.split('\n');

  // Strategy 1: Use explicit location if provided
  if (location) {
    // Handle section-based insertion
    if (location.section) {
      const sectionPattern = new RegExp(`(#+\\s*${location.section}|<${location.section}>)`, 'i');
      const sectionIndex = lines.findIndex(line => sectionPattern.test(line));

      if (sectionIndex >= 0) {
        // Find end of section (next header or end of file)
        let endIndex = lines.length;
        for (let i = sectionIndex + 1; i < lines.length; i++) {
          if (/^#+\s/.test(lines[i]) || /^<\/?\w+>/.test(lines[i])) {
            endIndex = i;
            break;
          }
        }

        // Insert before end of section
        lines.splice(endIndex, 0, '', changeCode);
        return lines.join('\n');
      }
    }

    // Handle line-based insertion
    if (location.afterLine !== undefined) {
      const insertIndex = Math.min(location.afterLine, lines.length);
      lines.splice(insertIndex, 0, changeCode);
      return lines.join('\n');
    }

    if (location.beforeLine !== undefined) {
      const insertIndex = Math.max(0, location.beforeLine - 1);
      lines.splice(insertIndex, 0, changeCode);
      return lines.join('\n');
    }

    // Handle section replacement
    if (location.replaceSection) {
      const startPattern = new RegExp(`(#+\\s*${location.replaceSection}|<${location.replaceSection}>)`, 'i');
      const startIndex = lines.findIndex(line => startPattern.test(line));

      if (startIndex >= 0) {
        let endIndex = lines.length;
        for (let i = startIndex + 1; i < lines.length; i++) {
          if (/^#+\s/.test(lines[i]) || /^<\/?\w+>/.test(lines[i])) {
            endIndex = i;
            break;
          }
        }

        // Replace section content
        lines.splice(startIndex, endIndex - startIndex, changeCode);
        return lines.join('\n');
      }
    }
  }

  // Strategy 2: Intelligent placement based on content analysis
  // Look for related content and insert nearby

  // For tool files (JSON), try to merge into the func field
  if (fix.type === 'tool' && fix.targetFile.includes('Tool')) {
    const funcMatch = content.match(/"func"\s*:\s*"([^"]*(?:\\"[^"]*)*)"/)
    if (funcMatch) {
      // This is a tool file - the changeCode should be JS to add to func
      // For now, append to the end of the func content
      const newContent = content.replace(
        funcMatch[0],
        funcMatch[0].replace(funcMatch[1], funcMatch[1] + '\\n' + changeCode.replace(/"/g, '\\"'))
      );
      return newContent;
    }
  }

  // Strategy 3: Append to end with clear separator
  return content + '\n\n' + '// --- Fix Applied ---\n' + changeCode;
}

/**
 * Generate a unified diff between two strings
 */
export function generateDiff(oldContent: string, newContent: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];

  // Use diff library for structured diff
  const changes = Diff.structuredPatch('original', 'modified', oldContent, newContent, '', '', {
    context: 3,
  });

  for (const hunk of changes.hunks) {
    hunks.push({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: hunk.lines,
    });
  }

  return hunks;
}

/**
 * Calculate diff statistics
 */
function calculateDiffStats(hunks: DiffHunk[]): { additions: number; deletions: number; changes: number } {
  let additions = 0;
  let deletions = 0;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }
  }

  return {
    additions,
    deletions,
    changes: additions + deletions,
  };
}

/**
 * Validate proposed content
 */
function validateProposedContent(content: string, fileKey: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic validation
  if (!content || content.trim().length === 0) {
    errors.push('Content is empty');
    return { valid: false, errors, warnings };
  }

  // Check for unbalanced braces
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Unbalanced braces: ${openBraces} opening, ${closeBraces} closing`);
  }

  // Check for common issues in tool files
  if (fileKey.includes('tool')) {
    // Check for valid JSON structure
    try {
      JSON.parse(content);
    } catch (e) {
      // Not valid JSON - might be just the func content
      // Check for syntax errors in JavaScript
      if (content.includes('function') || content.includes('=>')) {
        // Basic JS syntax check
        const parenBalance = (content.match(/\(/g) || []).length - (content.match(/\)/g) || []).length;
        if (parenBalance !== 0) {
          errors.push('Unbalanced parentheses in JavaScript code');
        }
      }
    }
  }

  // Warnings
  if (content.length > 50000) {
    warnings.push('Content is very large (>50KB), may cause performance issues');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect conflicts between fixes
 */
export function detectConflicts(fixes: GeneratedFix[]): FixConflict[] {
  const conflicts: FixConflict[] = [];

  // Group fixes by target file
  const byFile: Record<string, GeneratedFix[]> = {};
  for (const fix of fixes) {
    const key = fix.targetFile;
    if (!byFile[key]) byFile[key] = [];
    byFile[key].push(fix);
  }

  // Check for conflicts within each file
  for (const [_file, fileFixes] of Object.entries(byFile)) {
    if (fileFixes.length <= 1) continue;

    for (let i = 0; i < fileFixes.length; i++) {
      for (let j = i + 1; j < fileFixes.length; j++) {
        const fix1 = fileFixes[i];
        const fix2 = fileFixes[j];

        // Check for same section modifications
        if (fix1.location?.section && fix2.location?.section &&
            fix1.location.section === fix2.location.section) {
          conflicts.push({
            fix1Id: fix1.fixId,
            fix2Id: fix2.fixId,
            conflictType: 'same_section',
            description: `Both fixes modify the "${fix1.location.section}" section`,
            resolution: fix1.priority === 'critical' ? 'apply_fix1_first' :
                        fix2.priority === 'critical' ? 'apply_fix2_first' : 'manual',
          });
        }

        // Check for overlapping line ranges
        if (fix1.location?.afterLine !== undefined && fix2.location?.afterLine !== undefined) {
          const diff = Math.abs(fix1.location.afterLine - fix2.location.afterLine);
          if (diff < 5) {
            conflicts.push({
              fix1Id: fix1.fixId,
              fix2Id: fix2.fixId,
              conflictType: 'overlapping_lines',
              description: `Fixes target nearby lines (${fix1.location.afterLine} and ${fix2.location.afterLine})`,
              resolution: 'manual',
            });
          }
        }

        // Check for semantic conflicts (same change description keywords)
        const keywords1 = fix1.changeDescription.toLowerCase().split(/\s+/);
        const keywords2 = fix2.changeDescription.toLowerCase().split(/\s+/);
        const overlap = keywords1.filter(k => keywords2.includes(k) && k.length > 4);
        if (overlap.length > 2) {
          conflicts.push({
            fix1Id: fix1.fixId,
            fix2Id: fix2.fixId,
            conflictType: 'semantic_conflict',
            description: `Fixes may address similar issues: "${overlap.join(', ')}"`,
            resolution: 'manual',
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Estimate risk level for a fix
 */
function estimateRiskLevel(fix: GeneratedFix, diffStats: { changes: number }, validationResult: { valid: boolean; errors: string[] }): 'low' | 'medium' | 'high' {
  // High risk conditions
  if (!validationResult.valid) return 'high';
  if (fix.confidence < 0.5) return 'high';
  if (diffStats.changes > 50) return 'high';

  // Medium risk conditions
  if (fix.confidence < 0.7) return 'medium';
  if (diffStats.changes > 20) return 'medium';
  if (fix.priority === 'critical') return 'medium'; // Critical fixes may have wide impact

  return 'low';
}

/**
 * Map target file to file key
 */
function targetFileToFileKey(targetFile: string): string {
  if (targetFile.includes('SystemPrompt') || targetFile.includes('system_prompt')) {
    return 'system_prompt';
  }
  if (targetFile.includes('schedule') || targetFile.includes('scheduling')) {
    return 'scheduling_tool';
  }
  if (targetFile.includes('patient')) {
    return 'patient_tool';
  }
  if (targetFile.includes('nodered') || targetFile.includes('flow')) {
    return 'nodered_flow';
  }
  return targetFile;
}

/**
 * Generate preview for a fix without applying it
 */
export function previewFix(fixId: string): FixPreview {
  const fix = getFixById(fixId);
  if (!fix) {
    throw new Error(`Fix not found: ${fixId}`);
  }

  const fileKey = targetFileToFileKey(fix.targetFile);
  const currentContent = getCurrentContent(fileKey);

  if (!currentContent) {
    throw new Error(`Could not load current content for: ${fileKey}`);
  }

  // Simulate the fix application
  const proposedContent = simulateFixApplication(currentContent, fix);

  // Generate diff
  const diffHunks = generateDiff(currentContent, proposedContent);
  const diffStats = calculateDiffStats(diffHunks);

  // Validate proposed content
  const validationResult = validateProposedContent(proposedContent, fileKey);

  // Find conflicting fixes
  const db = getDb();
  let conflictingFixes: FixConflict[] = [];
  try {
    const pendingFixes = db.prepare(`
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, status
      FROM generated_fixes
      WHERE status = 'pending' AND fix_id != ?
    `).all(fixId) as any[];

    const allFixes: GeneratedFix[] = [fix, ...pendingFixes.map(row => ({
      fixId: row.fix_id,
      runId: row.run_id,
      type: row.type,
      targetFile: row.target_file,
      changeDescription: row.change_description,
      changeCode: row.change_code,
      location: row.location_json ? JSON.parse(row.location_json) : undefined,
      priority: row.priority,
      confidence: row.confidence,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      status: row.status,
    }))];

    conflictingFixes = detectConflicts(allFixes).filter(
      c => c.fix1Id === fixId || c.fix2Id === fixId
    );
  } finally {
    db.close();
  }

  // Estimate risk level
  const estimatedRiskLevel = estimateRiskLevel(fix, diffStats, validationResult);

  return {
    fixId,
    targetFile: fix.targetFile,
    currentContent,
    proposedContent,
    diffHunks,
    diffStats,
    validationResult,
    conflictingFixes,
    impactedTests: fix.affectedTests,
    estimatedRiskLevel,
  };
}

/**
 * Get all pending fixes with conflict analysis
 */
export function getPendingFixesWithConflicts(runId?: string): { fixes: GeneratedFix[]; conflicts: FixConflict[] } {
  const db = getDb();
  try {
    let query = `
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, status
      FROM generated_fixes
      WHERE status = 'pending'
    `;
    const params: any[] = [];

    if (runId) {
      query += ' AND run_id = ?';
      params.push(runId);
    }

    const rows = db.prepare(query).all(...params) as any[];

    const fixes: GeneratedFix[] = rows.map(row => ({
      fixId: row.fix_id,
      runId: row.run_id,
      type: row.type,
      targetFile: row.target_file,
      changeDescription: row.change_description,
      changeCode: row.change_code,
      location: row.location_json ? JSON.parse(row.location_json) : undefined,
      priority: row.priority,
      confidence: row.confidence,
      affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
      status: row.status,
    }));

    const conflicts = detectConflicts(fixes);

    return { fixes, conflicts };
  } finally {
    db.close();
  }
}
