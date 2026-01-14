/**
 * Sandbox Slice
 * Manages A/B Testing Sandbox state for file management and comparison testing
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  Sandbox,
  SandboxFile,
  SandboxFileHistory,
  SelectedSandbox,
  SandboxFileKey,
  AvailableGoalTest,
  ComparisonResult,
  ComparisonRun,
  ComparisonProgress,
  StartComparisonResponse,
} from '../../types/sandbox.types';
import * as sandboxApi from '../../services/api/sandboxApi';
import { handleError, logError } from '../../services/utils/errorHandler';

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface ComparisonState {
  isRunning: boolean;
  currentComparisonId: string | null;
  progress: ComparisonProgress | null;
  lastResult: ComparisonResult | null;
  // Raw comparison data with full detailed results (for detail panel)
  rawComparisonData: {
    productionResults: Record<string, any>;
    sandboxAResults: Record<string, any>;
    sandboxBResults: Record<string, any>;
  } | null;
  // Selected test ID for detail panel
  selectedDetailTestId: string | null;
  history: ComparisonRun[];
  availableTests: AvailableGoalTest[];
  selectedTestIds: string[];
  error: string | null;
}

interface SandboxState {
  // Sandbox configurations
  sandboxes: Sandbox[];
  sandboxesLoading: boolean;
  sandboxesError: string | null;

  // Selected sandbox
  selectedSandbox: SelectedSandbox;

  // Files for the selected sandbox
  files: Record<SelectedSandbox, SandboxFile[]>;
  filesLoading: boolean;
  filesError: string | null;

  // Currently selected file for editing
  selectedFileKey: SandboxFileKey | null;

  // File history
  fileHistory: SandboxFileHistory[];
  fileHistoryLoading: boolean;

  // Comparison state
  comparison: ComparisonState;

  // UI state
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  editedContent: string;

  // General error
  error: string | null;
}

const initialState: SandboxState = {
  // Sandbox configurations
  sandboxes: [],
  sandboxesLoading: false,
  sandboxesError: null,

  // Selected sandbox
  selectedSandbox: 'sandbox_a',

  // Files for each sandbox
  files: {
    sandbox_a: [],
    sandbox_b: [],
  },
  filesLoading: false,
  filesError: null,

  // Currently selected file
  selectedFileKey: null,

  // File history
  fileHistory: [],
  fileHistoryLoading: false,

  // Comparison state
  comparison: {
    isRunning: false,
    currentComparisonId: null,
    progress: null,
    lastResult: null,
    rawComparisonData: null,
    selectedDetailTestId: null,
    history: [],
    availableTests: [],
    selectedTestIds: [],
    error: null,
  },

  // UI state
  isEditing: false,
  hasUnsavedChanges: false,
  editedContent: '',

  // General error
  error: null,
};

// ============================================================================
// ASYNC THUNKS - SANDBOX MANAGEMENT
// ============================================================================

/**
 * Fetch all sandboxes
 */
export const fetchSandboxes = createAsyncThunk(
  'sandbox/fetchSandboxes',
  async (_, { rejectWithValue }) => {
    try {
      const sandboxes = await sandboxApi.getSandboxes();
      return sandboxes;
    } catch (error) {
      logError(error, 'fetchSandboxes');
      const formattedError = handleError(error, 'Failed to fetch sandboxes');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Update sandbox configuration
 */
export const updateSandbox = createAsyncThunk(
  'sandbox/updateSandbox',
  async (
    { sandboxId, updates }: {
      sandboxId: string;
      updates: Partial<{
        name: string;
        description: string;
        flowiseEndpoint: string;
        flowiseApiKey: string;
        langfuseHost: string;
        langfusePublicKey: string;
        langfuseSecretKey: string;
      }>
    },
    { rejectWithValue }
  ) => {
    try {
      const sandbox = await sandboxApi.updateSandbox(sandboxId, updates);
      return sandbox;
    } catch (error) {
      logError(error, 'updateSandbox');
      const formattedError = handleError(error, 'Failed to update sandbox');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// ASYNC THUNKS - FILE MANAGEMENT
// ============================================================================

/**
 * Fetch files for a sandbox
 */
export const fetchSandboxFiles = createAsyncThunk(
  'sandbox/fetchSandboxFiles',
  async (sandboxId: SelectedSandbox, { rejectWithValue }) => {
    try {
      const files = await sandboxApi.getSandboxFiles(sandboxId);
      return { sandboxId, files };
    } catch (error) {
      logError(error, 'fetchSandboxFiles');
      const formattedError = handleError(error, 'Failed to fetch sandbox files');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch file history
 */
export const fetchFileHistory = createAsyncThunk(
  'sandbox/fetchFileHistory',
  async (
    { sandboxId, fileKey }: { sandboxId: string; fileKey: string },
    { rejectWithValue }
  ) => {
    try {
      const history = await sandboxApi.getSandboxFileHistory(sandboxId, fileKey);
      return history;
    } catch (error) {
      logError(error, 'fetchFileHistory');
      const formattedError = handleError(error, 'Failed to fetch file history');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Save sandbox file
 */
export const saveSandboxFile = createAsyncThunk(
  'sandbox/saveSandboxFile',
  async (
    { sandboxId, fileKey, content, changeDescription }:
    { sandboxId: string; fileKey: string; content: string; changeDescription: string },
    { rejectWithValue }
  ) => {
    try {
      const result = await sandboxApi.saveSandboxFile(sandboxId, fileKey, content, changeDescription);
      return { sandboxId, fileKey, newVersion: result.newVersion, content };
    } catch (error) {
      logError(error, 'saveSandboxFile');
      const formattedError = handleError(error, 'Failed to save file');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Copy file from production
 */
export const copyFileFromProduction = createAsyncThunk(
  'sandbox/copyFileFromProduction',
  async (
    { sandboxId, fileKey }: { sandboxId: string; fileKey: string },
    { rejectWithValue }
  ) => {
    try {
      const result = await sandboxApi.copySandboxFileFromProduction(sandboxId, fileKey);
      return { sandboxId, file: result.file };
    } catch (error) {
      logError(error, 'copyFileFromProduction');
      const formattedError = handleError(error, 'Failed to copy file from production');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Copy all files from production
 */
export const copyAllFromProduction = createAsyncThunk(
  'sandbox/copyAllFromProduction',
  async (sandboxId: string, { rejectWithValue, dispatch }) => {
    try {
      const result = await sandboxApi.copySandboxAllFromProduction(sandboxId);
      // Refresh the files after copying
      dispatch(fetchSandboxFiles(sandboxId as SelectedSandbox));
      return { sandboxId, filesReset: result.filesReset };
    } catch (error) {
      logError(error, 'copyAllFromProduction');
      const formattedError = handleError(error, 'Failed to copy files from production');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Rollback file to previous version
 */
export const rollbackFile = createAsyncThunk(
  'sandbox/rollbackFile',
  async (
    { sandboxId, fileKey, targetVersion }: { sandboxId: string; fileKey: string; targetVersion: number },
    { rejectWithValue, dispatch }
  ) => {
    try {
      const result = await sandboxApi.rollbackSandboxFile(sandboxId, fileKey, targetVersion);
      // Refresh the files after rollback
      dispatch(fetchSandboxFiles(sandboxId as SelectedSandbox));
      return { sandboxId, fileKey, newVersion: result.newVersion };
    } catch (error) {
      logError(error, 'rollbackFile');
      const formattedError = handleError(error, 'Failed to rollback file');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Reset sandbox to production
 */
export const resetSandbox = createAsyncThunk(
  'sandbox/resetSandbox',
  async (sandboxId: string, { rejectWithValue, dispatch }) => {
    try {
      const result = await sandboxApi.resetSandbox(sandboxId);
      // Refresh the files after reset
      dispatch(fetchSandboxFiles(sandboxId as SelectedSandbox));
      return { sandboxId, filesReset: result.filesReset };
    } catch (error) {
      logError(error, 'resetSandbox');
      const formattedError = handleError(error, 'Failed to reset sandbox');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

const COMPARISON_STORAGE_KEY = 'sandbox_running_comparison';

/**
 * Save running comparison ID to localStorage
 */
function saveRunningComparisonId(comparisonId: string | null): void {
  if (comparisonId) {
    localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify({
      comparisonId,
      startedAt: new Date().toISOString(),
    }));
  } else {
    localStorage.removeItem(COMPARISON_STORAGE_KEY);
  }
}

/**
 * Get running comparison ID from localStorage
 */
function getRunningComparisonId(): { comparisonId: string; startedAt: string } | null {
  try {
    const stored = localStorage.getItem(COMPARISON_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// ============================================================================
// ASYNC THUNKS - COMPARISON
// ============================================================================

/**
 * Check for running comparison on page load (persist state across refresh)
 */
export const checkForRunningComparison = createAsyncThunk(
  'sandbox/checkForRunningComparison',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const stored = getRunningComparisonId();
      if (!stored) return null;

      // Check if this comparison still exists and is running
      const run = await sandboxApi.getComparisonRun(stored.comparisonId);

      if (run.status === 'running') {
        // Resume polling
        dispatch(pollComparisonStatus(stored.comparisonId));
        return run;
      } else {
        // Completed or failed - clear storage and return the result
        saveRunningComparisonId(null);
        return run;
      }
    } catch (error) {
      // Comparison not found, clear storage
      saveRunningComparisonId(null);
      return null;
    }
  }
);

/**
 * Fetch available tests for comparison
 */
export const fetchAvailableTests = createAsyncThunk(
  'sandbox/fetchAvailableTests',
  async (_, { rejectWithValue }) => {
    try {
      const tests = await sandboxApi.getComparisonTests();
      return tests;
    } catch (error) {
      logError(error, 'fetchAvailableTests');
      const formattedError = handleError(error, 'Failed to fetch available tests');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Start comparison run (async - returns immediately, then polls for results)
 */
export const startComparison = createAsyncThunk(
  'sandbox/startComparison',
  async (
    request: { testIds: string[]; runProduction: boolean; runSandboxA: boolean; runSandboxB: boolean; name?: string },
    { dispatch, rejectWithValue }
  ) => {
    try {
      // API now returns immediately with { comparisonId, status: 'running' }
      const result = await sandboxApi.startComparison(request);

      // Save to localStorage for persistence across page refresh
      if (result.comparisonId) {
        saveRunningComparisonId(result.comparisonId);
        // Start polling for status updates
        dispatch(pollComparisonStatus(result.comparisonId));
      }

      return result;
    } catch (error) {
      logError(error, 'startComparison');
      const formattedError = handleError(error, 'Failed to start comparison');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Poll comparison status until completion
 */
export const pollComparisonStatus = createAsyncThunk(
  'sandbox/pollComparisonStatus',
  async (comparisonId: string, { dispatch, rejectWithValue }) => {
    const POLL_INTERVAL = 3000; // 3 seconds
    const MAX_POLLS = 200; // ~10 minutes max

    let pollCount = 0;

    const poll = async (): Promise<ComparisonResult> => {
      try {
        const run = await sandboxApi.getComparisonRun(comparisonId);

        // Dispatch intermediate update
        dispatch(updatePollingResult(run));

        // Check if completed or failed
        if (run.status === 'completed' || run.status === 'failed') {
          // Clear localStorage on completion
          saveRunningComparisonId(null);
          return run as ComparisonResult;
        }

        // Continue polling if still running
        pollCount++;
        if (pollCount >= MAX_POLLS) {
          saveRunningComparisonId(null);
          throw new Error('Comparison timed out after maximum polling attempts');
        }

        // Wait and poll again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        return poll();
      } catch (error) {
        saveRunningComparisonId(null);
        throw error;
      }
    };

    try {
      const finalResult = await poll();
      return finalResult;
    } catch (error) {
      logError(error, 'pollComparisonStatus');
      const formattedError = handleError(error, 'Failed to poll comparison status');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch comparison run by ID
 */
export const fetchComparisonRun = createAsyncThunk(
  'sandbox/fetchComparisonRun',
  async (comparisonId: string, { rejectWithValue }) => {
    try {
      const run = await sandboxApi.getComparisonRun(comparisonId);
      return run;
    } catch (error) {
      logError(error, 'fetchComparisonRun');
      const formattedError = handleError(error, 'Failed to fetch comparison run');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch comparison history and auto-load the most recent completed comparison details
 */
export const fetchComparisonHistory = createAsyncThunk(
  'sandbox/fetchComparisonHistory',
  async (limit: number = 20, { rejectWithValue, dispatch, getState }) => {
    try {
      const history = await sandboxApi.getComparisonHistory(limit);

      // Auto-fetch full details of most recent completed comparison if no lastResult is set
      const state = getState() as { sandbox: SandboxState };
      if (!state.sandbox.comparison.lastResult && !state.sandbox.comparison.isRunning) {
        const recentCompleted = history.find(
          (run: ComparisonRun) => run.status === 'completed' && run.summary
        );
        if (recentCompleted) {
          // Dispatch fetchComparisonRun to get full details
          dispatch(fetchComparisonRun(recentCompleted.comparisonId));
        }
      }

      return history;
    } catch (error) {
      logError(error, 'fetchComparisonHistory');
      const formattedError = handleError(error, 'Failed to fetch comparison history');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// SLICE
// ============================================================================

export const sandboxSlice = createSlice({
  name: 'sandbox',
  initialState,
  reducers: {
    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
      state.sandboxesError = null;
      state.filesError = null;
      state.comparison.error = null;
    },

    /**
     * Select a sandbox (A or B)
     */
    selectSandbox: (state, action: PayloadAction<SelectedSandbox>) => {
      state.selectedSandbox = action.payload;
      state.selectedFileKey = null;
      state.isEditing = false;
      state.hasUnsavedChanges = false;
      state.editedContent = '';
      state.fileHistory = [];
    },

    /**
     * Select a file for editing
     */
    selectFile: (state, action: PayloadAction<SandboxFileKey | null>) => {
      state.selectedFileKey = action.payload;
      state.isEditing = false;
      state.hasUnsavedChanges = false;
      state.fileHistory = [];

      // Set edited content to current file content
      if (action.payload) {
        const files = state.files[state.selectedSandbox];
        const file = files.find(f => f.fileKey === action.payload);
        state.editedContent = file?.content || '';
      } else {
        state.editedContent = '';
      }
    },

    /**
     * Start editing a file
     */
    startEditing: (state) => {
      state.isEditing = true;
    },

    /**
     * Cancel editing
     */
    cancelEditing: (state) => {
      state.isEditing = false;
      state.hasUnsavedChanges = false;

      // Reset edited content to current file content
      if (state.selectedFileKey) {
        const files = state.files[state.selectedSandbox];
        const file = files.find(f => f.fileKey === state.selectedFileKey);
        state.editedContent = file?.content || '';
      }
    },

    /**
     * Update edited content
     */
    setEditedContent: (state, action: PayloadAction<string>) => {
      state.editedContent = action.payload;

      // Check if content has changed
      if (state.selectedFileKey) {
        const files = state.files[state.selectedSandbox];
        const file = files.find(f => f.fileKey === state.selectedFileKey);
        state.hasUnsavedChanges = file?.content !== action.payload;
      }
    },

    /**
     * Toggle test selection for comparison
     */
    toggleTestSelection: (state, action: PayloadAction<string>) => {
      const testId = action.payload;
      const index = state.comparison.selectedTestIds.indexOf(testId);
      if (index >= 0) {
        state.comparison.selectedTestIds.splice(index, 1);
      } else {
        state.comparison.selectedTestIds.push(testId);
      }
    },

    /**
     * Select all tests
     */
    selectAllTests: (state) => {
      state.comparison.selectedTestIds = state.comparison.availableTests.map(t => t.id);
    },

    /**
     * Deselect all tests
     */
    deselectAllTests: (state) => {
      state.comparison.selectedTestIds = [];
    },

    /**
     * Update comparison progress
     */
    updateComparisonProgress: (state, action: PayloadAction<ComparisonProgress>) => {
      state.comparison.progress = action.payload;
    },

    /**
     * Clear comparison state
     */
    clearComparison: (state) => {
      state.comparison.isRunning = false;
      state.comparison.currentComparisonId = null;
      state.comparison.progress = null;
      state.comparison.lastResult = null;
      state.comparison.rawComparisonData = null;
      state.comparison.selectedDetailTestId = null;
      state.comparison.error = null;
    },

    /**
     * Select a test for detail view
     */
    selectDetailTest: (state, action: PayloadAction<string>) => {
      state.comparison.selectedDetailTestId = action.payload;
    },

    /**
     * Clear detail test selection (close detail panel)
     */
    clearDetailTest: (state) => {
      state.comparison.selectedDetailTestId = null;
    },

    /**
     * Update comparison result from polling (intermediate updates)
     */
    updatePollingResult: (state, action: PayloadAction<ComparisonResult>) => {
      state.comparison.currentComparisonId = action.payload.comparisonId;

      // Build testResults from raw results if available
      const run = action.payload as any;
      if (run.productionResults || run.sandboxAResults || run.sandboxBResults) {
        // Get all test IDs from raw results
        const testIds = new Set<string>([
          ...Object.keys(run.productionResults || {}),
          ...Object.keys(run.sandboxAResults || {}),
          ...Object.keys(run.sandboxBResults || {}),
        ]);

        // Build testResults with ranAt timestamps
        const testResults = Array.from(testIds).map(testId => {
          const prod = run.productionResults?.[testId];
          const sandA = run.sandboxAResults?.[testId];
          const sandB = run.sandboxBResults?.[testId];
          return {
            testId,
            production: prod ? {
              passed: prod.passed,
              turnCount: prod.turnCount,
              durationMs: prod.durationMs,
              ranAt: prod.ranAt,
            } : null,
            sandboxA: sandA ? {
              passed: sandA.passed,
              turnCount: sandA.turnCount,
              durationMs: sandA.durationMs,
              ranAt: sandA.ranAt,
            } : null,
            sandboxB: sandB ? {
              passed: sandB.passed,
              turnCount: sandB.turnCount,
              durationMs: sandB.durationMs,
              ranAt: sandB.ranAt,
            } : null,
          };
        });

        // Update lastResult with built testResults and timestamps
        state.comparison.lastResult = {
          ...action.payload,
          testResults,
          completedAt: run.completedAt,
          startedAt: run.startedAt,
        };

        // Also update rawComparisonData
        state.comparison.rawComparisonData = {
          productionResults: run.productionResults || {},
          sandboxAResults: run.sandboxAResults || {},
          sandboxBResults: run.sandboxBResults || {},
        };
      } else {
        // No raw results yet, just update with payload
        state.comparison.lastResult = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    // ========================================================================
    // SANDBOX MANAGEMENT REDUCERS
    // ========================================================================

    // Fetch Sandboxes
    builder
      .addCase(fetchSandboxes.pending, (state) => {
        state.sandboxesLoading = true;
        state.sandboxesError = null;
      })
      .addCase(fetchSandboxes.fulfilled, (state, action) => {
        state.sandboxesLoading = false;
        state.sandboxes = action.payload;
      })
      .addCase(fetchSandboxes.rejected, (state, action) => {
        state.sandboxesLoading = false;
        state.sandboxesError = action.payload as string;
      });

    // Update Sandbox
    builder
      .addCase(updateSandbox.pending, (state) => {
        state.sandboxesLoading = true;
      })
      .addCase(updateSandbox.fulfilled, (state, action) => {
        state.sandboxesLoading = false;
        const index = state.sandboxes.findIndex(s => s.sandboxId === action.payload.sandboxId);
        if (index >= 0) {
          state.sandboxes[index] = action.payload;
        }
      })
      .addCase(updateSandbox.rejected, (state, action) => {
        state.sandboxesLoading = false;
        state.error = action.payload as string;
      });

    // ========================================================================
    // FILE MANAGEMENT REDUCERS
    // ========================================================================

    // Fetch Sandbox Files
    builder
      .addCase(fetchSandboxFiles.pending, (state) => {
        state.filesLoading = true;
        state.filesError = null;
      })
      .addCase(fetchSandboxFiles.fulfilled, (state, action) => {
        state.filesLoading = false;
        state.files[action.payload.sandboxId] = action.payload.files;
      })
      .addCase(fetchSandboxFiles.rejected, (state, action) => {
        state.filesLoading = false;
        state.filesError = action.payload as string;
      });

    // Fetch File History
    builder
      .addCase(fetchFileHistory.pending, (state) => {
        state.fileHistoryLoading = true;
      })
      .addCase(fetchFileHistory.fulfilled, (state, action) => {
        state.fileHistoryLoading = false;
        state.fileHistory = action.payload;
      })
      .addCase(fetchFileHistory.rejected, (state, action) => {
        state.fileHistoryLoading = false;
        state.error = action.payload as string;
      });

    // Save Sandbox File
    builder
      .addCase(saveSandboxFile.pending, (state) => {
        state.filesLoading = true;
      })
      .addCase(saveSandboxFile.fulfilled, (state, action) => {
        state.filesLoading = false;
        state.isEditing = false;
        state.hasUnsavedChanges = false;

        // Update the file in state
        const sandboxId = action.payload.sandboxId as SelectedSandbox;
        const files = state.files[sandboxId];
        const fileIndex = files.findIndex(f => f.fileKey === action.payload.fileKey);
        if (fileIndex >= 0) {
          files[fileIndex].content = action.payload.content;
          files[fileIndex].version = action.payload.newVersion;
          files[fileIndex].updatedAt = new Date().toISOString();
        }
      })
      .addCase(saveSandboxFile.rejected, (state, action) => {
        state.filesLoading = false;
        state.error = action.payload as string;
      });

    // Copy File From Production
    builder
      .addCase(copyFileFromProduction.pending, (state) => {
        state.filesLoading = true;
      })
      .addCase(copyFileFromProduction.fulfilled, (state, action) => {
        state.filesLoading = false;

        // Update the file in state
        const sandboxId = action.payload.sandboxId as SelectedSandbox;
        const files = state.files[sandboxId];
        const fileIndex = files.findIndex(f => f.fileKey === action.payload.file.fileKey);
        if (fileIndex >= 0) {
          files[fileIndex] = action.payload.file;
        } else {
          files.push(action.payload.file);
        }

        // Update edited content if this is the selected file
        if (state.selectedFileKey === action.payload.file.fileKey) {
          state.editedContent = action.payload.file.content;
          state.hasUnsavedChanges = false;
        }
      })
      .addCase(copyFileFromProduction.rejected, (state, action) => {
        state.filesLoading = false;
        state.error = action.payload as string;
      });

    // Copy All From Production
    builder
      .addCase(copyAllFromProduction.pending, (state) => {
        state.filesLoading = true;
      })
      .addCase(copyAllFromProduction.fulfilled, (state) => {
        state.filesLoading = false;
        state.hasUnsavedChanges = false;
      })
      .addCase(copyAllFromProduction.rejected, (state, action) => {
        state.filesLoading = false;
        state.error = action.payload as string;
      });

    // Rollback File
    builder
      .addCase(rollbackFile.pending, (state) => {
        state.filesLoading = true;
      })
      .addCase(rollbackFile.fulfilled, (state) => {
        state.filesLoading = false;
        state.hasUnsavedChanges = false;
      })
      .addCase(rollbackFile.rejected, (state, action) => {
        state.filesLoading = false;
        state.error = action.payload as string;
      });

    // Reset Sandbox
    builder
      .addCase(resetSandbox.pending, (state) => {
        state.filesLoading = true;
      })
      .addCase(resetSandbox.fulfilled, (state) => {
        state.filesLoading = false;
        state.hasUnsavedChanges = false;
        state.editedContent = '';
        state.selectedFileKey = null;
      })
      .addCase(resetSandbox.rejected, (state, action) => {
        state.filesLoading = false;
        state.error = action.payload as string;
      });

    // ========================================================================
    // COMPARISON REDUCERS
    // ========================================================================

    // Fetch Available Tests
    builder
      .addCase(fetchAvailableTests.pending, (state) => {
        state.comparison.error = null;
      })
      .addCase(fetchAvailableTests.fulfilled, (state, action) => {
        state.comparison.availableTests = action.payload;
      })
      .addCase(fetchAvailableTests.rejected, (state, action) => {
        state.comparison.error = action.payload as string;
      });

    // Check for running comparison on page load
    builder
      .addCase(checkForRunningComparison.pending, (state) => {
        state.comparison.error = null;
      })
      .addCase(checkForRunningComparison.fulfilled, (state, action) => {
        if (action.payload) {
          const run = action.payload as any;
          state.comparison.currentComparisonId = run.comparisonId;

          if (run.status === 'running') {
            // Comparison is still running - restore running state
            state.comparison.isRunning = true;
            state.comparison.lastResult = {
              comparisonId: run.comparisonId,
              status: 'running',
              testResults: [],
              summary: {
                productionPassRate: 0,
                sandboxAPassRate: 0,
                sandboxBPassRate: 0,
                totalTests: 0,
                improvements: [],
                regressions: [],
              },
              message: 'Comparison resumed after page refresh...',
            };
          } else if (run.status === 'completed' && run.summary) {
            // Load completed comparison results
            const testIds = new Set<string>([
              ...Object.keys(run.productionResults || {}),
              ...Object.keys(run.sandboxAResults || {}),
              ...Object.keys(run.sandboxBResults || {}),
            ]);

            const testResults = Array.from(testIds).map(testId => {
              const prod = run.productionResults?.[testId];
              const sandA = run.sandboxAResults?.[testId];
              const sandB = run.sandboxBResults?.[testId];
              return {
                testId,
                production: prod ? {
                  passed: prod.passed,
                  turnCount: prod.turnCount,
                  durationMs: prod.durationMs,
                  ranAt: prod.ranAt,
                } : null,
                sandboxA: sandA ? {
                  passed: sandA.passed,
                  turnCount: sandA.turnCount,
                  durationMs: sandA.durationMs,
                  ranAt: sandA.ranAt,
                } : null,
                sandboxB: sandB ? {
                  passed: sandB.passed,
                  turnCount: sandB.turnCount,
                  durationMs: sandB.durationMs,
                  ranAt: sandB.ranAt,
                } : null,
              };
            });

            state.comparison.lastResult = {
              comparisonId: run.comparisonId,
              status: run.status,
              testResults,
              summary: run.summary,
              completedAt: run.completedAt,
              startedAt: run.startedAt,
            };

            state.comparison.rawComparisonData = {
              productionResults: run.productionResults || {},
              sandboxAResults: run.sandboxAResults || {},
              sandboxBResults: run.sandboxBResults || {},
            };
          }
        }
      })
      .addCase(checkForRunningComparison.rejected, (state) => {
        // Silently ignore errors - just means no running comparison
      });

    // Start Comparison (now async - keeps running until polling completes)
    builder
      .addCase(startComparison.pending, (state) => {
        state.comparison.isRunning = true;
        state.comparison.error = null;
        state.comparison.progress = null;
        state.comparison.lastResult = null;
      })
      .addCase(startComparison.fulfilled, (state, action) => {
        // Keep isRunning = true since polling will continue in background
        state.comparison.currentComparisonId = action.payload.comparisonId;
        // Set initial result with 'running' status
        state.comparison.lastResult = {
          comparisonId: action.payload.comparisonId,
          status: 'running' as const,
          testResults: [],
          summary: {
            productionPassRate: 0,
            sandboxAPassRate: 0,
            sandboxBPassRate: 0,
            totalTests: 0,
            improvements: [],
            regressions: [],
          },
          message: action.payload.message,
        };
      })
      .addCase(startComparison.rejected, (state, action) => {
        state.comparison.isRunning = false;
        state.comparison.error = action.payload as string;
      });

    // Poll Comparison Status (handles completion)
    builder
      .addCase(pollComparisonStatus.fulfilled, (state, action) => {
        state.comparison.isRunning = false;
        state.comparison.currentComparisonId = action.payload.comparisonId;

        // Build testResults from raw results
        const run = action.payload as any;
        if (run.productionResults || run.sandboxAResults || run.sandboxBResults) {
          // Get all test IDs from raw results
          const testIds = new Set<string>([
            ...Object.keys(run.productionResults || {}),
            ...Object.keys(run.sandboxAResults || {}),
            ...Object.keys(run.sandboxBResults || {}),
          ]);

          // Build testResults with ranAt timestamps
          const testResults = Array.from(testIds).map(testId => {
            const prod = run.productionResults?.[testId];
            const sandA = run.sandboxAResults?.[testId];
            const sandB = run.sandboxBResults?.[testId];
            return {
              testId,
              production: prod ? {
                passed: prod.passed,
                turnCount: prod.turnCount,
                durationMs: prod.durationMs,
                ranAt: prod.ranAt,
              } : null,
              sandboxA: sandA ? {
                passed: sandA.passed,
                turnCount: sandA.turnCount,
                durationMs: sandA.durationMs,
                ranAt: sandA.ranAt,
              } : null,
              sandboxB: sandB ? {
                passed: sandB.passed,
                turnCount: sandB.turnCount,
                durationMs: sandB.durationMs,
                ranAt: sandB.ranAt,
              } : null,
            };
          });

          // Update lastResult with built testResults and timestamps
          state.comparison.lastResult = {
            ...action.payload,
            testResults,
            completedAt: run.completedAt,
            startedAt: run.startedAt,
          };

          // Also populate rawComparisonData for detail panel
          state.comparison.rawComparisonData = {
            productionResults: run.productionResults || {},
            sandboxAResults: run.sandboxAResults || {},
            sandboxBResults: run.sandboxBResults || {},
          };
        } else {
          state.comparison.lastResult = action.payload;
        }
      })
      .addCase(pollComparisonStatus.rejected, (state, action) => {
        state.comparison.isRunning = false;
        state.comparison.error = action.payload as string;
      });

    // Fetch Comparison Run
    builder
      .addCase(fetchComparisonRun.fulfilled, (state, action) => {
        const run = action.payload;

        // Update history if this run exists
        const index = state.comparison.history.findIndex(
          r => r.comparisonId === run.comparisonId
        );
        if (index >= 0) {
          state.comparison.history[index] = run;
        }

        // Also set lastResult if this is a completed comparison
        if (run.status === 'completed' && run.summary) {
          // Get all test IDs from the results
          const testIds = new Set<string>([
            ...Object.keys(run.productionResults || {}),
            ...Object.keys(run.sandboxAResults || {}),
            ...Object.keys(run.sandboxBResults || {}),
          ]);

          // Build testResults with ranAt timestamps
          const testResults = Array.from(testIds).map(testId => {
            const prod = run.productionResults?.[testId];
            const sandA = run.sandboxAResults?.[testId];
            const sandB = run.sandboxBResults?.[testId];
            return {
              testId,
              production: prod ? {
                passed: prod.passed,
                turnCount: prod.turnCount,
                durationMs: prod.durationMs,
                ranAt: prod.ranAt,
              } : null,
              sandboxA: sandA ? {
                passed: sandA.passed,
                turnCount: sandA.turnCount,
                durationMs: sandA.durationMs,
                ranAt: sandA.ranAt,
              } : null,
              sandboxB: sandB ? {
                passed: sandB.passed,
                turnCount: sandB.turnCount,
                durationMs: sandB.durationMs,
                ranAt: sandB.ranAt,
              } : null,
            };
          });

          state.comparison.lastResult = {
            comparisonId: run.comparisonId,
            status: run.status,
            testResults,
            summary: run.summary,
            completedAt: run.completedAt,
            startedAt: run.startedAt,
          };

          // Store raw comparison data for detail panel
          state.comparison.rawComparisonData = {
            productionResults: run.productionResults || {},
            sandboxAResults: run.sandboxAResults || {},
            sandboxBResults: run.sandboxBResults || {},
          };
        }
      })
      .addCase(fetchComparisonRun.rejected, (state, action) => {
        state.comparison.error = action.payload as string;
      });

    // Fetch Comparison History
    builder
      .addCase(fetchComparisonHistory.fulfilled, (state, action) => {
        state.comparison.history = action.payload;
        // Note: Full comparison details are fetched via fetchComparisonRun dispatched in the thunk
      })
      .addCase(fetchComparisonHistory.rejected, (state, action) => {
        state.comparison.error = action.payload as string;
      });
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

// Export actions
export const {
  clearError,
  selectSandbox,
  selectFile,
  startEditing,
  cancelEditing,
  setEditedContent,
  toggleTestSelection,
  selectAllTests,
  deselectAllTests,
  updateComparisonProgress,
  clearComparison,
  selectDetailTest,
  clearDetailTest,
  updatePollingResult,
} = sandboxSlice.actions;

// ============================================================================
// SELECTORS
// ============================================================================

// Sandbox selectors
export const selectSandboxes = (state: RootState) => state.sandbox.sandboxes;
export const selectSandboxesLoading = (state: RootState) => state.sandbox.sandboxesLoading;
export const selectCurrentSandbox = (state: RootState) => state.sandbox.selectedSandbox;
export const selectCurrentSandboxConfig = (state: RootState) =>
  state.sandbox.sandboxes.find(s => s.sandboxId === state.sandbox.selectedSandbox);

// File selectors
export const selectSandboxFiles = (state: RootState) =>
  state.sandbox.files[state.sandbox.selectedSandbox];
export const selectFilesLoading = (state: RootState) => state.sandbox.filesLoading;
export const selectSelectedFileKey = (state: RootState) => state.sandbox.selectedFileKey;
export const selectSelectedFile = (state: RootState) => {
  const files = state.sandbox.files[state.sandbox.selectedSandbox];
  return files.find(f => f.fileKey === state.sandbox.selectedFileKey);
};
export const selectFileHistory = (state: RootState) => state.sandbox.fileHistory;
export const selectFileHistoryLoading = (state: RootState) => state.sandbox.fileHistoryLoading;

// Editing selectors
export const selectIsEditing = (state: RootState) => state.sandbox.isEditing;
export const selectHasUnsavedChanges = (state: RootState) => state.sandbox.hasUnsavedChanges;
export const selectEditedContent = (state: RootState) => state.sandbox.editedContent;

// Comparison selectors
export const selectComparisonState = (state: RootState) => state.sandbox.comparison;
export const selectComparisonRunning = (state: RootState) => state.sandbox.comparison.isRunning;
export const selectComparisonProgress = (state: RootState) => state.sandbox.comparison.progress;
export const selectComparisonResult = (state: RootState) => state.sandbox.comparison.lastResult;
export const selectComparisonHistory = (state: RootState) => state.sandbox.comparison.history;
export const selectAvailableTests = (state: RootState) => state.sandbox.comparison.availableTests;
export const selectSelectedTestIds = (state: RootState) => state.sandbox.comparison.selectedTestIds;
export const selectComparisonError = (state: RootState) => state.sandbox.comparison.error;

// Detail panel selectors
export const selectRawComparisonData = (state: RootState) => state.sandbox.comparison.rawComparisonData;
export const selectSelectedDetailTestId = (state: RootState) => state.sandbox.comparison.selectedDetailTestId;
export const selectDetailPanelData = (state: RootState) => {
  const testId = state.sandbox.comparison.selectedDetailTestId;
  const rawData = state.sandbox.comparison.rawComparisonData;

  if (!testId || !rawData) return null;

  return {
    testId,
    production: rawData.productionResults[testId] || null,
    sandboxA: rawData.sandboxAResults[testId] || null,
    sandboxB: rawData.sandboxBResults[testId] || null,
  };
};

// Error selectors
export const selectSandboxError = (state: RootState) => state.sandbox.error;

// Export reducer
export default sandboxSlice.reducer;
