/**
 * Node-RED Deploy Service
 *
 * Handles deploying flow updates to the production Node-RED instance
 * via the Admin API.
 *
 * IMPORTANT: This service is READ/REPLACE only - no delete operations!
 * See CLAUDE.md for safety rules.
 */

import fs from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { getNodeRedConfig, getNodeRedAuthHeader, isNodeRedConfigured } from '../config/nodered';

// Path to test-agent database for deploy event tracking
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

/**
 * Record a deploy event in artifact_deploy_events for version correlation.
 */
function recordDeployEvent(rev: string, description: string): void {
  try {
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS artifact_deploy_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artifact_key TEXT NOT NULL,
          version INTEGER NOT NULL,
          deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
          deploy_method TEXT,
          nodered_rev TEXT,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      // Get current nodered_flow version from prompt_working_copies
      const row = db.prepare(
        'SELECT version FROM prompt_working_copies WHERE file_key = ?'
      ).get('nodered_flow') as { version: number } | undefined;
      const version = row?.version ?? 0;

      db.prepare(`
        INSERT INTO artifact_deploy_events (artifact_key, version, deploy_method, nodered_rev, description)
        VALUES ('nodered_flow', ?, 'nodered_deploy', ?, ?)
      `).run(version, rev, description);
    } finally {
      db.close();
    }
  } catch (err: unknown) {
    console.warn(`[NodeRED Deploy] Failed to record deploy event: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Path to V1 flow source file
const V1_FLOW_PATH = path.resolve(__dirname, '../../../docs/v1/nodered_Cloud9_flows.json');
// Backup directory
const BACKUP_DIR = path.resolve(__dirname, '../../../nodered/bk_up');

export interface NodeRedFlowsResponse {
  rev: string;
  flows: any[];
}

export interface NodeRedStatus {
  connected: boolean;
  rev?: string;
  flowCount?: number;
  lastDeployTimestamp?: string;
  error?: string;
}

export interface DeployResult {
  success: boolean;
  rev?: string;
  previousRev?: string;
  flowCount?: number;
  backupPath?: string;
  dryRun?: boolean;
  error?: string;
}

export interface FlowTab {
  id: string;
  type: 'tab';
  label: string;
  disabled: boolean;
  info?: string;
  env?: Array<{ name: string; value: string; type: string }>;
}

export interface CopyFlowOptions {
  sourceFlowId?: string;
  sourceFlowLabel?: string;
  newLabel: string;
  disabled?: boolean;
  backup?: boolean;
  dryRun?: boolean;
}

export interface CopyFlowResult {
  success: boolean;
  newFlowId?: string;
  newFlowLabel?: string;
  nodesCopied?: number;
  rev?: string;
  previousRev?: string;
  backupPath?: string;
  dryRun?: boolean;
  error?: string;
}

// v9: Timeout configuration for Node-RED Admin API calls
const NODERED_FETCH_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Get current flows from Node-RED Admin API
 * Uses v2 API to get revision ID for optimistic concurrency
 */
export async function getCurrentFlows(): Promise<NodeRedFlowsResponse> {
  if (!isNodeRedConfigured()) {
    throw new Error('Node-RED is not configured. Check environment variables.');
  }

  const config = getNodeRedConfig();
  const url = `${config.adminUrl}/flows`;

  // v9: Add timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NODERED_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: getNodeRedAuthHeader(),
        'Node-RED-API-Version': 'v2',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get flows from Node-RED: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data as NodeRedFlowsResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get Node-RED connection status
 */
export async function getStatus(): Promise<NodeRedStatus> {
  if (!isNodeRedConfigured()) {
    return {
      connected: false,
      error: 'Node-RED is not configured. Check environment variables.',
    };
  }

  try {
    const flowsResponse = await getCurrentFlows();
    return {
      connected: true,
      rev: flowsResponse.rev,
      flowCount: flowsResponse.flows.length,
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message || 'Unknown error connecting to Node-RED',
    };
  }
}

/**
 * Deploy flows to Node-RED Admin API
 *
 * @param flows - The flow array to deploy
 * @param rev - Optional revision ID for optimistic concurrency (if not provided, will be fetched)
 * @param maxRetries - Maximum retry attempts on 409 conflict (default: 3)
 */
export async function deployFlows(
  flows: any[],
  rev?: string,
  maxRetries: number = 3
): Promise<{ success: boolean; newRev: string; previousRev?: string }> {
  if (!isNodeRedConfigured()) {
    throw new Error('Node-RED is not configured. Check environment variables.');
  }

  const config = getNodeRedConfig();
  const url = `${config.adminUrl}/flows`;

  let currentRev = rev;
  let attempts = 0;

  while (attempts < maxRetries) {
    // If no rev provided or retrying after conflict, fetch current
    if (!currentRev) {
      const currentFlows = await getCurrentFlows();
      currentRev = currentFlows.rev;
    }

    // v9: Add timeout using AbortController (60s for deploy - larger payloads)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: getNodeRedAuthHeader(),
          'Node-RED-API-Version': 'v2',
          'Node-RED-Deployment-Type': 'full',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rev: currentRev,
          flows: flows,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      const data = await response.json() as { rev: string };
      return {
        success: true,
        newRev: data.rev,
        previousRev: currentRev,
      };
    }

    // Handle 409 Conflict - revision mismatch
    if (response.status === 409) {
      attempts++;
      console.warn(`[NodeRED Deploy] Revision conflict (attempt ${attempts}/${maxRetries}), re-fetching...`);
      currentRev = undefined; // Force re-fetch
      continue;
    }

    // Other errors
    const errorText = await response.text();
    throw new Error(`Failed to deploy flows to Node-RED: ${response.status} - ${errorText}`);
  }

  throw new Error(`Failed to deploy flows after ${maxRetries} attempts due to revision conflicts`);
}

/**
 * Backup current Node-RED flows to a local file
 *
 * @returns Path to the backup file
 */
export async function backupCurrentFlows(): Promise<string> {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const currentFlows = await getCurrentFlows();

  // Generate timestamp-based filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `flow-backup-${timestamp}.json`;
  const backupPath = path.join(BACKUP_DIR, filename);

  // Write backup with metadata
  const backupData = {
    _metadata: {
      backupTimestamp: new Date().toISOString(),
      rev: currentFlows.rev,
      flowCount: currentFlows.flows.length,
    },
    flows: currentFlows.flows,
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

  console.log(`[NodeRED Deploy] Backup created: ${backupPath}`);
  return backupPath;
}

/**
 * Read V1 flow file from disk
 */
export function readV1FlowFile(): any[] {
  if (!fs.existsSync(V1_FLOW_PATH)) {
    throw new Error(`V1 flow file not found: ${V1_FLOW_PATH}`);
  }

  const content = fs.readFileSync(V1_FLOW_PATH, 'utf-8');

  try {
    const flows = JSON.parse(content);

    if (!Array.isArray(flows)) {
      throw new Error('V1 flow file must be a JSON array');
    }

    return flows;
  } catch (error: any) {
    throw new Error(`Failed to parse V1 flow file: ${error.message}`);
  }
}

/**
 * Deploy flows from V1 source file to Node-RED
 *
 * @param options.backup - Create backup before deploying (default: true)
 * @param options.dryRun - Validate without deploying (default: false)
 */
export async function deployFromV1File(options: {
  backup?: boolean;
  dryRun?: boolean;
} = {}): Promise<DeployResult> {
  const { backup = true, dryRun = false } = options;

  try {
    // Read and validate the V1 flow file
    const flows = readV1FlowFile();
    console.log(`[NodeRED Deploy] Read ${flows.length} nodes from V1 flow file`);

    // In dry-run mode, just validate connectivity and file
    if (dryRun) {
      const status = await getStatus();
      if (!status.connected) {
        return {
          success: false,
          dryRun: true,
          error: status.error || 'Node-RED not connected',
        };
      }

      return {
        success: true,
        dryRun: true,
        rev: status.rev,
        flowCount: flows.length,
      };
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (backup) {
      try {
        backupPath = await backupCurrentFlows();
      } catch (backupError: any) {
        console.warn(`[NodeRED Deploy] Backup failed (continuing anyway): ${backupError.message}`);
      }
    }

    // Deploy the flows
    const deployResult = await deployFlows(flows);

    console.log(`[NodeRED Deploy] Successfully deployed ${flows.length} nodes`);
    console.log(`[NodeRED Deploy] Previous rev: ${deployResult.previousRev}, New rev: ${deployResult.newRev}`);

    // Record deploy event for failure-version correlation
    recordDeployEvent(
      deployResult.newRev,
      `Deployed ${flows.length} nodes from V1 file`
    );

    return {
      success: true,
      rev: deployResult.newRev,
      previousRev: deployResult.previousRev,
      flowCount: flows.length,
      backupPath,
    };
  } catch (error: any) {
    console.error(`[NodeRED Deploy] Failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ============================================================================
// FLOW COPY FUNCTIONS
// ============================================================================

/**
 * Generate a new unique ID for Node-RED nodes
 * Node-RED uses a specific format: 16 character hex string
 */
function generateNodeId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * List all flow tabs from Node-RED
 */
export async function listFlowTabs(): Promise<FlowTab[]> {
  const { flows } = await getCurrentFlows();
  return flows.filter((node: any) => node.type === 'tab') as FlowTab[];
}

/**
 * Find a flow tab by ID or label
 */
export async function getFlowByIdOrLabel(
  idOrLabel: string
): Promise<{ tab: FlowTab; nodes: any[] } | null> {
  const { flows } = await getCurrentFlows();

  // Find the tab
  const tab = flows.find(
    (node: any) =>
      node.type === 'tab' &&
      (node.id === idOrLabel || node.label === idOrLabel)
  );

  if (!tab) {
    return null;
  }

  // Find all nodes belonging to this tab (z = tab.id)
  const nodes = flows.filter((node: any) => node.z === tab.id);

  return { tab: tab as FlowTab, nodes };
}

/**
 * Copy a flow (tab) with all its nodes to a new flow with a new name
 *
 * @param options - Copy options
 * @returns Result with new flow ID and deployment status
 */
export async function copyFlow(options: CopyFlowOptions): Promise<CopyFlowResult> {
  const {
    sourceFlowId,
    sourceFlowLabel,
    newLabel,
    disabled = false,
    backup = true,
    dryRun = false,
  } = options;

  try {
    // Validate input
    if (!sourceFlowId && !sourceFlowLabel) {
      return {
        success: false,
        error: 'Either sourceFlowId or sourceFlowLabel must be provided',
      };
    }

    if (!newLabel || newLabel.trim() === '') {
      return {
        success: false,
        error: 'newLabel is required',
      };
    }

    // Get current flows
    const { flows, rev } = await getCurrentFlows();

    // Find the source flow
    const sourceId = sourceFlowId || sourceFlowLabel;
    const sourceTab = flows.find(
      (node: any) =>
        node.type === 'tab' &&
        (node.id === sourceId || node.label === sourceId)
    );

    if (!sourceTab) {
      return {
        success: false,
        error: `Source flow not found: ${sourceId}`,
      };
    }

    // Check if a flow with the new label already exists
    const existingTab = flows.find(
      (node: any) => node.type === 'tab' && node.label === newLabel
    );

    if (existingTab) {
      return {
        success: false,
        error: `A flow with label "${newLabel}" already exists (id: ${existingTab.id})`,
      };
    }

    // Find all nodes belonging to the source tab
    const sourceNodes = flows.filter((node: any) => node.z === sourceTab.id);

    console.log(`[NodeRED Copy] Found source flow "${sourceTab.label}" with ${sourceNodes.length} nodes`);

    // Generate new IDs
    const newTabId = generateNodeId();

    // Create ID mapping: old ID -> new ID
    const idMap: Record<string, string> = {
      [sourceTab.id]: newTabId,
    };

    // Generate new IDs for all nodes
    for (const node of sourceNodes) {
      idMap[node.id] = generateNodeId();
    }

    // Clone the tab with new ID and label
    const newTab = {
      ...JSON.parse(JSON.stringify(sourceTab)),
      id: newTabId,
      label: newLabel,
      disabled: disabled,
    };

    // Clone all nodes with new IDs and updated references
    const newNodes = sourceNodes.map((node: any) => {
      const cloned = JSON.parse(JSON.stringify(node));

      // Update the node's own ID
      cloned.id = idMap[node.id];

      // Update the parent tab reference
      cloned.z = newTabId;

      // Update wire connections (output references)
      if (cloned.wires && Array.isArray(cloned.wires)) {
        cloned.wires = cloned.wires.map((wireGroup: string[]) =>
          wireGroup.map((wireId: string) => idMap[wireId] || wireId)
        );
      }

      // Update any link nodes that reference other nodes
      if (cloned.links && Array.isArray(cloned.links)) {
        cloned.links = cloned.links.map((linkId: string) => idMap[linkId] || linkId);
      }

      return cloned;
    });

    // In dry-run mode, just return what would be created
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        newFlowId: newTabId,
        newFlowLabel: newLabel,
        nodesCopied: newNodes.length,
        rev: rev,
      };
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (backup) {
      try {
        backupPath = await backupCurrentFlows();
      } catch (backupError: any) {
        console.warn(`[NodeRED Copy] Backup failed (continuing anyway): ${backupError.message}`);
      }
    }

    // Merge new flow into existing flows
    const updatedFlows = [...flows, newTab, ...newNodes];

    console.log(`[NodeRED Copy] Deploying ${updatedFlows.length} total nodes (added ${newNodes.length + 1})`);

    // Deploy the updated flows
    const deployResult = await deployFlows(updatedFlows, rev);

    console.log(`[NodeRED Copy] Successfully created flow "${newLabel}" (id: ${newTabId})`);

    return {
      success: true,
      newFlowId: newTabId,
      newFlowLabel: newLabel,
      nodesCopied: newNodes.length,
      rev: deployResult.newRev,
      previousRev: deployResult.previousRev,
      backupPath,
    };
  } catch (error: any) {
    console.error(`[NodeRED Copy] Failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}
