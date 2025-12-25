/**
 * Test Cases Slice
 * Manages test case CRUD operations and state
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  TestCaseRecord,
  TestCaseListResponse,
  TestCasePresets,
  TestCaseValidationError,
} from '../../types/testMonitor.types';
import * as testCasesApi from '../../services/api/testCasesApi';
import { handleError, logError } from '../../services/utils/errorHandler';

// Filter state for test case list
interface TestCaseFilters {
  categories: string[];
  tags: string[];
  search: string;
  includeArchived: boolean;
}

interface TestCasesState {
  // List data
  testCases: TestCaseRecord[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
    archived: number;
  };
  availableTags: string[];

  // Selected test case
  selectedTestCase: TestCaseRecord | null;

  // Editing state
  editingTestCase: TestCaseRecord | null;
  isEditing: boolean;
  isCreating: boolean;
  validationErrors: TestCaseValidationError[];

  // Filters
  filters: TestCaseFilters;

  // Presets for semantic expectations
  presets: TestCasePresets | null;

  // Loading states
  loading: boolean;
  saving: boolean;
  validating: boolean;
  syncing: boolean;

  // Error state
  error: string | null;
}

const initialState: TestCasesState = {
  testCases: [],
  stats: {
    total: 0,
    byCategory: {},
    archived: 0,
  },
  availableTags: [],
  selectedTestCase: null,
  editingTestCase: null,
  isEditing: false,
  isCreating: false,
  validationErrors: [],
  filters: {
    categories: ['happy-path', 'edge-case', 'error-handling'],
    tags: [],
    search: '',
    includeArchived: false,
  },
  presets: null,
  loading: false,
  saving: false,
  validating: false,
  syncing: false,
  error: null,
};

// ============================================================================
// ASYNC THUNKS
// ============================================================================

/**
 * Fetch all test cases
 */
export const fetchTestCases = createAsyncThunk(
  'testCases/fetchAll',
  async (options: { category?: string; includeArchived?: boolean } | undefined, { rejectWithValue }) => {
    try {
      const response = await testCasesApi.getTestCases(options);
      return response;
    } catch (error) {
      logError(error, 'fetchTestCases');
      const formattedError = handleError(error, 'Failed to fetch test cases');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch a single test case by ID
 */
export const fetchTestCase = createAsyncThunk(
  'testCases/fetchOne',
  async (caseId: string, { rejectWithValue }) => {
    try {
      const testCase = await testCasesApi.getTestCase(caseId);
      return testCase;
    } catch (error) {
      logError(error, 'fetchTestCase');
      const formattedError = handleError(error, 'Failed to fetch test case');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Create a new test case
 */
export const createTestCase = createAsyncThunk(
  'testCases/create',
  async (testCase: Omit<TestCaseRecord, 'id' | 'version' | 'createdAt' | 'updatedAt'>, { rejectWithValue }) => {
    try {
      const created = await testCasesApi.createTestCase(testCase);
      return created;
    } catch (error) {
      logError(error, 'createTestCase');
      const formattedError = handleError(error, 'Failed to create test case');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Update an existing test case
 */
export const updateTestCase = createAsyncThunk(
  'testCases/update',
  async ({ caseId, updates }: { caseId: string; updates: Partial<TestCaseRecord> }, { rejectWithValue }) => {
    try {
      const updated = await testCasesApi.updateTestCase(caseId, updates);
      return updated;
    } catch (error) {
      logError(error, 'updateTestCase');
      const formattedError = handleError(error, 'Failed to update test case');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Delete (archive) a test case
 */
export const deleteTestCase = createAsyncThunk(
  'testCases/delete',
  async ({ caseId, permanent = false }: { caseId: string; permanent?: boolean }, { rejectWithValue }) => {
    try {
      await testCasesApi.deleteTestCase(caseId, permanent);
      return { caseId, permanent };
    } catch (error) {
      logError(error, 'deleteTestCase');
      const formattedError = handleError(error, 'Failed to delete test case');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Clone a test case
 */
export const cloneTestCase = createAsyncThunk(
  'testCases/clone',
  async ({ caseId, newCaseId }: { caseId: string; newCaseId?: string }, { rejectWithValue }) => {
    try {
      const cloned = await testCasesApi.cloneTestCase(caseId, newCaseId);
      return cloned;
    } catch (error) {
      logError(error, 'cloneTestCase');
      const formattedError = handleError(error, 'Failed to clone test case');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Validate a test case without saving
 */
export const validateTestCase = createAsyncThunk(
  'testCases/validate',
  async (testCase: Partial<TestCaseRecord>, { rejectWithValue }) => {
    try {
      const result = await testCasesApi.validateTestCase(testCase);
      return result;
    } catch (error) {
      logError(error, 'validateTestCase');
      const formattedError = handleError(error, 'Failed to validate test case');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Sync test cases to TypeScript files
 */
export const syncTestCasesToTypeScript = createAsyncThunk(
  'testCases/sync',
  async (_, { rejectWithValue }) => {
    try {
      const result = await testCasesApi.syncTestCasesToTypeScript();
      return result;
    } catch (error) {
      logError(error, 'syncTestCasesToTypeScript');
      const formattedError = handleError(error, 'Failed to sync test cases to TypeScript');
      return rejectWithValue(formattedError.message);
    }
  }
);

/**
 * Fetch semantic expectation presets
 */
export const fetchPresets = createAsyncThunk(
  'testCases/fetchPresets',
  async (_, { rejectWithValue }) => {
    try {
      const presets = await testCasesApi.getTestCasePresets();
      return presets;
    } catch (error) {
      logError(error, 'fetchPresets');
      const formattedError = handleError(error, 'Failed to fetch presets');
      return rejectWithValue(formattedError.message);
    }
  }
);

// ============================================================================
// SLICE
// ============================================================================

export const testCasesSlice = createSlice({
  name: 'testCases',
  initialState,
  reducers: {
    /**
     * Clear error state
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Set selected test case
     */
    setSelectedTestCase: (state, action: PayloadAction<TestCaseRecord | null>) => {
      state.selectedTestCase = action.payload;
      // Reset editing state when selection changes
      state.isEditing = false;
      state.isCreating = false;
      state.editingTestCase = null;
      state.validationErrors = [];
    },

    /**
     * Start editing existing test case
     */
    startEditing: (state) => {
      if (state.selectedTestCase) {
        state.isEditing = true;
        state.isCreating = false;
        // Deep clone the selected test case for editing
        state.editingTestCase = JSON.parse(JSON.stringify(state.selectedTestCase));
        state.validationErrors = [];
      }
    },

    /**
     * Start creating new test case
     */
    startCreating: (state, action: PayloadAction<string | undefined>) => {
      const category = action.payload || 'happy-path';
      state.isCreating = true;
      state.isEditing = false;
      state.selectedTestCase = null;
      state.editingTestCase = {
        caseId: '',
        name: '',
        description: '',
        category: category as 'happy-path' | 'edge-case' | 'error-handling',
        tags: [],
        steps: [],
        expectations: [],
        isArchived: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.validationErrors = [];
    },

    /**
     * Cancel editing/creating
     */
    cancelEditing: (state) => {
      state.isEditing = false;
      state.isCreating = false;
      state.editingTestCase = null;
      state.validationErrors = [];
    },

    /**
     * Update editing test case field
     */
    updateEditingField: (state, action: PayloadAction<{ field: keyof TestCaseRecord; value: any }>) => {
      if (state.editingTestCase) {
        (state.editingTestCase as any)[action.payload.field] = action.payload.value;
      }
    },

    /**
     * Update the entire editing test case
     */
    setEditingTestCase: (state, action: PayloadAction<TestCaseRecord>) => {
      state.editingTestCase = action.payload;
    },

    /**
     * Set validation errors
     */
    setValidationErrors: (state, action: PayloadAction<TestCaseValidationError[]>) => {
      state.validationErrors = action.payload;
    },

    /**
     * Update filters
     */
    setFilters: (state, action: PayloadAction<Partial<TestCaseFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    /**
     * Toggle category filter
     */
    toggleCategoryFilter: (state, action: PayloadAction<string>) => {
      const category = action.payload;
      const index = state.filters.categories.indexOf(category);
      if (index >= 0) {
        state.filters.categories.splice(index, 1);
      } else {
        state.filters.categories.push(category);
      }
    },

    /**
     * Toggle tag filter
     */
    toggleTagFilter: (state, action: PayloadAction<string>) => {
      const tag = action.payload;
      const index = state.filters.tags.indexOf(tag);
      if (index >= 0) {
        state.filters.tags.splice(index, 1);
      } else {
        state.filters.tags.push(tag);
      }
    },

    /**
     * Set search query
     */
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.filters.search = action.payload;
    },

    /**
     * Clear all filters
     */
    clearFilters: (state) => {
      state.filters = {
        categories: ['happy-path', 'edge-case', 'error-handling'],
        tags: [],
        search: '',
        includeArchived: false,
      };
    },

    /**
     * Reset all state
     */
    resetState: () => initialState,
  },
  extraReducers: (builder) => {
    // Fetch Test Cases
    builder
      .addCase(fetchTestCases.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestCases.fulfilled, (state, action) => {
        state.loading = false;
        state.testCases = action.payload.testCases;
        state.stats = action.payload.stats;
        state.availableTags = action.payload.tags;
      })
      .addCase(fetchTestCases.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch Single Test Case
    builder
      .addCase(fetchTestCase.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestCase.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedTestCase = action.payload;
      })
      .addCase(fetchTestCase.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create Test Case
    builder
      .addCase(createTestCase.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(createTestCase.fulfilled, (state, action) => {
        state.saving = false;
        state.testCases.push(action.payload);
        state.selectedTestCase = action.payload;
        state.isCreating = false;
        state.editingTestCase = null;
        state.validationErrors = [];
        // Update stats
        state.stats.total += 1;
        const category = action.payload.category;
        state.stats.byCategory[category] = (state.stats.byCategory[category] || 0) + 1;
        // Update available tags
        action.payload.tags.forEach(tag => {
          if (!state.availableTags.includes(tag)) {
            state.availableTags.push(tag);
          }
        });
      })
      .addCase(createTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Update Test Case
    builder
      .addCase(updateTestCase.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(updateTestCase.fulfilled, (state, action) => {
        state.saving = false;
        const index = state.testCases.findIndex(tc => tc.caseId === action.payload.caseId);
        if (index >= 0) {
          state.testCases[index] = action.payload;
        }
        state.selectedTestCase = action.payload;
        state.isEditing = false;
        state.editingTestCase = null;
        state.validationErrors = [];
        // Update available tags
        action.payload.tags.forEach(tag => {
          if (!state.availableTags.includes(tag)) {
            state.availableTags.push(tag);
          }
        });
      })
      .addCase(updateTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Delete Test Case
    builder
      .addCase(deleteTestCase.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(deleteTestCase.fulfilled, (state, action) => {
        state.saving = false;
        const { caseId, permanent } = action.payload;
        if (permanent) {
          state.testCases = state.testCases.filter(tc => tc.caseId !== caseId);
          state.stats.total -= 1;
        } else {
          // Mark as archived
          const testCase = state.testCases.find(tc => tc.caseId === caseId);
          if (testCase) {
            testCase.isArchived = true;
            state.stats.archived += 1;
          }
        }
        // Clear selection if deleted test case was selected
        if (state.selectedTestCase?.caseId === caseId) {
          state.selectedTestCase = null;
        }
      })
      .addCase(deleteTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Clone Test Case
    builder
      .addCase(cloneTestCase.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(cloneTestCase.fulfilled, (state, action) => {
        state.saving = false;
        state.testCases.push(action.payload);
        state.selectedTestCase = action.payload;
        // Update stats
        state.stats.total += 1;
        const category = action.payload.category;
        state.stats.byCategory[category] = (state.stats.byCategory[category] || 0) + 1;
      })
      .addCase(cloneTestCase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });

    // Validate Test Case
    builder
      .addCase(validateTestCase.pending, (state) => {
        state.validating = true;
      })
      .addCase(validateTestCase.fulfilled, (state, action) => {
        state.validating = false;
        state.validationErrors = action.payload.errors;
      })
      .addCase(validateTestCase.rejected, (state, action) => {
        state.validating = false;
        state.error = action.payload as string;
      });

    // Sync to TypeScript
    builder
      .addCase(syncTestCasesToTypeScript.pending, (state) => {
        state.syncing = true;
        state.error = null;
      })
      .addCase(syncTestCasesToTypeScript.fulfilled, (state) => {
        state.syncing = false;
      })
      .addCase(syncTestCasesToTypeScript.rejected, (state, action) => {
        state.syncing = false;
        state.error = action.payload as string;
      });

    // Fetch Presets
    builder
      .addCase(fetchPresets.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchPresets.fulfilled, (state, action) => {
        state.loading = false;
        state.presets = action.payload;
      })
      .addCase(fetchPresets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

// Export actions
export const {
  clearError,
  setSelectedTestCase,
  startEditing,
  startCreating,
  cancelEditing,
  updateEditingField,
  setEditingTestCase,
  setValidationErrors,
  setFilters,
  toggleCategoryFilter,
  toggleTagFilter,
  setSearchQuery,
  clearFilters,
  resetState,
} = testCasesSlice.actions;

// ============================================================================
// SELECTORS
// ============================================================================

// Basic selectors
export const selectTestCases = (state: RootState) => state.testCases.testCases;
export const selectTestCaseStats = (state: RootState) => state.testCases.stats;
export const selectAvailableTags = (state: RootState) => state.testCases.availableTags;
export const selectSelectedTestCase = (state: RootState) => state.testCases.selectedTestCase;
export const selectEditingTestCase = (state: RootState) => state.testCases.editingTestCase;
export const selectIsEditing = (state: RootState) => state.testCases.isEditing;
export const selectIsCreating = (state: RootState) => state.testCases.isCreating;
export const selectValidationErrors = (state: RootState) => state.testCases.validationErrors;
export const selectFilters = (state: RootState) => state.testCases.filters;
export const selectPresets = (state: RootState) => state.testCases.presets;

// Loading selectors
export const selectTestCasesLoading = (state: RootState) => state.testCases.loading;
export const selectTestCasesSaving = (state: RootState) => state.testCases.saving;
export const selectTestCasesValidating = (state: RootState) => state.testCases.validating;
export const selectTestCasesSyncing = (state: RootState) => state.testCases.syncing;
export const selectTestCasesError = (state: RootState) => state.testCases.error;

// Filtered test cases selector
export const selectFilteredTestCases = (state: RootState) => {
  const { testCases, filters } = state.testCases;

  return testCases.filter(tc => {
    // Category filter
    if (filters.categories.length > 0 && !filters.categories.includes(tc.category)) {
      return false;
    }

    // Tag filter
    if (filters.tags.length > 0 && !filters.tags.some(tag => tc.tags.includes(tag))) {
      return false;
    }

    // Archived filter
    if (!filters.includeArchived && tc.isArchived) {
      return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = tc.name.toLowerCase().includes(searchLower);
      const matchesCaseId = tc.caseId.toLowerCase().includes(searchLower);
      const matchesDescription = tc.description?.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesCaseId && !matchesDescription) {
        return false;
      }
    }

    return true;
  });
};

// Test cases by category selector
export const selectTestCasesByCategory = (state: RootState) => {
  const testCases = selectFilteredTestCases(state);
  return {
    'happy-path': testCases.filter(tc => tc.category === 'happy-path'),
    'edge-case': testCases.filter(tc => tc.category === 'edge-case'),
    'error-handling': testCases.filter(tc => tc.category === 'error-handling'),
  };
};

// Export reducer
export default testCasesSlice.reducer;
