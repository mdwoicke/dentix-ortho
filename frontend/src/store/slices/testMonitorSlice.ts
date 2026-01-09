/**
 * Test Monitor Slice
 * Manages Flowise test monitoring data
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  TestRun,
  TestRunWithResults,
  TestResult,
  ConversationTurn,
  ApiCall,
  Finding,
  Recommendation,
  GeneratedFix,
  PromptFile,
  PromptVersionHistory,
  VerificationSummary,
  PromptContext,
  EnvironmentPromptState,
} from '../../types/testMonitor.types';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import type { DiagnosisResult } from '../../services/api/testMonitorApi';

// Diagnosis state interface
interface DiagnosisState {
  isRunning: boolean;
  progress: { analyzed: number; total: number };
  lastResult: DiagnosisResult | null;
  useLLM: boolean;
  error: string | null;
}

// Verification state interface
interface VerificationState {
  isRunning: boolean;
  lastResult: VerificationSummary | null;
  error: string | null;
}

// Deployment state interface (Phase 5: Flowise Sync)
interface DeploymentState {
  deployedVersions: Record<string, number>;
  loading: boolean;
  error: string | null;
}
import { handleError, logError } from '../../services/utils/errorHandler';

// ============================================================================
// SMART ARRAY MERGING HELPERS (prevent flickering on updates)
// ============================================================================

/**
 * Smart merge for TestRun arrays - only updates items that have changed
 * Returns same array reference if nothing changed (prevents re-render)
 */
function mergeTestRuns(existing: TestRun[], incoming: TestRun[]): TestRun[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const existingMap = new Map(existing.map(r => [r.runId, r]));
  let hasChanges = false;

  const merged = incoming.map(newRun => {
    const existingRun = existingMap.get(newRun.runId);
    if (!existingRun) {
      hasChanges = true;
      return newRun;
    }
    // Compare key fields to detect changes
    if (existingRun.status !== newRun.status ||
        existingRun.passed !== newRun.passed ||
        existingRun.failed !== newRun.failed ||
        existingRun.totalTests !== newRun.totalTests) {
      hasChanges = true;
      return newRun;
    }
    // Return existing reference to prevent re-render
    return existingRun;
  });

  // Check if any items were removed
  if (merged.length !== existing.length) {
    hasChanges = true;
  }

  return hasChanges ? merged : existing;
}

/**
 * Smart merge for TestResult arrays - only updates items that have changed
 * Returns same array reference if nothing changed
 */
function mergeTestResults(existing: TestResult[], incoming: TestResult[]): TestResult[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const existingMap = new Map(existing.map(r => [r.testId, r]));
  let hasChanges = false;

  const merged = incoming.map(newResult => {
    const existingResult = existingMap.get(newResult.testId);
    if (!existingResult) {
      hasChanges = true;
      return newResult;
    }
    // Compare key fields to detect changes
    if (existingResult.status !== newResult.status ||
        existingResult.durationMs !== newResult.durationMs ||
        existingResult.errorMessage !== newResult.errorMessage) {
      hasChanges = true;
      return newResult;
    }
    return existingResult;
  });

  if (merged.length !== existing.length) {
    hasChanges = true;
  }

  return hasChanges ? merged : existing;
}

/**
 * Smart merge for ConversationTurn arrays - append-only for transcripts
 * Only adds new turns, preserves existing references
 */
function mergeTranscript(existing: ConversationTurn[], incoming: ConversationTurn[]): ConversationTurn[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;
  if (incoming.length <= existing.length) {
    // No new turns, check if content is identical
    let identical = true;
    for (let i = 0; i < existing.length && i < incoming.length; i++) {
      if (existing[i].timestamp !== incoming[i].timestamp) {
        identical = false;
        break;
      }
    }
    if (identical && incoming.length === existing.length) return existing;
  }

  // Create a set of existing timestamps for fast lookup
  const existingTimestamps = new Set(existing.map(t => t.timestamp));
  const newTurns = incoming.filter(t => !existingTimestamps.has(t.timestamp));

  if (newTurns.length === 0) return existing;

  // Append new turns to existing (preserves references)
  return [...existing, ...newTurns];
}

/**
 * Smart merge for ApiCall arrays - append-only
 */
function mergeApiCalls(existing: ApiCall[], incoming: ApiCall[]): ApiCall[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;
  if (incoming.length <= existing.length) {
    // Check if identical by comparing lengths and sample
    if (incoming.length === existing.length) {
      let identical = true;
      for (let i = 0; i < Math.min(3, existing.length); i++) {
        if (existing[i].timestamp !== incoming[i].timestamp) {
          identical = false;
          break;
        }
      }
      if (identical) return existing;
    }
  }

  // Create lookup by timestamp for deduplication
  const existingTimestamps = new Set(existing.map(a => a.timestamp));
  const newCalls = incoming.filter(a => !existingTimestamps.has(a.timestamp));

  if (newCalls.length === 0) return existing;

  return [...existing, ...newCalls];
}

// Live conversation state for a single test
interface LiveConversationState {
  transcript: ConversationTurn[];
  apiCalls: ApiCall[];
  isLive: boolean;
  lastUpdated: number;
}

// Running test info (for displaying in table before test completes)
interface RunningTestInfo {
  testId: string;
  testName: string;
  runId: string;
  startedAt: number;
}

interface TestMonitorState {
  runs: TestRun[];
  selectedRun: TestRunWithResults | null;
  selectedTest: TestResult | null;
  transcript: ConversationTurn[];
  apiCalls: ApiCall[];
  findings: Finding[];
  recommendations: Recommendation[];
  fixes: GeneratedFix[];
  loading: boolean;
  transcriptLoading: boolean;
  apiCallsLoading: boolean;
  fixesLoading: boolean;
  error: string | null;
  // Real-time streaming state
  isStreaming: boolean;
  streamError: string | null;
  // Live conversation streaming state
  liveConversations: Record<string, LiveConversationState>;
  selectedLiveTestId: string | null;
  // Running tests (for table display before completion)
  runningTests: Record<string, RunningTestInfo>;
  // Prompt version management state
  promptFiles: PromptFile[];
  promptContent: Record<string, string>;
  promptHistory: PromptVersionHistory[];
  promptLoading: boolean;
  // Environment selection state
  selectedEnvironment: PromptContext;
  environmentPromptStates: Record<PromptContext, EnvironmentPromptState>;
  // Diagnosis state
  diagnosis: DiagnosisState;
  // Verification state
  verification: VerificationState;
  // Deployment state (Phase 5: Flowise Sync)
  deployment: DeploymentState;
}

const initialState: TestMonitorState = {
  runs: [],
  selectedRun: null,
  selectedTest: null,
  transcript: [],
  apiCalls: [],
  findings: [],
  recommendations: [],
  fixes: [],
  loading: false,
  transcriptLoading: false,
  apiCallsLoading: false,
  fixesLoading: false,
  error: null,
  // Real-time streaming state
  isStreaming: false,
  streamError: null,
  // Live conversation streaming state
  liveConversations: {},
  selectedLiveTestId: null,
  // Running tests (for table display before completion)
  runningTests: {},
  // Prompt version management state
  promptFiles: [],
  promptContent: {},
  promptHistory: [],
  promptLoading: false,
  // Environment selection state
  selectedEnvironment: 'production',
  environmentPromptStates: {
    production: { files: [], deployedVersions: {}, loading: false, error: null },
    sandbox_a: { files: [], deployedVersions: {}, loading: false, error: null },
    sandbox_b: { files: [], deployedVersions: {}, loading: false, error: null },
  },
  // Diagnosis state
  diagnosis: {
    isRunning: false,
    progress: { analyzed: 0, total: 0 },
    lastResult: null,
    useLLM: true,
    error: null,
  },
  // Verification state
  verification: {
    isRunning: false,
    lastResult: null,
    error: null,
  },
  // Deployment state (Phase 5: Flowise Sync)
  deployment: {
    deployedVersions: {},
    loading: false,
    error: null,
  },
};

// Async Thunks

/**
 * Fetch all test runs
 */
export const fetchTestRuns = createAsyncThunk(
  'testMonitor/fetchRuns',
  async ({ limit, offset }: { limit?: number; offset?: number } = {}, { rejectWithValue }) => {
    try {
      const runs = await testMonitorApi.getTestRuns(limit, offset);
      return runs;
    } catch (error) {
      logError(error, 'fetchTestRuns');
      const formattedError = handleError(error, 'Failed to fetch test runs');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch a single test run with results
 */
export const fetchTestRun = createAsyncThunk(
  'testMonitor/fetchRun',
  async (runId: string, { rejectWithValue }) => {
    try {
      const run = await testMonitorApi.getTestRun(runId);
      return run;
    } catch (error) {
      logError(error, 'fetchTestRun');
      const formattedError = handleError(error, 'Failed to fetch test run');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch transcript for a test
 */
export const fetchTranscript = createAsyncThunk(
  'testMonitor/fetchTranscript',
  async ({ testId, runId }: { testId: string; runId?: string }, { rejectWithValue }) => {
    try {
      const transcript = await testMonitorApi.getTranscript(testId, runId);
      return transcript;
    } catch (error) {
      logError(error, 'fetchTranscript');
      const formattedError = handleError(error, 'Failed to fetch transcript');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch API calls for a test
 */
export const fetchApiCalls = createAsyncThunk(
  'testMonitor/fetchApiCalls',
  async ({ testId, runId }: { testId: string; runId?: string }, { rejectWithValue }) => {
    try {
      const apiCalls = await testMonitorApi.getApiCalls(testId, runId);
      return apiCalls;
    } catch (error) {
      logError(error, 'fetchApiCalls');
      const formattedError = handleError(error, 'Failed to fetch API calls');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch findings
 */
export const fetchFindings = createAsyncThunk(
  'testMonitor/fetchFindings',
  async (runId: string | undefined, { rejectWithValue }) => {
    try {
      const findings = await testMonitorApi.getFindings(runId);
      return findings;
    } catch (error) {
      logError(error, 'fetchFindings');
      const formattedError = handleError(error, 'Failed to fetch findings');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch recommendations
 */
export const fetchRecommendations = createAsyncThunk(
  'testMonitor/fetchRecommendations',
  async (runId: string | undefined, { rejectWithValue }) => {
    try {
      const recommendations = await testMonitorApi.getRecommendations(runId);
      return recommendations;
    } catch (error) {
      logError(error, 'fetchRecommendations');
      const formattedError = handleError(error, 'Failed to fetch recommendations');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch fixes for a run
 */
export const fetchFixes = createAsyncThunk(
  'testMonitor/fetchFixes',
  async (runId: string, { rejectWithValue }) => {
    console.log(`[Fixes:Redux] fetchFixes thunk dispatched with runId: ${runId}`);
    try {
      const fixes = await testMonitorApi.getFixesForRun(runId);
      console.log(`[Fixes:Redux] fetchFixes thunk received ${fixes?.length ?? 0} fixes from API`);
      return fixes;
    } catch (error) {
      console.error(`[Fixes:Redux] fetchFixes thunk failed:`, error);
      logError(error, 'fetchFixes');
      const formattedError = handleError(error, 'Failed to fetch fixes');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Update fix status
 */
export const updateFixStatus = createAsyncThunk(
  'testMonitor/updateFixStatus',
  async ({ fixId, status }: { fixId: string; status: 'pending' | 'applied' | 'rejected' | 'verified' }, { rejectWithValue }) => {
    try {
      await testMonitorApi.updateFixStatus(fixId, status);
      return { fixId, status };
    } catch (error) {
      logError(error, 'updateFixStatus');
      const formattedError = handleError(error, 'Failed to update fix status');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// DIAGNOSIS THUNKS
// ============================================================================

/**
 * Run LLM-powered diagnosis on test failures and generate fixes
 */
export const runDiagnosis = createAsyncThunk(
  'testMonitor/runDiagnosis',
  async ({ runId, useLLM = true }: { runId: string; useLLM?: boolean }, { rejectWithValue }) => {
    try {
      const result = await testMonitorApi.runDiagnosis(runId, { useLLM });
      return result;
    } catch (error) {
      logError(error, 'runDiagnosis');
      const formattedError = handleError(error, 'Failed to run diagnosis');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// VERIFICATION THUNKS
// ============================================================================

/**
 * Verify fixes by re-running affected tests
 */
export const verifyFixes = createAsyncThunk(
  'testMonitor/verifyFixes',
  async (fixIds: string[], { rejectWithValue }) => {
    try {
      const result = await testMonitorApi.verifyFixes(fixIds);
      return result;
    } catch (error) {
      logError(error, 'verifyFixes');
      const formattedError = handleError(error, 'Failed to verify fixes');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// DEPLOYMENT TRACKING THUNKS (Phase 5: Flowise Sync)
// ============================================================================

/**
 * Fetch deployed versions for all prompt files
 */
export const fetchDeployedVersions = createAsyncThunk(
  'testMonitor/fetchDeployedVersions',
  async (_, { rejectWithValue }) => {
    try {
      const versions = await testMonitorApi.getDeployedVersions();
      return versions;
    } catch (error) {
      logError(error, 'fetchDeployedVersions');
      const formattedError = handleError(error, 'Failed to fetch deployed versions');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Mark a prompt version as deployed to Flowise
 */
export const markPromptDeployed = createAsyncThunk(
  'testMonitor/markPromptDeployed',
  async ({ fileKey, version, notes }: { fileKey: string; version: number; notes?: string }, { rejectWithValue }) => {
    try {
      await testMonitorApi.markPromptAsDeployed(fileKey, version, notes);
      return { fileKey, version };
    } catch (error) {
      logError(error, 'markPromptDeployed');
      const formattedError = handleError(error, 'Failed to mark prompt as deployed');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// PROMPT VERSION MANAGEMENT THUNKS
// ============================================================================

/**
 * Fetch all prompt files with version info
 */
export const fetchPromptFiles = createAsyncThunk(
  'testMonitor/fetchPromptFiles',
  async (_, { rejectWithValue }) => {
    try {
      const files = await testMonitorApi.getPromptFiles();
      return files;
    } catch (error) {
      logError(error, 'fetchPromptFiles');
      const formattedError = handleError(error, 'Failed to fetch prompt files');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch prompt files for a specific environment (production, sandbox_a, sandbox_b)
 */
export const fetchEnvironmentPromptFiles = createAsyncThunk(
  'testMonitor/fetchEnvironmentPromptFiles',
  async (environment: PromptContext, { rejectWithValue }) => {
    try {
      const files = await testMonitorApi.getPromptFiles(environment);
      return { environment, files };
    } catch (error) {
      logError(error, 'fetchEnvironmentPromptFiles');
      const formattedError = handleError(error, `Failed to fetch prompt files for ${environment}`);
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch deployed versions for a specific environment
 */
export const fetchEnvironmentDeployedVersions = createAsyncThunk(
  'testMonitor/fetchEnvironmentDeployedVersions',
  async (environment: PromptContext, { rejectWithValue }) => {
    try {
      const versions = await testMonitorApi.getDeployedVersions(environment);
      return { environment, versions };
    } catch (error) {
      logError(error, 'fetchEnvironmentDeployedVersions');
      const formattedError = handleError(error, `Failed to fetch deployed versions for ${environment}`);
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch content for a specific prompt file
 */
export const fetchPromptContent = createAsyncThunk(
  'testMonitor/fetchPromptContent',
  async (fileKey: string, { rejectWithValue }) => {
    try {
      const result = await testMonitorApi.getPromptContent(fileKey);
      return { fileKey, content: result.content, version: result.version };
    } catch (error) {
      logError(error, 'fetchPromptContent');
      const formattedError = handleError(error, 'Failed to fetch prompt content');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch version history for a prompt file
 */
export const fetchPromptHistory = createAsyncThunk(
  'testMonitor/fetchPromptHistory',
  async (fileKey: string, { rejectWithValue }) => {
    try {
      const history = await testMonitorApi.getPromptHistory(fileKey);
      return history;
    } catch (error) {
      logError(error, 'fetchPromptHistory');
      const formattedError = handleError(error, 'Failed to fetch prompt history');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Apply a fix to a prompt and create a new version
 */
export const applyFixToPrompt = createAsyncThunk(
  'testMonitor/applyFixToPrompt',
  async ({ fileKey, fixId }: { fileKey: string; fixId: string }, { rejectWithValue }) => {
    try {
      const result = await testMonitorApi.applyFixToPrompt(fileKey, fixId);
      return { fileKey, fixId, newVersion: result.newVersion, message: result.message };
    } catch (error) {
      logError(error, 'applyFixToPrompt');
      const formattedError = handleError(error, 'Failed to apply fix to prompt');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Apply multiple fixes to their respective target files
 * Handles automatic file detection and curly brace escaping for Flowise
 */
export const applyBatchFixes = createAsyncThunk(
  'testMonitor/applyBatchFixes',
  async (fixIds: string[], { rejectWithValue }) => {
    try {
      const result = await testMonitorApi.applyBatchFixes(fixIds);
      return result;
    } catch (error) {
      logError(error, 'applyBatchFixes');
      const formattedError = handleError(error, 'Failed to apply batch fixes');
      return rejectWithValue(formattedError.message);
    }
  }
);

// Slice

export const testMonitorSlice = createSlice({
  name: 'testMonitor',
  initialState,
  reducers: {
    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Set selected environment (production, sandbox_a, sandbox_b)
     */
    setSelectedEnvironment: (state, action: PayloadAction<PromptContext>) => {
      state.selectedEnvironment = action.payload;
    },

    /**
     * Set selected test
     */
    setSelectedTest: (state, action: PayloadAction<TestResult | null>) => {
      state.selectedTest = action.payload;
      // Clear transcript and API calls when changing test
      if (action.payload === null) {
        state.transcript = [];
        state.apiCalls = [];
      }
    },

    /**
     * Clear selected run
     */
    clearSelectedRun: (state) => {
      state.selectedRun = null;
      state.selectedTest = null;
      state.transcript = [];
      state.apiCalls = [];
    },

    /**
     * Clear all data
     */
    clearAllData: (state) => {
      state.runs = [];
      state.selectedRun = null;
      state.selectedTest = null;
      state.transcript = [];
      state.apiCalls = [];
      state.findings = [];
      state.recommendations = [];
      state.error = null;
    },

    // Real-time streaming actions

    /**
     * Start streaming - set streaming flag
     */
    startStreaming: (state) => {
      state.isStreaming = true;
      state.streamError = null;
    },

    /**
     * Stop streaming - clear streaming flag
     */
    stopStreaming: (state) => {
      state.isStreaming = false;
    },

    /**
     * Handle stream error
     */
    setStreamError: (state, action: PayloadAction<string>) => {
      state.streamError = action.payload;
      state.isStreaming = false;
    },

    /**
     * Update run data from stream
     */
    streamRunUpdate: (state, action: PayloadAction<TestRun>) => {
      const updatedRun = action.payload;

      // Update in runs list
      const runIndex = state.runs.findIndex(r => r.runId === updatedRun.runId);
      if (runIndex >= 0) {
        state.runs[runIndex] = updatedRun;
      }

      // Update selected run if it's the same
      if (state.selectedRun && state.selectedRun.runId === updatedRun.runId) {
        state.selectedRun = {
          ...state.selectedRun,
          ...updatedRun,
        };
      }
    },

    /**
     * Update results from stream - uses smart merge to prevent flickering
     */
    streamResultsUpdate: (state, action: PayloadAction<TestResult[]>) => {
      if (state.selectedRun) {
        const mergedResults = mergeTestResults(state.selectedRun.results || [], action.payload);
        // Only update if there were actual changes
        if (mergedResults !== state.selectedRun.results) {
          state.selectedRun.results = mergedResults;
        }
      }
    },

    /**
     * Update findings from stream
     */
    streamFindingsUpdate: (state, action: PayloadAction<Finding[]>) => {
      state.findings = action.payload;
    },

    /**
     * Update transcript from stream - uses smart merge to prevent flickering
     */
    streamTranscriptUpdate: (state, action: PayloadAction<ConversationTurn[]>) => {
      const mergedTranscript = mergeTranscript(state.transcript, action.payload);
      if (mergedTranscript !== state.transcript) {
        state.transcript = mergedTranscript;
      }
    },

    /**
     * Update API calls from stream - uses smart merge to prevent flickering
     */
    streamApiCallsUpdate: (state, action: PayloadAction<ApiCall[]>) => {
      const mergedApiCalls = mergeApiCalls(state.apiCalls, action.payload);
      if (mergedApiCalls !== state.apiCalls) {
        state.apiCalls = mergedApiCalls;
      }
    },

    // Live conversation streaming actions

    /**
     * Add a conversation turn to a live test
     */
    addLiveConversationTurn: (state, action: PayloadAction<{
      testId: string;
      turn: ConversationTurn;
    }>) => {
      const { testId, turn } = action.payload;
      if (!state.liveConversations[testId]) {
        state.liveConversations[testId] = {
          transcript: [],
          apiCalls: [],
          isLive: true,
          lastUpdated: Date.now(),
        };
      }
      state.liveConversations[testId].transcript.push(turn);
      state.liveConversations[testId].lastUpdated = Date.now();
    },

    /**
     * Add an API call to a live test
     */
    addLiveApiCall: (state, action: PayloadAction<{
      testId: string;
      apiCall: ApiCall;
    }>) => {
      const { testId, apiCall } = action.payload;
      if (!state.liveConversations[testId]) {
        state.liveConversations[testId] = {
          transcript: [],
          apiCalls: [],
          isLive: true,
          lastUpdated: Date.now(),
        };
      }
      state.liveConversations[testId].apiCalls.push(apiCall);
      state.liveConversations[testId].lastUpdated = Date.now();
    },

    /**
     * Initialize a live conversation with fetched data (for catching up)
     */
    initializeLiveConversation: (state, action: PayloadAction<{
      testId: string;
      transcript: ConversationTurn[];
      apiCalls: ApiCall[];
    }>) => {
      const { testId, transcript, apiCalls } = action.payload;
      // Only initialize if not already present (avoid overwriting live updates)
      if (!state.liveConversations[testId]) {
        state.liveConversations[testId] = {
          transcript,
          apiCalls,
          isLive: true,
          lastUpdated: Date.now(),
        };
      } else {
        // Merge new data with existing (avoid duplicates by checking timestamps)
        const existing = state.liveConversations[testId];
        const existingTimestamps = new Set(existing.transcript.map(t => t.timestamp));
        const newTurns = transcript.filter(t => !existingTimestamps.has(t.timestamp));
        existing.transcript = [...newTurns, ...existing.transcript].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        existing.lastUpdated = Date.now();
      }
    },

    /**
     * Set the currently selected live test
     */
    setSelectedLiveTestId: (state, action: PayloadAction<string | null>) => {
      state.selectedLiveTestId = action.payload;
    },

    /**
     * Clear live conversation when test completes
     */
    clearLiveConversation: (state, action: PayloadAction<string>) => {
      delete state.liveConversations[action.payload];
    },

    /**
     * Clear all live conversations (on execution complete)
     * Note: Consider using markAllConversationsComplete instead to preserve data
     */
    clearAllLiveConversations: (state) => {
      state.liveConversations = {};
      state.selectedLiveTestId = null;
    },

    /**
     * Mark a live conversation as no longer live (test completed)
     */
    markConversationComplete: (state, action: PayloadAction<string>) => {
      const testId = action.payload;
      if (state.liveConversations[testId]) {
        state.liveConversations[testId].isLive = false;
      }
    },

    /**
     * Mark all live conversations as complete (execution ended)
     * Preserves conversation data so it stays visible after session ends
     */
    markAllConversationsComplete: (state) => {
      for (const testId of Object.keys(state.liveConversations)) {
        state.liveConversations[testId].isLive = false;
      }
    },

    // Running tests tracking actions

    /**
     * Add a running test (from worker-status event)
     */
    addRunningTest: (state, action: PayloadAction<{
      testId: string;
      testName: string;
      runId: string;
    }>) => {
      const { testId, testName, runId } = action.payload;
      state.runningTests[testId] = {
        testId,
        testName,
        runId,
        startedAt: Date.now(),
      };
    },

    /**
     * Remove a running test (when test completes)
     */
    removeRunningTest: (state, action: PayloadAction<string>) => {
      delete state.runningTests[action.payload];
    },

    /**
     * Clear all running tests (on execution complete)
     */
    clearAllRunningTests: (state) => {
      state.runningTests = {};
    },
  },
  extraReducers: (builder) => {
    // Fetch Test Runs
    builder
      .addCase(fetchTestRuns.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestRuns.fulfilled, (state, action) => {
        state.loading = false;
        // Use smart merge to prevent flickering - only update if data actually changed
        state.runs = mergeTestRuns(state.runs, action.payload);
      })
      .addCase(fetchTestRuns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Test Run
    builder
      .addCase(fetchTestRun.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestRun.fulfilled, (state, action) => {
        state.loading = false;
        // Only clear selected test and transcript when switching to a different run
        // This prevents the selected test from being cleared during auto-refresh
        const isNewRun = state.selectedRun?.runId !== action.payload.runId;

        if (isNewRun) {
          // New run selected, replace everything
          state.selectedRun = action.payload;
          state.selectedTest = null;
          state.transcript = [];
          state.apiCalls = [];
        } else {
          // Same run - use smart merge for results to prevent flickering
          const existingResults = state.selectedRun?.results || [];
          const mergedResults = mergeTestResults(existingResults, action.payload.results || []);

          // Only update if something actually changed
          if (mergedResults !== existingResults ||
              state.selectedRun?.status !== action.payload.status ||
              state.selectedRun?.passed !== action.payload.passed ||
              state.selectedRun?.failed !== action.payload.failed) {
            state.selectedRun = {
              ...action.payload,
              results: mergedResults,
            };
          }
        }
      })
      .addCase(fetchTestRun.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Transcript
    builder
      .addCase(fetchTranscript.pending, (state) => {
        state.transcriptLoading = true;
      })
      .addCase(fetchTranscript.fulfilled, (state, action) => {
        state.transcriptLoading = false;
        state.transcript = action.payload;
      })
      .addCase(fetchTranscript.rejected, (state, action) => {
        state.transcriptLoading = false;
        state.error = action.payload as string;
      });

    // Fetch API Calls
    builder
      .addCase(fetchApiCalls.pending, (state) => {
        state.apiCallsLoading = true;
      })
      .addCase(fetchApiCalls.fulfilled, (state, action) => {
        state.apiCallsLoading = false;
        state.apiCalls = action.payload;
      })
      .addCase(fetchApiCalls.rejected, (state, action) => {
        state.apiCallsLoading = false;
        state.error = action.payload as string;
      });

    // Fetch Findings
    builder
      .addCase(fetchFindings.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchFindings.fulfilled, (state, action) => {
        state.loading = false;
        state.findings = action.payload;
      })
      .addCase(fetchFindings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Recommendations
    builder
      .addCase(fetchRecommendations.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.loading = false;
        state.recommendations = action.payload;
      })
      .addCase(fetchRecommendations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Fixes
    builder
      .addCase(fetchFixes.pending, (state) => {
        console.log(`[Fixes:Reducer] fetchFixes.pending - setting fixesLoading=true`);
        state.fixesLoading = true;
      })
      .addCase(fetchFixes.fulfilled, (state, action) => {
        console.log(`[Fixes:Reducer] fetchFixes.fulfilled - received ${action.payload?.length ?? 0} fixes`);
        console.log(`[Fixes:Reducer] Previous fixes count: ${state.fixes.length}`);
        state.fixesLoading = false;
        state.fixes = action.payload;
        console.log(`[Fixes:Reducer] New fixes count: ${state.fixes.length}`);
        console.log(`[Fixes:Reducer] Fix IDs in state:`, state.fixes.map(f => f.fixId));

        // Derive lastResult from loaded fixes so UI shows "Generated X fix(es)" without re-running diagnosis
        // This ensures fixes persist across page reloads
        if (action.payload && action.payload.length > 0) {
          state.diagnosis.lastResult = {
            success: true,
            fixesGenerated: action.payload.length,
            analyzedCount: action.payload.length, // Approximation - actual analyzed may differ
            totalFailures: action.payload.length, // Approximation
          };
          console.log(`[Fixes:Reducer] Set diagnosis.lastResult from loaded fixes: ${action.payload.length} fixes`);
        }
      })
      .addCase(fetchFixes.rejected, (state, action) => {
        console.error(`[Fixes:Reducer] fetchFixes.rejected - error:`, action.payload);
        state.fixesLoading = false;
        state.error = action.payload as string;
      });

    // Update Fix Status
    builder
      .addCase(updateFixStatus.fulfilled, (state, action) => {
        const { fixId, status } = action.payload;
        const fix = state.fixes.find(f => f.fixId === fixId);
        if (fix) {
          fix.status = status;
        }
      })
      .addCase(updateFixStatus.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // ========================================================================
    // PROMPT VERSION MANAGEMENT REDUCERS
    // ========================================================================

    // Fetch Prompt Files
    builder
      .addCase(fetchPromptFiles.pending, (state) => {
        state.promptLoading = true;
      })
      .addCase(fetchPromptFiles.fulfilled, (state, action) => {
        state.promptLoading = false;
        state.promptFiles = action.payload;
      })
      .addCase(fetchPromptFiles.rejected, (state, action) => {
        state.promptLoading = false;
        state.error = action.payload as string;
      });

    // Fetch Prompt Content
    builder
      .addCase(fetchPromptContent.pending, (state) => {
        state.promptLoading = true;
      })
      .addCase(fetchPromptContent.fulfilled, (state, action) => {
        state.promptLoading = false;
        state.promptContent[action.payload.fileKey] = action.payload.content;
      })
      .addCase(fetchPromptContent.rejected, (state, action) => {
        state.promptLoading = false;
        state.error = action.payload as string;
      });

    // Fetch Prompt History
    builder
      .addCase(fetchPromptHistory.pending, (state) => {
        state.promptLoading = true;
      })
      .addCase(fetchPromptHistory.fulfilled, (state, action) => {
        state.promptLoading = false;
        state.promptHistory = action.payload;
      })
      .addCase(fetchPromptHistory.rejected, (state, action) => {
        state.promptLoading = false;
        state.error = action.payload as string;
      });

    // Apply Fix to Prompt
    builder
      .addCase(applyFixToPrompt.pending, (state) => {
        state.promptLoading = true;
      })
      .addCase(applyFixToPrompt.fulfilled, (state, action) => {
        state.promptLoading = false;
        // Update the fix status to 'applied'
        const fix = state.fixes.find(f => f.fixId === action.payload.fixId);
        if (fix) {
          fix.status = 'applied';
        }
        // Update the prompt file version
        const promptFile = state.promptFiles.find(f => f.fileKey === action.payload.fileKey);
        if (promptFile) {
          promptFile.version = action.payload.newVersion;
          promptFile.lastFixId = action.payload.fixId;
          promptFile.updatedAt = new Date().toISOString();
        }
      })
      .addCase(applyFixToPrompt.rejected, (state, action) => {
        state.promptLoading = false;
        state.error = action.payload as string;
      });

    // Apply Batch Fixes
    builder
      .addCase(applyBatchFixes.pending, (state) => {
        state.promptLoading = true;
      })
      .addCase(applyBatchFixes.fulfilled, (state, action) => {
        state.promptLoading = false;
        const { results } = action.payload;

        // Update fix statuses for successful applications
        for (const result of results) {
          if (result.success) {
            const fix = state.fixes.find(f => f.fixId === result.fixId);
            if (fix) {
              fix.status = 'applied';
            }
            // Update prompt file version if we have the file key
            if (result.fileKey && result.newVersion) {
              const promptFile = state.promptFiles.find(f => f.fileKey === result.fileKey);
              if (promptFile) {
                promptFile.version = result.newVersion;
                promptFile.lastFixId = result.fixId;
                promptFile.updatedAt = new Date().toISOString();
              }
            }
          }
        }
      })
      .addCase(applyBatchFixes.rejected, (state, action) => {
        state.promptLoading = false;
        state.error = action.payload as string;
      });

    // ========================================================================
    // DIAGNOSIS REDUCERS
    // ========================================================================

    // Run Diagnosis
    builder
      .addCase(runDiagnosis.pending, (state) => {
        state.diagnosis.isRunning = true;
        state.diagnosis.error = null;
        state.diagnosis.progress = { analyzed: 0, total: 0 };
      })
      .addCase(runDiagnosis.fulfilled, (state, action) => {
        state.diagnosis.isRunning = false;
        state.diagnosis.lastResult = action.payload;
        state.diagnosis.progress = {
          analyzed: action.payload.analyzedCount ?? 0,
          total: action.payload.totalFailures ?? 0,
        };
      })
      .addCase(runDiagnosis.rejected, (state, action) => {
        state.diagnosis.isRunning = false;
        state.diagnosis.error = action.payload as string;
      });

    // ========================================================================
    // VERIFICATION REDUCERS
    // ========================================================================

    // Verify Fixes
    builder
      .addCase(verifyFixes.pending, (state) => {
        state.verification.isRunning = true;
        state.verification.error = null;
      })
      .addCase(verifyFixes.fulfilled, (state, action) => {
        state.verification.isRunning = false;
        state.verification.lastResult = action.payload;

        // Update fix statuses based on verification results
        if (action.payload.overallEffective) {
          for (const fixId of action.payload.fixIds) {
            const fix = state.fixes.find(f => f.fixId === fixId);
            if (fix) {
              // Check if all tests for this fix passed
              const fixResults = action.payload.results.filter(r => r.fixId === fixId);
              const allPassed = fixResults.every(r => r.effective);
              if (allPassed) {
                fix.status = 'verified';
              }
            }
          }
        }
      })
      .addCase(verifyFixes.rejected, (state, action) => {
        state.verification.isRunning = false;
        state.verification.error = action.payload as string;
      });

    // ========================================================================
    // DEPLOYMENT TRACKING REDUCERS (Phase 5: Flowise Sync)
    // ========================================================================

    // Fetch Deployed Versions
    builder
      .addCase(fetchDeployedVersions.pending, (state) => {
        state.deployment.loading = true;
        state.deployment.error = null;
      })
      .addCase(fetchDeployedVersions.fulfilled, (state, action) => {
        state.deployment.loading = false;
        state.deployment.deployedVersions = action.payload;
      })
      .addCase(fetchDeployedVersions.rejected, (state, action) => {
        state.deployment.loading = false;
        state.deployment.error = action.payload as string;
      });

    // Mark Prompt Deployed
    builder
      .addCase(markPromptDeployed.pending, (state) => {
        state.deployment.loading = true;
        state.deployment.error = null;
      })
      .addCase(markPromptDeployed.fulfilled, (state, action) => {
        state.deployment.loading = false;
        state.deployment.deployedVersions[action.payload.fileKey] = action.payload.version;
      })
      .addCase(markPromptDeployed.rejected, (state, action) => {
        state.deployment.loading = false;
        state.deployment.error = action.payload as string;
      });

    // ========================================================================
    // ENVIRONMENT-SPECIFIC PROMPT FILES REDUCERS
    // ========================================================================

    // Fetch Environment Prompt Files
    builder
      .addCase(fetchEnvironmentPromptFiles.pending, (state, action) => {
        const env = action.meta.arg;
        state.environmentPromptStates[env].loading = true;
        state.environmentPromptStates[env].error = null;
      })
      .addCase(fetchEnvironmentPromptFiles.fulfilled, (state, action) => {
        const { environment, files } = action.payload;
        state.environmentPromptStates[environment].loading = false;
        state.environmentPromptStates[environment].files = files;
        // Also update main promptFiles if this is the selected environment
        if (state.selectedEnvironment === environment) {
          state.promptFiles = files;
        }
      })
      .addCase(fetchEnvironmentPromptFiles.rejected, (state, action) => {
        const env = action.meta.arg;
        state.environmentPromptStates[env].loading = false;
        state.environmentPromptStates[env].error = action.payload as string;
      });

    // Fetch Environment Deployed Versions
    builder
      .addCase(fetchEnvironmentDeployedVersions.pending, (state, action) => {
        const env = action.meta.arg;
        state.environmentPromptStates[env].loading = true;
      })
      .addCase(fetchEnvironmentDeployedVersions.fulfilled, (state, action) => {
        const { environment, versions } = action.payload;
        state.environmentPromptStates[environment].loading = false;
        state.environmentPromptStates[environment].deployedVersions = versions;
        // Also update deployment state if this is the selected environment
        if (state.selectedEnvironment === environment) {
          state.deployment.deployedVersions = versions;
        }
      })
      .addCase(fetchEnvironmentDeployedVersions.rejected, (state, action) => {
        const env = action.meta.arg;
        state.environmentPromptStates[env].loading = false;
        state.environmentPromptStates[env].error = action.payload as string;
      });
  },
});

// Export actions
export const {
  clearError,
  setSelectedEnvironment,
  setSelectedTest,
  clearSelectedRun,
  clearAllData,
  // Streaming actions
  startStreaming,
  stopStreaming,
  setStreamError,
  streamRunUpdate,
  streamResultsUpdate,
  streamFindingsUpdate,
  streamTranscriptUpdate,
  streamApiCallsUpdate,
  // Live conversation streaming actions
  addLiveConversationTurn,
  addLiveApiCall,
  initializeLiveConversation,
  setSelectedLiveTestId,
  clearLiveConversation,
  clearAllLiveConversations,
  markConversationComplete,
  markAllConversationsComplete,
  // Running tests tracking actions
  addRunningTest,
  removeRunningTest,
  clearAllRunningTests,
} = testMonitorSlice.actions;

// Selectors
export const selectTestRuns = (state: RootState) => state.testMonitor.runs;
export const selectSelectedRun = (state: RootState) => state.testMonitor.selectedRun;
export const selectSelectedTest = (state: RootState) => state.testMonitor.selectedTest;
export const selectTranscript = (state: RootState) => state.testMonitor.transcript;
export const selectApiCalls = (state: RootState) => state.testMonitor.apiCalls;
export const selectFindings = (state: RootState) => state.testMonitor.findings;
export const selectRecommendations = (state: RootState) => state.testMonitor.recommendations;
export const selectTestMonitorLoading = (state: RootState) => state.testMonitor.loading;
export const selectTranscriptLoading = (state: RootState) => state.testMonitor.transcriptLoading;
export const selectApiCallsLoading = (state: RootState) => state.testMonitor.apiCallsLoading;
export const selectTestMonitorError = (state: RootState) => state.testMonitor.error;
// Streaming selectors
export const selectIsStreaming = (state: RootState) => state.testMonitor.isStreaming;
export const selectStreamError = (state: RootState) => state.testMonitor.streamError;
// Live conversation selectors
export const selectLiveConversations = (state: RootState) => state.testMonitor.liveConversations;
export const selectSelectedLiveTestId = (state: RootState) => state.testMonitor.selectedLiveTestId;
export const selectLiveConversation = (testId: string) => (state: RootState) =>
  state.testMonitor.liveConversations[testId];
export const selectCurrentLiveTranscript = (state: RootState) => {
  const testId = state.testMonitor.selectedLiveTestId;
  if (!testId) return [];
  return state.testMonitor.liveConversations[testId]?.transcript ?? [];
};
export const selectCurrentLiveApiCalls = (state: RootState) => {
  const testId = state.testMonitor.selectedLiveTestId;
  if (!testId) return [];
  return state.testMonitor.liveConversations[testId]?.apiCalls ?? [];
};
// Running tests selectors
export const selectRunningTests = (state: RootState) => state.testMonitor.runningTests;
// Fixes selectors
export const selectFixes = (state: RootState) => state.testMonitor.fixes;
export const selectFixesLoading = (state: RootState) => state.testMonitor.fixesLoading;
export const selectPendingFixes = (state: RootState) => state.testMonitor.fixes.filter(f => f.status === 'pending');
export const selectPromptFixes = (state: RootState) => state.testMonitor.fixes.filter(f => f.type === 'prompt');
export const selectToolFixes = (state: RootState) => state.testMonitor.fixes.filter(f => f.type === 'tool');
// Prompt selectors
export const selectPromptFiles = (state: RootState) => state.testMonitor.promptFiles;
export const selectPromptContent = (state: RootState) => state.testMonitor.promptContent;
export const selectPromptHistory = (state: RootState) => state.testMonitor.promptHistory;
export const selectPromptLoading = (state: RootState) => state.testMonitor.promptLoading;
// Diagnosis selectors
export const selectDiagnosisState = (state: RootState) => state.testMonitor.diagnosis;
export const selectDiagnosisRunning = (state: RootState) => state.testMonitor.diagnosis.isRunning;
export const selectDiagnosisError = (state: RootState) => state.testMonitor.diagnosis.error;
// Verification selectors
export const selectVerificationState = (state: RootState) => state.testMonitor.verification;
export const selectVerificationRunning = (state: RootState) => state.testMonitor.verification.isRunning;
export const selectVerificationResult = (state: RootState) => state.testMonitor.verification.lastResult;
export const selectAppliedFixes = (state: RootState) => state.testMonitor.fixes.filter(f => f.status === 'applied');
// Deployment selectors (Phase 5: Flowise Sync)
export const selectDeploymentState = (state: RootState) => state.testMonitor.deployment;
export const selectDeployedVersions = (state: RootState) => state.testMonitor.deployment.deployedVersions;
export const selectDeploymentLoading = (state: RootState) => state.testMonitor.deployment.loading;
// Environment selectors
export const selectSelectedEnvironment = (state: RootState) => state.testMonitor.selectedEnvironment;
export const selectEnvironmentPromptStates = (state: RootState) => state.testMonitor.environmentPromptStates;
export const selectCurrentEnvironmentPromptFiles = (state: RootState) => {
  const env = state.testMonitor.selectedEnvironment;
  return state.testMonitor.environmentPromptStates[env]?.files ?? state.testMonitor.promptFiles;
};
export const selectCurrentEnvironmentDeployedVersions = (state: RootState) => {
  const env = state.testMonitor.selectedEnvironment;
  return state.testMonitor.environmentPromptStates[env]?.deployedVersions ?? state.testMonitor.deployment.deployedVersions;
};
export const selectEnvironmentLoading = (state: RootState) => {
  const env = state.testMonitor.selectedEnvironment;
  return state.testMonitor.environmentPromptStates[env]?.loading ?? false;
};

// Export reducer
export default testMonitorSlice.reducer;
