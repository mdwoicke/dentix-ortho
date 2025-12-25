/**
 * Test Execution Slice
 * Manages test execution configuration and real-time status
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  TestScenario,
  ExecutionConfig,
  WorkerStatus,
  ExecutionProgress,
  StartExecutionRequest,
} from '../../types/testMonitor.types';
import { handleError, logError } from '../../services/utils/errorHandler';

interface TestExecutionState {
  // Configuration
  selectedCategories: string[];
  selectedScenarios: string[];
  config: ExecutionConfig;

  // Available scenarios
  availableScenarios: TestScenario[];
  scenariosLoading: boolean;
  scenariosByCategory: {
    'happy-path': TestScenario[];
    'edge-case': TestScenario[];
    'error-handling': TestScenario[];
  };

  // Execution state
  isExecuting: boolean;
  isPaused: boolean;
  currentRunId: string | null;
  workers: WorkerStatus[];
  progress: ExecutionProgress;

  // Errors
  error: string | null;
}

const defaultConfig: ExecutionConfig = {
  concurrency: 1,
  retryFailed: false,
  timeoutMs: 60000,
  enableSemanticEval: true,
};

const initialState: TestExecutionState = {
  // Configuration
  selectedCategories: ['happy-path'],
  selectedScenarios: [],
  config: defaultConfig,

  // Available scenarios
  availableScenarios: [],
  scenariosLoading: false,
  scenariosByCategory: {
    'happy-path': [],
    'edge-case': [],
    'error-handling': [],
  },

  // Execution state
  isExecuting: false,
  isPaused: false,
  currentRunId: null,
  workers: [],
  progress: {
    total: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  },

  // Errors
  error: null,
};

// Async Thunks

import * as testMonitorApi from '../../services/api/testMonitorApi';

/**
 * Check for and restore active execution on page load
 */
export const checkActiveExecution = createAsyncThunk(
  'testExecution/checkActive',
  async (_, { rejectWithValue }) => {
    try {
      const result = await testMonitorApi.getActiveExecution();
      return result;
    } catch (error) {
      logError(error, 'checkActiveExecution');
      const formattedError = handleError(error, 'Failed to check active execution');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch available test scenarios
 */
export const fetchScenarios = createAsyncThunk(
  'testExecution/fetchScenarios',
  async (_, { rejectWithValue }) => {
    try {
      const scenarios = await testMonitorApi.getScenarios();
      return scenarios;
    } catch (error) {
      logError(error, 'fetchScenarios');
      const formattedError = handleError(error, 'Failed to fetch test scenarios');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Start test execution
 */
export const startExecution = createAsyncThunk(
  'testExecution/start',
  async (request: StartExecutionRequest, { rejectWithValue }) => {
    try {
      const result = await testMonitorApi.startExecution(request);
      return result as { runId: string; status: string };
    } catch (error) {
      logError(error, 'startExecution');
      const formattedError = handleError(error, 'Failed to start test execution');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Stop test execution
 */
export const stopExecution = createAsyncThunk(
  'testExecution/stop',
  async (runId: string, { rejectWithValue }) => {
    try {
      await testMonitorApi.stopExecution(runId);
      return runId;
    } catch (error) {
      logError(error, 'stopExecution');
      const formattedError = handleError(error, 'Failed to stop test execution');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Pause test execution
 */
export const pauseExecution = createAsyncThunk(
  'testExecution/pause',
  async (runId: string, { rejectWithValue }) => {
    try {
      await testMonitorApi.pauseExecution(runId);
      return runId;
    } catch (error) {
      logError(error, 'pauseExecution');
      const formattedError = handleError(error, 'Failed to pause test execution');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Resume test execution
 */
export const resumeExecution = createAsyncThunk(
  'testExecution/resume',
  async (runId: string, { rejectWithValue }) => {
    try {
      await testMonitorApi.resumeExecution(runId);
      return runId;
    } catch (error) {
      logError(error, 'resumeExecution');
      const formattedError = handleError(error, 'Failed to resume test execution');
      return rejectWithValue(formattedError.message);
    }
  }
);

// Slice

export const testExecutionSlice = createSlice({
  name: 'testExecution',
  initialState,
  reducers: {
    // Configuration actions
    toggleCategory: (state, action: PayloadAction<string>) => {
      const category = action.payload;
      const index = state.selectedCategories.indexOf(category);
      if (index === -1) {
        state.selectedCategories.push(category);
      } else {
        state.selectedCategories.splice(index, 1);
      }
    },

    setSelectedCategories: (state, action: PayloadAction<string[]>) => {
      state.selectedCategories = action.payload;
    },

    toggleScenario: (state, action: PayloadAction<string>) => {
      const scenarioId = action.payload;
      const index = state.selectedScenarios.indexOf(scenarioId);
      if (index === -1) {
        state.selectedScenarios.push(scenarioId);
      } else {
        state.selectedScenarios.splice(index, 1);
      }
    },

    setSelectedScenarios: (state, action: PayloadAction<string[]>) => {
      state.selectedScenarios = action.payload;
    },

    updateConfig: (state, action: PayloadAction<Partial<ExecutionConfig>>) => {
      state.config = { ...state.config, ...action.payload };
    },

    resetConfig: (state) => {
      state.config = defaultConfig;
    },

    // Execution state actions (for SSE updates)
    setExecuting: (state, action: PayloadAction<boolean>) => {
      state.isExecuting = action.payload;
    },

    setPaused: (state, action: PayloadAction<boolean>) => {
      state.isPaused = action.payload;
    },

    setCurrentRunId: (state, action: PayloadAction<string | null>) => {
      state.currentRunId = action.payload;
    },

    updateWorkers: (state, action: PayloadAction<WorkerStatus[]>) => {
      state.workers = action.payload;
    },

    updateWorkerStatus: (state, action: PayloadAction<WorkerStatus>) => {
      const index = state.workers.findIndex(w => w.workerId === action.payload.workerId);
      if (index >= 0) {
        state.workers[index] = action.payload;
      } else {
        state.workers.push(action.payload);
      }
    },

    updateProgress: (state, action: PayloadAction<Partial<ExecutionProgress>>) => {
      state.progress = { ...state.progress, ...action.payload };
    },

    resetProgress: (state) => {
      state.progress = {
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      };
      state.workers = [];
    },

    // Error handling
    clearError: (state) => {
      state.error = null;
    },

    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },

    // Reset entire execution state
    resetExecution: (state) => {
      state.isExecuting = false;
      state.isPaused = false;
      state.currentRunId = null;
      state.workers = [];
      state.progress = initialState.progress;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch Scenarios
    builder
      .addCase(fetchScenarios.pending, (state) => {
        state.scenariosLoading = true;
        state.error = null;
      })
      .addCase(fetchScenarios.fulfilled, (state, action) => {
        state.scenariosLoading = false;
        state.availableScenarios = action.payload;
        // Group by category
        state.scenariosByCategory = {
          'happy-path': action.payload.filter(s => s.category === 'happy-path'),
          'edge-case': action.payload.filter(s => s.category === 'edge-case'),
          'error-handling': action.payload.filter(s => s.category === 'error-handling'),
        };
      })
      .addCase(fetchScenarios.rejected, (state, action) => {
        state.scenariosLoading = false;
        state.error = action.payload as string;
      });

    // Start Execution
    builder
      .addCase(startExecution.pending, (state) => {
        state.error = null;
      })
      .addCase(startExecution.fulfilled, (state, action) => {
        state.isExecuting = true;
        state.isPaused = false;
        state.currentRunId = action.payload.runId;
        state.progress = {
          total: 0,
          completed: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
        };
      })
      .addCase(startExecution.rejected, (state, action) => {
        state.error = action.payload as string;
        state.isExecuting = false;
      });

    // Stop Execution
    builder
      .addCase(stopExecution.fulfilled, (state) => {
        state.isExecuting = false;
        state.isPaused = false;
      })
      .addCase(stopExecution.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Pause Execution
    builder
      .addCase(pauseExecution.fulfilled, (state) => {
        state.isPaused = true;
      })
      .addCase(pauseExecution.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Resume Execution
    builder
      .addCase(resumeExecution.fulfilled, (state) => {
        state.isPaused = false;
      })
      .addCase(resumeExecution.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Check Active Execution (restore state on page load)
    builder
      .addCase(checkActiveExecution.fulfilled, (state, action) => {
        if (action.payload.active && action.payload.runId) {
          state.isExecuting = true;
          state.isPaused = action.payload.status === 'paused';
          state.currentRunId = action.payload.runId;
          if (action.payload.progress) {
            state.progress = action.payload.progress;
          }
          if (action.payload.workers) {
            state.workers = action.payload.workers.map(w => ({
              workerId: w.workerId,
              status: w.status as 'idle' | 'running' | 'completed' | 'error',
              currentTestId: w.currentTestId,
              currentTestName: w.currentTestName,
            }));
          }
        }
      });
  },
});

// Export actions
export const {
  toggleCategory,
  setSelectedCategories,
  toggleScenario,
  setSelectedScenarios,
  updateConfig,
  resetConfig,
  setExecuting,
  setPaused,
  setCurrentRunId,
  updateWorkers,
  updateWorkerStatus,
  updateProgress,
  resetProgress,
  clearError,
  setError,
  resetExecution,
} = testExecutionSlice.actions;

// Selectors
export const selectSelectedCategories = (state: RootState) => state.testExecution.selectedCategories;
export const selectSelectedScenarios = (state: RootState) => state.testExecution.selectedScenarios;
export const selectExecutionConfig = (state: RootState) => state.testExecution.config;
export const selectAvailableScenarios = (state: RootState) => state.testExecution.availableScenarios;
export const selectScenariosByCategory = (state: RootState) => state.testExecution.scenariosByCategory;
export const selectScenariosLoading = (state: RootState) => state.testExecution.scenariosLoading;
export const selectIsExecuting = (state: RootState) => state.testExecution.isExecuting;
export const selectIsPaused = (state: RootState) => state.testExecution.isPaused;
export const selectCurrentRunId = (state: RootState) => state.testExecution.currentRunId;
export const selectWorkers = (state: RootState) => state.testExecution.workers;
export const selectProgress = (state: RootState) => state.testExecution.progress;
export const selectExecutionError = (state: RootState) => state.testExecution.error;

// Derived selectors
export const selectSelectedTestCount = (state: RootState) => {
  const { selectedCategories, selectedScenarios, scenariosByCategory } = state.testExecution;

  if (selectedScenarios.length > 0) {
    return selectedScenarios.length;
  }

  return selectedCategories.reduce((count, category) => {
    const categoryKey = category as keyof typeof scenariosByCategory;
    return count + (scenariosByCategory[categoryKey]?.length || 0);
  }, 0);
};

export const selectProgressPercentage = (state: RootState) => {
  const { progress } = state.testExecution;
  if (progress.total === 0) return 0;
  return Math.round((progress.completed / progress.total) * 100);
};

// Export reducer
export default testExecutionSlice.reducer;
