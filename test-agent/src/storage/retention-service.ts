/**
 * Retention Service
 *
 * Manages database cleanup and archival of old test runs to keep the database performant.
 * Implements configurable retention policies for test data.
 */

import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface RetentionConfig {
  /** Days to keep test runs (default: 30) */
  daysToKeep: number;
  /** Whether to archive transcripts before deletion (default: true) */
  archiveTranscripts: boolean;
  /** Archive directory path (default: ./data/archives) */
  archiveDir: string;
  /** Whether to vacuum database after cleanup (default: true) */
  vacuum: boolean;
  /** Dry run - don't actually delete, just report what would be deleted */
  dryRun: boolean;
}

export interface RetentionStats {
  runsDeleted: number;
  resultsDeleted: number;
  transcriptsDeleted: number;
  findingsDeleted: number;
  apiCallsDeleted: number;
  spaceSavedBytes: number;
  archiveCreated: boolean;
  archivePath?: string;
  durationMs: number;
}

const DEFAULT_CONFIG: RetentionConfig = {
  daysToKeep: 30,
  archiveTranscripts: true,
  archiveDir: './data/archives',
  vacuum: true,
  dryRun: false,
};

export class RetentionService {
  private db: BetterSqlite3.Database;
  private config: RetentionConfig;

  constructor(db: BetterSqlite3.Database, config: Partial<RetentionConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get statistics about data that would be cleaned up
   */
  getCleanupPreview(): {
    runsToDelete: number;
    resultsToDelete: number;
    transcriptsToDelete: number;
    findingsToDelete: number;
    apiCallsToDelete: number;
    oldestRun: string | null;
    newestRunToDelete: string | null;
  } {
    const cutoffDate = this.getCutoffDate();

    const runsToDelete = this.db.prepare(`
      SELECT COUNT(*) as count FROM test_runs WHERE started_at < ?
    `).get(cutoffDate) as { count: number };

    const resultsToDelete = this.db.prepare(`
      SELECT COUNT(*) as count FROM test_results
      WHERE run_id IN (SELECT run_id FROM test_runs WHERE started_at < ?)
    `).get(cutoffDate) as { count: number };

    const transcriptsToDelete = this.db.prepare(`
      SELECT COUNT(*) as count FROM transcripts
      WHERE run_id IN (SELECT run_id FROM test_runs WHERE started_at < ?)
    `).get(cutoffDate) as { count: number };

    const findingsToDelete = this.db.prepare(`
      SELECT COUNT(*) as count FROM findings
      WHERE run_id IN (SELECT run_id FROM test_runs WHERE started_at < ?)
    `).get(cutoffDate) as { count: number };

    const apiCallsToDelete = this.db.prepare(`
      SELECT COUNT(*) as count FROM api_calls
      WHERE run_id IN (SELECT run_id FROM test_runs WHERE started_at < ?)
    `).get(cutoffDate) as { count: number };

    const oldestRun = this.db.prepare(`
      SELECT started_at FROM test_runs ORDER BY started_at ASC LIMIT 1
    `).get() as { started_at: string } | undefined;

    const newestRunToDelete = this.db.prepare(`
      SELECT started_at FROM test_runs WHERE started_at < ? ORDER BY started_at DESC LIMIT 1
    `).get(cutoffDate) as { started_at: string } | undefined;

    return {
      runsToDelete: runsToDelete.count,
      resultsToDelete: resultsToDelete.count,
      transcriptsToDelete: transcriptsToDelete.count,
      findingsToDelete: findingsToDelete.count,
      apiCallsToDelete: apiCallsToDelete.count,
      oldestRun: oldestRun?.started_at || null,
      newestRunToDelete: newestRunToDelete?.started_at || null,
    };
  }

  /**
   * Archive transcripts for old runs before deletion
   */
  private async archiveTranscripts(cutoffDate: string): Promise<string | null> {
    if (!this.config.archiveTranscripts) {
      return null;
    }

    // Ensure archive directory exists
    const archiveDir = path.resolve(this.config.archiveDir);
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    // Get all transcripts to archive
    const transcripts = this.db.prepare(`
      SELECT t.run_id, t.test_id, t.transcript_json, t.created_at, tr.started_at as run_started_at
      FROM transcripts t
      JOIN test_runs tr ON t.run_id = tr.run_id
      WHERE tr.started_at < ?
      ORDER BY tr.started_at ASC
    `).all(cutoffDate) as Array<{
      run_id: string;
      test_id: string;
      transcript_json: string;
      created_at: string;
      run_started_at: string;
    }>;

    if (transcripts.length === 0) {
      return null;
    }

    // Create archive file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(archiveDir, `transcripts-archive-${timestamp}.json`);

    const archiveData = {
      archivedAt: new Date().toISOString(),
      cutoffDate,
      transcriptCount: transcripts.length,
      transcripts: transcripts.map(t => ({
        runId: t.run_id,
        testId: t.test_id,
        runStartedAt: t.run_started_at,
        createdAt: t.created_at,
        transcript: JSON.parse(t.transcript_json),
      })),
    };

    fs.writeFileSync(archivePath, JSON.stringify(archiveData, null, 2));
    console.log(`[Retention] Archived ${transcripts.length} transcripts to ${archivePath}`);

    return archivePath;
  }

  /**
   * Get the cutoff date for retention
   */
  private getCutoffDate(): string {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.daysToKeep);
    return cutoff.toISOString();
  }

  /**
   * Execute the retention cleanup
   */
  async cleanup(): Promise<RetentionStats> {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate();

    console.log(`[Retention] Starting cleanup with cutoff date: ${cutoffDate}`);
    console.log(`[Retention] Keeping last ${this.config.daysToKeep} days of data`);

    // Get counts before deletion for reporting
    const preview = this.getCleanupPreview();

    if (preview.runsToDelete === 0) {
      console.log('[Retention] No data to clean up');
      return {
        runsDeleted: 0,
        resultsDeleted: 0,
        transcriptsDeleted: 0,
        findingsDeleted: 0,
        apiCallsDeleted: 0,
        spaceSavedBytes: 0,
        archiveCreated: false,
        durationMs: Date.now() - startTime,
      };
    }

    if (this.config.dryRun) {
      console.log('[Retention] DRY RUN - No data will be deleted');
      console.log(`[Retention] Would delete: ${preview.runsToDelete} runs, ${preview.resultsToDelete} results, ${preview.transcriptsToDelete} transcripts`);
      return {
        runsDeleted: preview.runsToDelete,
        resultsDeleted: preview.resultsToDelete,
        transcriptsDeleted: preview.transcriptsToDelete,
        findingsDeleted: preview.findingsToDelete,
        apiCallsDeleted: preview.apiCallsToDelete,
        spaceSavedBytes: 0,
        archiveCreated: false,
        durationMs: Date.now() - startTime,
      };
    }

    // Get database size before cleanup
    const dbPath = this.db.name;
    const sizeBefore = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    // Archive transcripts if configured
    let archivePath: string | null = null;
    if (this.config.archiveTranscripts) {
      archivePath = await this.archiveTranscripts(cutoffDate);
    }

    // Delete in correct order (foreign key dependencies)
    // Use a transaction for atomicity
    const deleteTransaction = this.db.transaction(() => {
      // Get run IDs to delete
      const runIds = this.db.prepare(`
        SELECT run_id FROM test_runs WHERE started_at < ?
      `).all(cutoffDate) as Array<{ run_id: string }>;

      const runIdList = runIds.map(r => r.run_id);

      if (runIdList.length === 0) {
        return { runsDeleted: 0, resultsDeleted: 0, transcriptsDeleted: 0, findingsDeleted: 0, apiCallsDeleted: 0 };
      }

      // Build placeholders for IN clause
      const placeholders = runIdList.map(() => '?').join(',');

      // Delete API calls
      const apiCallsResult = this.db.prepare(`
        DELETE FROM api_calls WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete transcripts
      const transcriptsResult = this.db.prepare(`
        DELETE FROM transcripts WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete findings
      const findingsResult = this.db.prepare(`
        DELETE FROM findings WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete generated fixes
      this.db.prepare(`
        DELETE FROM generated_fixes WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete fix outcomes for deleted fixes
      this.db.prepare(`
        DELETE FROM fix_outcomes WHERE fix_id NOT IN (SELECT fix_id FROM generated_fixes)
      `).run();

      // Delete test results
      const resultsResult = this.db.prepare(`
        DELETE FROM test_results WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete goal test results
      this.db.prepare(`
        DELETE FROM goal_test_results WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete goal progress snapshots
      this.db.prepare(`
        DELETE FROM goal_progress_snapshots WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete parallel execution metrics
      this.db.prepare(`
        DELETE FROM parallel_execution_metrics WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      // Delete test runs
      const runsResult = this.db.prepare(`
        DELETE FROM test_runs WHERE run_id IN (${placeholders})
      `).run(...runIdList);

      return {
        runsDeleted: runsResult.changes,
        resultsDeleted: resultsResult.changes,
        transcriptsDeleted: transcriptsResult.changes,
        findingsDeleted: findingsResult.changes,
        apiCallsDeleted: apiCallsResult.changes,
      };
    });

    const deleteResults = deleteTransaction();

    console.log(`[Retention] Deleted ${deleteResults.runsDeleted} runs, ${deleteResults.resultsDeleted} results, ${deleteResults.transcriptsDeleted} transcripts`);

    // Vacuum database if configured
    if (this.config.vacuum) {
      console.log('[Retention] Running VACUUM to reclaim space...');
      this.db.exec('VACUUM');
    }

    // Calculate space saved
    const sizeAfter = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const spaceSaved = sizeBefore - sizeAfter;

    console.log(`[Retention] Space saved: ${(spaceSaved / 1024 / 1024).toFixed(2)} MB`);

    return {
      ...deleteResults,
      spaceSavedBytes: spaceSaved,
      archiveCreated: archivePath !== null,
      archivePath: archivePath || undefined,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get current database statistics
   */
  getDatabaseStats(): {
    totalRuns: number;
    totalResults: number;
    totalTranscripts: number;
    oldestRun: string | null;
    newestRun: string | null;
    dbSizeBytes: number;
  } {
    const totalRuns = this.db.prepare('SELECT COUNT(*) as count FROM test_runs').get() as { count: number };
    const totalResults = this.db.prepare('SELECT COUNT(*) as count FROM test_results').get() as { count: number };
    const totalTranscripts = this.db.prepare('SELECT COUNT(*) as count FROM transcripts').get() as { count: number };

    const oldestRun = this.db.prepare(`
      SELECT started_at FROM test_runs ORDER BY started_at ASC LIMIT 1
    `).get() as { started_at: string } | undefined;

    const newestRun = this.db.prepare(`
      SELECT started_at FROM test_runs ORDER BY started_at DESC LIMIT 1
    `).get() as { started_at: string } | undefined;

    const dbPath = this.db.name;
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    return {
      totalRuns: totalRuns.count,
      totalResults: totalResults.count,
      totalTranscripts: totalTranscripts.count,
      oldestRun: oldestRun?.started_at || null,
      newestRun: newestRun?.started_at || null,
      dbSizeBytes: dbSize,
    };
  }
}
