/**
 * Fix Verification Pipeline
 *
 * Automates the fix → test → verify → rollback workflow:
 * 1. Apply fix to working copy
 * 2. Run only affected tests
 * 3. Compare results (before vs after)
 * 4. Auto-rollback if verification fails (optional)
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

// Database path
const DB_PATH = path.resolve(__dirname, '../../data/test-results.db');

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

export interface VerificationResult {
  fixId: string;
  success: boolean;
  summary: {
    previouslyFailed: number;
    nowPassing: number;
    stillFailing: number;
    newFailures: number;
    totalAffectedTests: number;
  };
  testResults: TestVerificationResult[];
  verificationRunId: string | null;
  appliedAt: string;
  verifiedAt: string;
  rollbackPerformed: boolean;
  rollbackReason?: string;
}

export interface TestVerificationResult {
  testId: string;
  testName?: string;
  beforeStatus: 'passed' | 'failed' | 'not_run';
  afterStatus: 'passed' | 'failed' | 'error' | 'not_run';
  improvement: boolean;
  regression: boolean;
  errorMessage?: string;
}

export interface VerificationOptions {
  autoRollbackOnFailure?: boolean;
  autoRollbackThreshold?: number; // Rollback if new failures exceed this count
  timeoutMs?: number;
  dryRun?: boolean; // Just simulate, don't actually run tests
}

/**
 * Get database connection
 */
function getDb(): BetterSqlite3.Database {
  return new BetterSqlite3(DB_PATH);
}

/**
 * Get a fix by ID
 */
function getFixById(fixId: string): GeneratedFix | null {
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
 * Get previous test results for comparison
 */
function getPreviousTestResults(testIds: string[], runId: string): Map<string, 'passed' | 'failed' | 'not_run'> {
  const results = new Map<string, 'passed' | 'failed' | 'not_run'>();
  const db = getDb();

  try {
    if (testIds.length === 0) return results;

    const placeholders = testIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT test_id, status
      FROM test_results
      WHERE run_id = ? AND test_id IN (${placeholders})
    `).all(runId, ...testIds) as any[];

    for (const testId of testIds) {
      const row = rows.find(r => r.test_id === testId);
      if (!row) {
        results.set(testId, 'not_run');
      } else {
        results.set(testId, row.status === 'passed' ? 'passed' : 'failed');
      }
    }

    return results;
  } finally {
    db.close();
  }
}

/**
 * Apply a fix to the working copy
 */
async function applyFix(fix: GeneratedFix): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    // Map target file to file key
    let fileKey: string;
    if (fix.targetFile.includes('SystemPrompt') || fix.targetFile.includes('system_prompt')) {
      fileKey = 'system_prompt';
    } else if (fix.targetFile.includes('schedule') || fix.targetFile.includes('scheduling')) {
      fileKey = 'scheduling_tool';
    } else if (fix.targetFile.includes('patient')) {
      fileKey = 'patient_tool';
    } else if (fix.targetFile.includes('nodered') || fix.targetFile.includes('flow')) {
      fileKey = 'nodered_flow';
    } else {
      fileKey = fix.targetFile;
    }

    // Get current content
    const row = db.prepare(`
      SELECT content, version FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    if (!row) {
      return { success: false, error: `Working copy not found for: ${fileKey}` };
    }

    const currentContent = row.content;
    const currentVersion = row.version || 1;

    // Apply the fix (simple append for now - more sophisticated logic in fixApplicationService)
    let newContent = currentContent;
    const { changeCode, location } = fix;
    const lines = currentContent.split('\n');

    if (location?.section) {
      const sectionPattern = new RegExp(`(#+\\s*${location.section}|<${location.section}>)`, 'i');
      const sectionIndex = lines.findIndex((line: string) => sectionPattern.test(line));

      if (sectionIndex >= 0) {
        let endIndex = lines.length;
        for (let i = sectionIndex + 1; i < lines.length; i++) {
          if (/^#+\s/.test(lines[i]) || /^<\/?\w+>/.test(lines[i])) {
            endIndex = i;
            break;
          }
        }
        lines.splice(endIndex, 0, '', changeCode);
        newContent = lines.join('\n');
      }
    } else if (location?.afterLine !== undefined) {
      const insertIndex = Math.min(location.afterLine, lines.length);
      lines.splice(insertIndex, 0, changeCode);
      newContent = lines.join('\n');
    } else {
      // Append to end
      newContent = currentContent + '\n\n' + '// --- Fix Applied ---\n' + changeCode;
    }

    // Save version history
    db.prepare(`
      INSERT INTO prompt_version_history (file_key, version, content, change_description, source, created_at)
      VALUES (?, ?, ?, ?, 'fix_verification', datetime('now'))
    `).run(fileKey, currentVersion + 1, newContent, `Applied fix: ${fix.changeDescription}`);

    // Update working copy
    db.prepare(`
      UPDATE prompt_working_copies
      SET content = ?, version = ?, updated_at = datetime('now')
      WHERE file_key = ?
    `).run(newContent, currentVersion + 1, fileKey);

    // Update fix status
    db.prepare(`
      UPDATE generated_fixes SET status = 'applied', applied_at = datetime('now') WHERE fix_id = ?
    `).run(fix.fixId);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  } finally {
    db.close();
  }
}

/**
 * Rollback a fix
 */
async function rollbackFix(fixId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    // Get the fix
    const fix = getFixById(fixId);
    if (!fix) {
      return { success: false, error: 'Fix not found' };
    }

    // Map target file to file key
    let fileKey: string;
    if (fix.targetFile.includes('SystemPrompt') || fix.targetFile.includes('system_prompt')) {
      fileKey = 'system_prompt';
    } else if (fix.targetFile.includes('schedule') || fix.targetFile.includes('scheduling')) {
      fileKey = 'scheduling_tool';
    } else if (fix.targetFile.includes('patient')) {
      fileKey = 'patient_tool';
    } else if (fix.targetFile.includes('nodered') || fix.targetFile.includes('flow')) {
      fileKey = 'nodered_flow';
    } else {
      fileKey = fix.targetFile;
    }

    // Get current version
    const currentRow = db.prepare(`
      SELECT version FROM prompt_working_copies WHERE file_key = ?
    `).get(fileKey) as any;

    if (!currentRow || currentRow.version <= 1) {
      return { success: false, error: 'No previous version to rollback to' };
    }

    // Get previous version content
    const previousVersion = currentRow.version - 1;
    const historyRow = db.prepare(`
      SELECT content FROM prompt_version_history
      WHERE file_key = ? AND version = ?
    `).get(fileKey, previousVersion) as any;

    if (!historyRow) {
      return { success: false, error: `Previous version ${previousVersion} not found in history` };
    }

    // Record rollback
    db.prepare(`
      INSERT OR REPLACE INTO fix_rollback_points (fix_id, file_key, version_before, version_after, reason, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(fixId, fileKey, currentRow.version, previousVersion, reason);

    // Restore previous content
    db.prepare(`
      UPDATE prompt_working_copies
      SET content = ?, version = ?, updated_at = datetime('now')
      WHERE file_key = ?
    `).run(historyRow.content, previousVersion, fileKey);

    // Update fix status
    db.prepare(`
      UPDATE generated_fixes SET status = 'rejected' WHERE fix_id = ?
    `).run(fixId);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  } finally {
    db.close();
  }
}

/**
 * Run specific tests using the test agent
 */
async function runTests(testIds: string[], timeoutMs: number = 300000): Promise<{
  success: boolean;
  runId: string | null;
  results: Map<string, 'passed' | 'failed' | 'error'>;
  error?: string;
}> {
  return new Promise((resolve) => {
    const results = new Map<string, 'passed' | 'failed' | 'error'>();
    let runId: string | null = null;

    // Build the test command
    const testAgentPath = path.resolve(__dirname, '../../');
    const args = ['run', 'start', '--', 'run', '--tests', testIds.join(',')];

    let stdout = '';
    let stderr = '';

    const child: ChildProcess = spawn('npm', args, {
      cwd: testAgentPath,
      shell: true,
      env: { ...process.env, NODE_ENV: 'test' },
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        runId: null,
        results,
        error: `Test execution timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      // Parse run ID
      const runIdMatch = text.match(/Run ID: ([a-zA-Z0-9_-]+)/);
      if (runIdMatch) {
        runId = runIdMatch[1];
      }

      // Parse test results
      const passMatch = text.match(/✓ ([A-Z0-9_-]+)/g);
      const failMatch = text.match(/✗ ([A-Z0-9_-]+)/g);

      if (passMatch) {
        for (const match of passMatch) {
          const testId = match.replace('✓ ', '').trim();
          results.set(testId, 'passed');
        }
      }

      if (failMatch) {
        for (const match of failMatch) {
          const testId = match.replace('✗ ', '').trim();
          results.set(testId, 'failed');
        }
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0 && results.size === 0) {
        resolve({
          success: false,
          runId,
          results,
          error: stderr || `Test agent exited with code ${code}`,
        });
      } else {
        // Mark any unprocessed tests as error
        for (const testId of testIds) {
          if (!results.has(testId)) {
            results.set(testId, 'error');
          }
        }

        resolve({
          success: true,
          runId,
          results,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        runId: null,
        results,
        error: err.message,
      });
    });
  });
}

/**
 * Verify a fix by running affected tests
 */
export async function verifyFix(
  fixId: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const {
    autoRollbackOnFailure = false,
    autoRollbackThreshold = 0,
    timeoutMs = 300000,
    dryRun = false,
  } = options;

  const appliedAt = new Date().toISOString();

  // Get the fix
  const fix = getFixById(fixId);
  if (!fix) {
    return {
      fixId,
      success: false,
      summary: {
        previouslyFailed: 0,
        nowPassing: 0,
        stillFailing: 0,
        newFailures: 0,
        totalAffectedTests: 0,
      },
      testResults: [],
      verificationRunId: null,
      appliedAt,
      verifiedAt: appliedAt,
      rollbackPerformed: false,
      rollbackReason: 'Fix not found',
    };
  }

  const affectedTests = fix.affectedTests;
  if (affectedTests.length === 0) {
    return {
      fixId,
      success: true,
      summary: {
        previouslyFailed: 0,
        nowPassing: 0,
        stillFailing: 0,
        newFailures: 0,
        totalAffectedTests: 0,
      },
      testResults: [],
      verificationRunId: null,
      appliedAt,
      verifiedAt: new Date().toISOString(),
      rollbackPerformed: false,
    };
  }

  // Get previous test results
  const previousResults = getPreviousTestResults(affectedTests, fix.runId);

  // Apply the fix (unless dry run)
  if (!dryRun) {
    const applyResult = await applyFix(fix);
    if (!applyResult.success) {
      return {
        fixId,
        success: false,
        summary: {
          previouslyFailed: 0,
          nowPassing: 0,
          stillFailing: 0,
          newFailures: 0,
          totalAffectedTests: affectedTests.length,
        },
        testResults: [],
        verificationRunId: null,
        appliedAt,
        verifiedAt: new Date().toISOString(),
        rollbackPerformed: false,
        rollbackReason: `Failed to apply fix: ${applyResult.error}`,
      };
    }
  }

  // Run the tests
  const testResult = await runTests(affectedTests, timeoutMs);
  const verifiedAt = new Date().toISOString();

  // Build verification results
  const testResults: TestVerificationResult[] = [];
  let nowPassing = 0;
  let stillFailing = 0;
  let newFailures = 0;
  let previouslyFailed = 0;

  for (const testId of affectedTests) {
    const before = previousResults.get(testId) || 'not_run';
    const after = testResult.results.get(testId) || 'not_run';

    if (before === 'failed') previouslyFailed++;

    const improvement = before === 'failed' && after === 'passed';
    const regression = before === 'passed' && after === 'failed';

    if (improvement) nowPassing++;
    if (before === 'failed' && after === 'failed') stillFailing++;
    if (regression) newFailures++;

    testResults.push({
      testId,
      beforeStatus: before,
      afterStatus: after,
      improvement,
      regression,
    });
  }

  // Determine if we need to rollback
  let rollbackPerformed = false;
  let rollbackReason: string | undefined;

  if (autoRollbackOnFailure && (newFailures > autoRollbackThreshold || stillFailing === affectedTests.length)) {
    rollbackReason = newFailures > autoRollbackThreshold
      ? `New failures (${newFailures}) exceeded threshold (${autoRollbackThreshold})`
      : 'All tests still failing after fix';

    if (!dryRun) {
      const rollbackResult = await rollbackFix(fixId, rollbackReason);
      rollbackPerformed = rollbackResult.success;
    } else {
      rollbackPerformed = true; // Simulate rollback in dry run
    }
  }

  // Update fix status based on results
  if (!dryRun && !rollbackPerformed) {
    const db = getDb();
    try {
      if (nowPassing > 0 && stillFailing === 0 && newFailures === 0) {
        db.prepare(`UPDATE generated_fixes SET status = 'verified' WHERE fix_id = ?`).run(fixId);
      }
    } finally {
      db.close();
    }
  }

  return {
    fixId,
    success: nowPassing > 0 && newFailures === 0,
    summary: {
      previouslyFailed,
      nowPassing,
      stillFailing,
      newFailures,
      totalAffectedTests: affectedTests.length,
    },
    testResults,
    verificationRunId: testResult.runId,
    appliedAt,
    verifiedAt,
    rollbackPerformed,
    rollbackReason,
  };
}

/**
 * Get verification status for a fix
 */
export function getVerificationStatus(fixId: string): {
  hasBeenVerified: boolean;
  lastVerificationRun?: string;
  status?: 'pending' | 'verified' | 'failed' | 'rolled_back';
} {
  const db = getDb();

  try {
    const fix = getFixById(fixId);
    if (!fix) {
      return { hasBeenVerified: false };
    }

    // Check for rollback
    const rollback = db.prepare(`
      SELECT * FROM fix_rollback_points WHERE fix_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(fixId) as any;

    if (rollback) {
      return {
        hasBeenVerified: true,
        lastVerificationRun: rollback.created_at,
        status: 'rolled_back',
      };
    }

    if (fix.status === 'verified') {
      return {
        hasBeenVerified: true,
        status: 'verified',
      };
    }

    if (fix.status === 'applied') {
      return {
        hasBeenVerified: false,
        status: 'pending',
      };
    }

    return { hasBeenVerified: false };
  } finally {
    db.close();
  }
}

/**
 * Batch verify multiple fixes
 */
export async function verifyMultipleFixes(
  fixIds: string[],
  options: VerificationOptions = {}
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const fixId of fixIds) {
    const result = await verifyFix(fixId, options);
    results.push(result);

    // If a fix causes regressions and auto-rollback is enabled, stop processing
    if (result.rollbackPerformed && options.autoRollbackOnFailure) {
      break;
    }
  }

  return results;
}
