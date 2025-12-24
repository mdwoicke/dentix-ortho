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
} from '../../types/testMonitor.types';
import * as testMonitorApi from '../../services/api/testMonitorApi';
import { handleError, logError } from '../../services/utils/errorHandler';

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
  // Prompt version management state
  promptFiles: PromptFile[];
  promptContent: Record<string, string>;
  promptHistory: PromptVersionHistory[];
  promptLoading: boolean;
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
  // Prompt version management state
  promptFiles: [],
  promptContent: {},
  promptHistory: [],
  promptLoading: false,
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
    try {
      const fixes = await testMonitorApi.getFixesForRun(runId);
      return fixes;
    } catch (error) {
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
     * Update results from stream
     */
    streamResultsUpdate: (state, action: PayloadAction<TestResult[]>) => {
      if (state.selectedRun) {
        state.selectedRun.results = action.payload;
      }
    },

    /**
     * Update findings from stream
     */
    streamFindingsUpdate: (state, action: PayloadAction<Finding[]>) => {
      state.findings = action.payload;
    },

    /**
     * Update transcript from stream
     */
    streamTranscriptUpdate: (state, action: PayloadAction<ConversationTurn[]>) => {
      state.transcript = action.payload;
    },

    /**
     * Update API calls from stream
     */
    streamApiCallsUpdate: (state, action: PayloadAction<ApiCall[]>) => {
      state.apiCalls = action.payload;
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
        state.runs = action.payload;
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
        state.selectedRun = action.payload;
        state.selectedTest = null;
        state.transcript = [];
        state.apiCalls = [];
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
        state.fixesLoading = true;
      })
      .addCase(fetchFixes.fulfilled, (state, action) => {
        state.fixesLoading = false;
        state.fixes = action.payload;
      })
      .addCase(fetchFixes.rejected, (state, action) => {
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
  },
});

// Export actions
export const {
  clearError,
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

// Export reducer
export default testMonitorSlice.reducer;
