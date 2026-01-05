/**
 * Goal Test Cases Slice
 * State management for the Goal Test Organizer
 */

import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  GoalTestCaseRecord,
  GoalTestStats,
  GoalTestFilters,
  GoalTestFilterPreset,
  CategoryOrder,
  ReorderRequest,
  TestCategory,
} from '../../types/testMonitor.types';
import * as testMonitorApi from '../../services/api/testMonitorApi';

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface GoalTestCasesState {
  // Core data
  testCases: GoalTestCaseRecord[];
  stats: GoalTestStats;
  availableTags: string[];

  // Selection & Ordering
  selectedTestCaseIds: string[];
  selectedTestCase: GoalTestCaseRecord | null;
  categoryOrder: CategoryOrder[];

  // Editing state
  editingTestCase: GoalTestCaseRecord | null;
  isEditing: boolean;
  isCreating: boolean;

  // Filters
  filters: GoalTestFilters;
  savedPresets: GoalTestFilterPreset[];
  activePreset: string | null;

  // UI state
  collapsedCategories: string[];
  viewMode: 'cards' | 'compact' | 'list';
  sortBy: 'name' | 'updated' | 'created' | 'category';
  sortOrder: 'asc' | 'desc';

  // Loading states
  loading: boolean;
  saving: boolean;
  syncing: boolean;
  running: boolean;
  runningCaseIds: string[];
  lastRunId: string | null;

  // Error state
  error: string | null;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: GoalTestCasesState = {
  testCases: [],
  stats: {
    total: 0,
    byCategory: {},
    byStatus: { active: 0, archived: 0 },
    goalsDistribution: {},
    personasUsed: [],
    recentlyModified: [],
  },
  availableTags: [],
  selectedTestCaseIds: [],
  selectedTestCase: null,
  categoryOrder: [],
  editingTestCase: null,
  isEditing: false,
  isCreating: false,
  filters: {
    search: '',
    categories: ['happy-path', 'edge-case', 'error-handling'],
    tags: [],
    personas: [],
    goalTypes: [],
    includeArchived: false,
  },
  savedPresets: [],
  activePreset: null,
  collapsedCategories: [],
  viewMode: 'cards',
  sortBy: 'updated',
  sortOrder: 'desc',
  loading: false,
  saving: false,
  syncing: false,
  running: false,
  runningCaseIds: [],
  lastRunId: null,
  error: null,
};

// ============================================================================
// ASYNC THUNKS
// ============================================================================

/**
 * Fetch all goal test cases
 */
export const fetchGoalTestCases = createAsyncThunk(
  'goalTestCases/fetchAll',
  async (options: { category?: string; includeArchived?: boolean } | undefined, { rejectWithValue }) => {
    try {
      const response = await testMonitorApi.getGoalTestCases(options);
      return response;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch goal test cases');
    }
  }
);

/**
 * Fetch a single goal test case
 */
export const fetchGoalTestCase = createAsyncThunk(
  'goalTestCases/fetchOne',
  async (caseId: string, { rejectWithValue }) => {
    try {
      return await testMonitorApi.getGoalTestCase(caseId);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch goal test case');
    }
  }
);

/**
 * Create a new goal test case
 */
export const createGoalTestCase = createAsyncThunk(
  'goalTestCases/create',
  async (testCase: Parameters<typeof testMonitorApi.createGoalTestCase>[0], { rejectWithValue }) => {
    try {
      return await testMonitorApi.createGoalTestCase(testCase);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create goal test case');
    }
  }
);

/**
 * Update an existing goal test case
 */
export const updateGoalTestCase = createAsyncThunk(
  'goalTestCases/update',
  async (
    { caseId, updates }: { caseId: string; updates: Parameters<typeof testMonitorApi.updateGoalTestCase>[1] },
    { rejectWithValue }
  ) => {
    try {
      return await testMonitorApi.updateGoalTestCase(caseId, updates);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to update goal test case');
    }
  }
);

/**
 * Delete (archive) a goal test case
 */
export const deleteGoalTestCase = createAsyncThunk(
  'goalTestCases/delete',
  async ({ caseId, permanent = false }: { caseId: string; permanent?: boolean }, { rejectWithValue }) => {
    try {
      await testMonitorApi.deleteGoalTestCase(caseId, permanent);
      return { caseId, permanent };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to delete goal test case');
    }
  }
);

/**
 * Clone a goal test case
 */
export const cloneGoalTestCase = createAsyncThunk(
  'goalTestCases/clone',
  async ({ caseId, newCaseId }: { caseId: string; newCaseId?: string }, { rejectWithValue }) => {
    try {
      return await testMonitorApi.cloneGoalTestCase(caseId, newCaseId);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to clone goal test case');
    }
  }
);

/**
 * Bulk archive goal test cases
 */
export const bulkArchiveGoalTestCases = createAsyncThunk(
  'goalTestCases/bulkArchive',
  async (caseIds: string[], { rejectWithValue }) => {
    try {
      // Archive each test case
      await Promise.all(caseIds.map(caseId =>
        testMonitorApi.updateGoalTestCase(caseId, { isArchived: true })
      ));
      return caseIds;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to archive goal test cases');
    }
  }
);

/**
 * Sync goal test cases to TypeScript
 */
export const syncGoalTestCasesToTypeScript = createAsyncThunk(
  'goalTestCases/sync',
  async (_, { rejectWithValue }) => {
    try {
      return await testMonitorApi.syncGoalTestCases();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to sync goal test cases');
    }
  }
);

/**
 * Run goal test cases
 */
export interface RunGoalTestsConfig {
  concurrency?: number;
  timeout?: number;
  retryFailedTests?: boolean;
}

export const runGoalTests = createAsyncThunk(
  'goalTestCases/run',
  async (
    { caseIds, category, config }: { caseIds?: string[]; category?: string; config?: RunGoalTestsConfig },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as { goalTestCases: GoalTestCasesState };

      // If no specific case IDs provided, get all from the category or all active
      let goalCaseIds = caseIds || [];
      if (!caseIds && category) {
        goalCaseIds = state.goalTestCases.testCases
          .filter(tc => tc.category === category && !tc.isArchived)
          .map(tc => tc.caseId);
      } else if (!caseIds) {
        goalCaseIds = state.goalTestCases.testCases
          .filter(tc => !tc.isArchived)
          .map(tc => tc.caseId);
      }

      if (goalCaseIds.length === 0) {
        return rejectWithValue('No test cases to run');
      }

      // Keep GOAL-* IDs as-is - the test-agent now handles them with GoalTestRunner
      // Previously we transformed GOAL-HAPPY-001 -> HAPPY-001, which ran wrong tests
      const scenarioIds = goalCaseIds;

      // Merge default config with provided config
      const executionConfig = {
        concurrency: config?.concurrency || 1,
        headless: true,
        timeout: config?.timeout || 60000,
        retryFailedTests: config?.retryFailedTests || false,
        stopOnFirstFailure: false,
      };

      console.log('[runGoalTests] Running goal tests:', { goalCaseIds, scenarioIds, config: executionConfig });

      const response = await testMonitorApi.startExecution({
        categories: category ? [category] : [],
        scenarios: scenarioIds,
        config: executionConfig,
      });

      return { runId: response.runId, caseIds: goalCaseIds, concurrency: executionConfig.concurrency };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to run goal tests');
    }
  }
);

// ============================================================================
// SLICE
// ============================================================================

const goalTestCasesSlice = createSlice({
  name: 'goalTestCases',
  initialState,
  reducers: {
    // Selection
    selectTestCase: (state, action: PayloadAction<string | null>) => {
      if (action.payload === null) {
        state.selectedTestCase = null;
      } else {
        const testCase = state.testCases.find(tc => tc.id === action.payload || tc.caseId === action.payload);
        state.selectedTestCase = testCase || null;
      }
    },
    toggleTestCaseSelection: (state, action: PayloadAction<string>) => {
      const index = state.selectedTestCaseIds.indexOf(action.payload);
      if (index === -1) {
        state.selectedTestCaseIds.push(action.payload);
      } else {
        state.selectedTestCaseIds.splice(index, 1);
      }
    },
    selectAllInCategory: (state, action: PayloadAction<string>) => {
      const categoryTests = state.testCases
        .filter(tc => tc.category === action.payload && tc.id !== undefined)
        .map(tc => String(tc.id));
      state.selectedTestCaseIds = [...new Set([...state.selectedTestCaseIds, ...categoryTests])];
    },
    deselectAllInCategory: (state, action: PayloadAction<string>) => {
      const categoryTestIds = state.testCases
        .filter(tc => tc.category === action.payload && tc.id !== undefined)
        .map(tc => String(tc.id));
      state.selectedTestCaseIds = state.selectedTestCaseIds.filter(id => !categoryTestIds.includes(id));
    },
    clearSelection: (state) => {
      state.selectedTestCaseIds = [];
    },
    selectAll: (state) => {
      state.selectedTestCaseIds = state.testCases
        .filter(tc => tc.id !== undefined)
        .map(tc => String(tc.id));
    },

    // Editing
    startEditing: (state, action: PayloadAction<GoalTestCaseRecord>) => {
      state.editingTestCase = action.payload;
      state.isEditing = true;
      state.isCreating = false;
    },
    startCreating: (state) => {
      state.editingTestCase = null;
      state.isEditing = false;
      state.isCreating = true;
    },
    cancelEditing: (state) => {
      state.editingTestCase = null;
      state.isEditing = false;
      state.isCreating = false;
    },

    // Filters
    setFilters: (state, action: PayloadAction<Partial<GoalTestFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
      state.activePreset = null;
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
      state.activePreset = null;
    },
    applyPreset: (state, action: PayloadAction<string>) => {
      const preset = state.savedPresets.find(p => p.id === action.payload);
      if (preset) {
        state.filters = preset.filters;
        state.activePreset = action.payload;
      }
    },
    savePreset: (state, action: PayloadAction<{ name: string }>) => {
      const newPreset: GoalTestFilterPreset = {
        id: `preset-${Date.now()}`,
        name: action.payload.name,
        filters: { ...state.filters },
        createdAt: new Date().toISOString(),
      };
      state.savedPresets.push(newPreset);
    },
    deletePreset: (state, action: PayloadAction<string>) => {
      state.savedPresets = state.savedPresets.filter(p => p.id !== action.payload);
      if (state.activePreset === action.payload) {
        state.activePreset = null;
      }
    },

    // UI State
    toggleCategoryCollapse: (state, action: PayloadAction<string>) => {
      const index = state.collapsedCategories.indexOf(action.payload);
      if (index === -1) {
        state.collapsedCategories.push(action.payload);
      } else {
        state.collapsedCategories.splice(index, 1);
      }
    },
    setViewMode: (state, action: PayloadAction<'cards' | 'compact' | 'list'>) => {
      state.viewMode = action.payload;
    },
    setSortBy: (state, action: PayloadAction<'name' | 'updated' | 'created' | 'category'>) => {
      if (state.sortBy === action.payload) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortBy = action.payload;
        state.sortOrder = 'asc';
      }
    },

    // Ordering
    reorderTestCase: (state, action: PayloadAction<{ caseId: string; fromCategory: string; toCategory: string; newIndex: number }>) => {
      const { caseId, fromCategory, toCategory, newIndex } = action.payload;
      const testCase = state.testCases.find(tc => tc.caseId === caseId);
      if (testCase) {
        testCase.category = toCategory as TestCategory;
        // Update category order
        const order = state.categoryOrder.find(o => o.category === toCategory);
        if (order) {
          order.caseIds = order.caseIds.filter(id => id !== caseId);
          order.caseIds.splice(newIndex, 0, caseId);
        }
      }
    },

    // Error handling
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch all
    builder
      .addCase(fetchGoalTestCases.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGoalTestCases.fulfilled, (state, action) => {
        state.loading = false;
        state.testCases = action.payload.testCases;
        state.availableTags = action.payload.tags;

        // Compute stats
        const testCases = action.payload.testCases;
        state.stats = {
          total: testCases.length,
          byCategory: {
            'happy-path': testCases.filter(tc => tc.category === 'happy-path').length,
            'edge-case': testCases.filter(tc => tc.category === 'edge-case').length,
            'error-handling': testCases.filter(tc => tc.category === 'error-handling').length,
          },
          byStatus: {
            active: testCases.filter(tc => !tc.isArchived).length,
            archived: testCases.filter(tc => tc.isArchived).length,
          },
          goalsDistribution: testCases.reduce((acc, tc) => {
            tc.goals.forEach(g => {
              acc[g.type] = (acc[g.type] || 0) + 1;
            });
            return acc;
          }, {} as Record<string, number>),
          personasUsed: [...new Set(testCases.map(tc => tc.persona.name))],
          recentlyModified: [...testCases]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5)
            .map(tc => tc.caseId),
        };

        // Initialize category order
        const categories: TestCategory[] = ['happy-path', 'edge-case', 'error-handling'];
        state.categoryOrder = categories.map(category => ({
          category,
          caseIds: testCases
            .filter(tc => tc.category === category)
            .map(tc => tc.caseId),
        }));
      })
      .addCase(fetchGoalTestCases.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch one
    builder
      .addCase(fetchGoalTestCase.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchGoalTestCase.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedTestCase = action.payload;
      })
      .addCase(fetchGoalTestCase.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create
    builder
      .addCase(createGoalTestCase.pending, (state) => {
        state.saving = true;
      })
      .addCase(createGoalTestCase.fulfilled, (state, action) => {
        state.saving = false;
        state.testCases.unshift(action.payload);
        state.selectedTestCase = action.payload;
        state.isCreating = false;
        state.stats.total += 1;
        state.stats.byCategory[action.payload.category] = (state.stats.byCategory[action.payload.category] || 0) + 1;
        state.stats.byStatus.active += 1;
      })
      .addCase(createGoalTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Update
    builder
      .addCase(updateGoalTestCase.pending, (state) => {
        state.saving = true;
      })
      .addCase(updateGoalTestCase.fulfilled, (state, action) => {
        state.saving = false;
        const index = state.testCases.findIndex(tc => tc.caseId === action.payload.caseId);
        if (index !== -1) {
          state.testCases[index] = action.payload;
        }
        if (state.selectedTestCase?.caseId === action.payload.caseId) {
          state.selectedTestCase = action.payload;
        }
        state.isEditing = false;
        state.editingTestCase = null;
      })
      .addCase(updateGoalTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Delete
    builder
      .addCase(deleteGoalTestCase.pending, (state) => {
        state.saving = true;
      })
      .addCase(deleteGoalTestCase.fulfilled, (state, action) => {
        state.saving = false;
        const { caseId, permanent } = action.payload;
        if (permanent) {
          state.testCases = state.testCases.filter(tc => tc.caseId !== caseId);
        } else {
          const tc = state.testCases.find(tc => tc.caseId === caseId);
          if (tc) {
            tc.isArchived = true;
            state.stats.byStatus.active -= 1;
            state.stats.byStatus.archived += 1;
          }
        }
        if (state.selectedTestCase?.caseId === caseId) {
          state.selectedTestCase = null;
        }
        state.selectedTestCaseIds = state.selectedTestCaseIds.filter(id => id !== caseId);
      })
      .addCase(deleteGoalTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Clone
    builder
      .addCase(cloneGoalTestCase.pending, (state) => {
        state.saving = true;
      })
      .addCase(cloneGoalTestCase.fulfilled, (state, action) => {
        state.saving = false;
        state.testCases.unshift(action.payload);
        state.selectedTestCase = action.payload;
        state.stats.total += 1;
        state.stats.byCategory[action.payload.category] = (state.stats.byCategory[action.payload.category] || 0) + 1;
      })
      .addCase(cloneGoalTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Bulk archive
    builder
      .addCase(bulkArchiveGoalTestCases.pending, (state) => {
        state.saving = true;
      })
      .addCase(bulkArchiveGoalTestCases.fulfilled, (state, action) => {
        state.saving = false;
        action.payload.forEach(caseId => {
          const tc = state.testCases.find(tc => tc.caseId === caseId);
          if (tc && !tc.isArchived) {
            tc.isArchived = true;
            state.stats.byStatus.active -= 1;
            state.stats.byStatus.archived += 1;
          }
        });
        state.selectedTestCaseIds = [];
      })
      .addCase(bulkArchiveGoalTestCases.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Sync
    builder
      .addCase(syncGoalTestCasesToTypeScript.pending, (state) => {
        state.syncing = true;
      })
      .addCase(syncGoalTestCasesToTypeScript.fulfilled, (state) => {
        state.syncing = false;
      })
      .addCase(syncGoalTestCasesToTypeScript.rejected, (state, action) => {
        state.syncing = false;
        state.error = action.payload as string;
      });

    // Run tests
    builder
      .addCase(runGoalTests.pending, (state, action) => {
        state.running = true;
        state.runningCaseIds = action.meta.arg.caseIds || [];
        state.error = null;
      })
      .addCase(runGoalTests.fulfilled, (state, action) => {
        state.running = false;
        state.runningCaseIds = [];
        state.lastRunId = action.payload.runId;
      })
      .addCase(runGoalTests.rejected, (state, action) => {
        state.running = false;
        state.runningCaseIds = [];
        state.error = action.payload as string;
      });
  },
});

// ============================================================================
// SELECTORS
// ============================================================================

const selectGoalTestCasesState = (state: RootState) => state.goalTestCases;

/**
 * Select filters
 */
export const selectFilters = (state: RootState) => state.goalTestCases.filters;

/**
 * Select filtered test cases
 */
export const selectFilteredGoalTestCases = createSelector(
  [selectGoalTestCasesState],
  (state) => {
    let filtered = state.testCases;

    // Filter by archived
    if (!state.filters.includeArchived) {
      filtered = filtered.filter(tc => !tc.isArchived);
    }

    // Filter by categories
    if (state.filters.categories.length > 0) {
      filtered = filtered.filter(tc => state.filters.categories.includes(tc.category));
    }

    // Filter by tags
    if (state.filters.tags.length > 0) {
      filtered = filtered.filter(tc =>
        state.filters.tags.some(tag => tc.tags.includes(tag))
      );
    }

    // Filter by personas
    if (state.filters.personas.length > 0) {
      filtered = filtered.filter(tc =>
        state.filters.personas.includes(tc.persona.name)
      );
    }

    // Filter by goal types
    if (state.filters.goalTypes.length > 0) {
      filtered = filtered.filter(tc =>
        tc.goals.some(g => state.filters.goalTypes.includes(g.type))
      );
    }

    // Search
    if (state.filters.search) {
      const search = state.filters.search.toLowerCase();
      filtered = filtered.filter(tc =>
        tc.name.toLowerCase().includes(search) ||
        tc.description.toLowerCase().includes(search) ||
        tc.caseId.toLowerCase().includes(search) ||
        tc.persona.name.toLowerCase().includes(search)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (state.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'updated':
          comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          break;
        case 'created':
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
      }
      return state.sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }
);

/**
 * Select test cases grouped by category
 */
export const selectTestCasesByCategory = createSelector(
  [selectFilteredGoalTestCases],
  (testCases) => {
    const categories: TestCategory[] = ['happy-path', 'edge-case', 'error-handling'];
    return categories.reduce((acc, category) => {
      acc[category] = testCases.filter(tc => tc.category === category);
      return acc;
    }, {} as Record<TestCategory, GoalTestCaseRecord[]>);
  }
);

/**
 * Select dashboard stats
 */
export const selectDashboardStats = createSelector(
  [selectGoalTestCasesState],
  (state) => state.stats
);

/**
 * Select selection state
 */
export const selectSelectionState = createSelector(
  [selectGoalTestCasesState],
  (state) => ({
    selectedIds: state.selectedTestCaseIds,
    selectedCount: state.selectedTestCaseIds.length,
    hasSelection: state.selectedTestCaseIds.length > 0,
  })
);

/**
 * Select active filters count
 */
export const selectActiveFiltersCount = createSelector(
  [selectGoalTestCasesState],
  (state) => {
    let count = 0;
    if (state.filters.search) count++;
    if (state.filters.tags.length > 0) count++;
    if (state.filters.personas.length > 0) count++;
    if (state.filters.goalTypes.length > 0) count++;
    if (state.filters.includeArchived) count++;
    // Don't count categories as a filter since all are selected by default
    if (state.filters.categories.length < 3) count++;
    return count;
  }
);

// Export actions and reducer
export const {
  selectTestCase,
  toggleTestCaseSelection,
  selectAllInCategory,
  deselectAllInCategory,
  clearSelection,
  selectAll,
  startEditing,
  startCreating,
  cancelEditing,
  setFilters,
  clearFilters,
  applyPreset,
  savePreset,
  deletePreset,
  toggleCategoryCollapse,
  setViewMode,
  setSortBy,
  reorderTestCase,
  clearError,
} = goalTestCasesSlice.actions;

export default goalTestCasesSlice.reducer;
