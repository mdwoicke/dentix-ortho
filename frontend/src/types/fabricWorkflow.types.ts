/** A single record from the Fabric Workflow API — columns are dynamic */
export type FabricWorkflowRecord = Record<string, unknown>;

export interface FabricWorkflowResponse {
  success: boolean;
  data: FabricWorkflowRecord[];
  count: number;
  source?: 'api' | 'csv';
  fetchedAt: string;
}

export interface FabricWorkflowTestResult {
  connected: boolean;
  recordCount?: number;
  status?: number;
  error?: string;
}
