/**
 * Sandbox Service
 *
 * Manages A/B testing sandboxes with persistent file copies and endpoint configuration.
 * Each sandbox maintains its own version of the 3 Flowise files:
 * - System Prompt (markdown)
 * - Patient Tool (JSON/JS)
 * - Scheduling Tool (JSON/JS)
 */

import { Database, ABSandbox, ABSandboxFile, ABSandboxFileHistory } from '../../storage/database';
import * as promptService from '../../../../backend/src/services/promptService';

// File key mappings
const SANDBOX_FILE_KEYS = ['system_prompt', 'patient_tool', 'scheduling_tool'] as const;
type SandboxFileKey = typeof SANDBOX_FILE_KEYS[number];

const FILE_KEY_CONFIG: Record<SandboxFileKey, { displayName: string; fileType: 'markdown' | 'json' }> = {
  system_prompt: { displayName: 'System Prompt', fileType: 'markdown' },
  patient_tool: { displayName: 'Patient Tool', fileType: 'json' },
  scheduling_tool: { displayName: 'Scheduling Tool', fileType: 'json' },
};

export class SandboxService {
  constructor(private db: Database) {}

  /**
   * Initialize default sandboxes (A and B) if they don't exist
   */
  initializeSandboxes(): void {
    this.db.initializeSandboxes();
  }

  // ============================================================================
  // SANDBOX MANAGEMENT
  // ============================================================================

  /**
   * Get a sandbox by ID
   */
  getSandbox(sandboxId: string): ABSandbox | null {
    return this.db.getSandbox(sandboxId);
  }

  /**
   * Get all sandboxes
   */
  getAllSandboxes(): ABSandbox[] {
    return this.db.getAllSandboxes();
  }

  /**
   * Update sandbox configuration
   */
  updateSandbox(sandboxId: string, updates: Partial<ABSandbox>): void {
    this.db.updateSandbox(sandboxId, updates);
  }

  /**
   * Get sandbox with all its files
   */
  getSandboxWithFiles(sandboxId: string): {
    sandbox: ABSandbox;
    files: ABSandboxFile[];
  } | null {
    const sandbox = this.db.getSandbox(sandboxId);
    if (!sandbox) return null;

    const files = this.db.getSandboxFiles(sandboxId);
    return { sandbox, files };
  }

  // ============================================================================
  // FILE MANAGEMENT
  // ============================================================================

  /**
   * Get all files for a sandbox
   */
  getSandboxFiles(sandboxId: string): ABSandboxFile[] {
    return this.db.getSandboxFiles(sandboxId);
  }

  /**
   * Get a specific file from a sandbox
   */
  getSandboxFile(sandboxId: string, fileKey: string): ABSandboxFile | null {
    return this.db.getSandboxFile(sandboxId, fileKey);
  }

  /**
   * Get file content from a sandbox
   */
  getSandboxFileContent(sandboxId: string, fileKey: string): { content: string; version: number } | null {
    const file = this.db.getSandboxFile(sandboxId, fileKey);
    if (!file) return null;
    return { content: file.content, version: file.version };
  }

  /**
   * Save/update a sandbox file (creates new version)
   */
  saveSandboxFile(
    sandboxId: string,
    fileKey: string,
    content: string,
    changeDescription: string
  ): { newVersion: number } {
    const config = FILE_KEY_CONFIG[fileKey as SandboxFileKey];
    if (!config) {
      throw new Error(`Unknown file key: ${fileKey}`);
    }

    // Get existing file or use defaults
    const existing = this.db.getSandboxFile(sandboxId, fileKey);

    const newVersion = this.db.saveSandboxFile({
      sandboxId,
      fileKey,
      fileType: config.fileType,
      displayName: config.displayName,
      content,
      version: existing ? existing.version + 1 : 1,
      baseVersion: existing?.baseVersion,
      changeDescription,
    });

    return { newVersion };
  }

  /**
   * Copy a file from production to sandbox
   */
  copyFromProduction(sandboxId: string, fileKey: string): ABSandboxFile {
    const config = FILE_KEY_CONFIG[fileKey as SandboxFileKey];
    if (!config) {
      throw new Error(`Unknown file key: ${fileKey}`);
    }

    // Get production content using promptService
    const productionContent = promptService.getPromptContent(fileKey);
    if (!productionContent) {
      throw new Error(`Production file not found: ${fileKey}`);
    }

    // Check if sandbox file already exists
    const existing = this.db.getSandboxFile(sandboxId, fileKey);
    const newVersion = existing ? existing.version + 1 : 1;

    // Save to sandbox
    this.db.saveSandboxFile({
      sandboxId,
      fileKey,
      fileType: config.fileType,
      displayName: config.displayName,
      content: productionContent.content,
      version: newVersion,
      baseVersion: productionContent.version,
      changeDescription: `Copied from production v${productionContent.version}`,
    });

    // Return the saved file
    return this.db.getSandboxFile(sandboxId, fileKey)!;
  }

  /**
   * Copy all 3 files from production to sandbox
   */
  copyAllFromProduction(sandboxId: string): ABSandboxFile[] {
    const files: ABSandboxFile[] = [];

    for (const fileKey of SANDBOX_FILE_KEYS) {
      const file = this.copyFromProduction(sandboxId, fileKey);
      files.push(file);
    }

    return files;
  }

  /**
   * Get file version history
   */
  getSandboxFileHistory(sandboxId: string, fileKey: string, limit: number = 20): ABSandboxFileHistory[] {
    return this.db.getSandboxFileHistory(sandboxId, fileKey, limit);
  }

  /**
   * Rollback a file to a specific version
   */
  rollbackFile(sandboxId: string, fileKey: string, version: number): void {
    this.db.rollbackSandboxFile(sandboxId, fileKey, version);
  }

  /**
   * Reset sandbox to production state (clears all files and copies fresh from production)
   */
  resetToProduction(sandboxId: string): ABSandboxFile[] {
    // Clear all sandbox files
    this.db.clearSandboxFiles(sandboxId);

    // Copy fresh from production
    return this.copyAllFromProduction(sandboxId);
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Check if sandbox has all required files
   */
  isSandboxComplete(sandboxId: string): { complete: boolean; missingFiles: string[] } {
    const files = this.db.getSandboxFiles(sandboxId);
    const fileKeys = new Set(files.map(f => f.fileKey));

    const missingFiles: string[] = [];
    for (const key of SANDBOX_FILE_KEYS) {
      if (!fileKeys.has(key)) {
        missingFiles.push(key);
      }
    }

    return {
      complete: missingFiles.length === 0,
      missingFiles,
    };
  }

  /**
   * Check if sandbox has a configured endpoint
   */
  hasEndpoint(sandboxId: string): boolean {
    const sandbox = this.db.getSandbox(sandboxId);
    return !!(sandbox?.flowiseEndpoint && sandbox.flowiseEndpoint.trim().length > 0);
  }

  /**
   * Get sandbox status summary
   */
  getSandboxStatus(sandboxId: string): {
    exists: boolean;
    hasEndpoint: boolean;
    hasAllFiles: boolean;
    fileCount: number;
    missingFiles: string[];
    endpoint?: string;
  } {
    const sandbox = this.db.getSandbox(sandboxId);
    if (!sandbox) {
      return {
        exists: false,
        hasEndpoint: false,
        hasAllFiles: false,
        fileCount: 0,
        missingFiles: [...SANDBOX_FILE_KEYS],
      };
    }

    const { complete, missingFiles } = this.isSandboxComplete(sandboxId);
    const files = this.db.getSandboxFiles(sandboxId);

    return {
      exists: true,
      hasEndpoint: !!(sandbox.flowiseEndpoint && sandbox.flowiseEndpoint.trim().length > 0),
      hasAllFiles: complete,
      fileCount: files.length,
      missingFiles,
      endpoint: sandbox.flowiseEndpoint || undefined,
    };
  }

  // ============================================================================
  // COMPARISON HELPERS
  // ============================================================================

  /**
   * Get files from both sandboxes for comparison
   */
  getComparisonFiles(): {
    sandboxA: ABSandboxFile[];
    sandboxB: ABSandboxFile[];
  } {
    return {
      sandboxA: this.db.getSandboxFiles('sandbox_a'),
      sandboxB: this.db.getSandboxFiles('sandbox_b'),
    };
  }

  /**
   * Get both sandbox configurations for comparison
   */
  getBothSandboxes(): {
    sandboxA: ABSandbox | null;
    sandboxB: ABSandbox | null;
  } {
    return {
      sandboxA: this.db.getSandbox('sandbox_a'),
      sandboxB: this.db.getSandbox('sandbox_b'),
    };
  }
}
