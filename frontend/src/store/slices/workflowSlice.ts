/**
 * Workflow Slice
 * Manages the end-to-end testing workflow state machine
 *
 * Workflow Phases:
 * 1. idle - No active workflow
 * 2. testing - Running tests
 * 3. analyzing - Analyzing failures and generating fixes
 * 4. fixing - Applying fixes to prompts
 * 5. verifying - Re-running tests to verify fixes
 * 6. deploying - Syncing to Flowise
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

// Workflow phase types
type WorkflowPhase = 'idle' | 'testing' | 'analyzing' | 'fixing' | 'verifying' | 'deploying';
type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'error' | 'skipped';

interface PhaseState {
  status: PhaseStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface TestingPhase extends PhaseState {
  runId?: string;
  passed?: number;
  failed?: number;
  total?: number;
}

interface AnalyzingPhase extends PhaseState {
  failureCount?: number;
  fixesGenerated?: number;
}

interface FixingPhase extends PhaseState {
  pendingFixes?: number;
  appliedFixes?: number;
  rejectedFixes?: number;
}

interface VerifyingPhase extends PhaseState {
  passRate?: number;
  improved?: boolean;
}

interface DeployingPhase extends PhaseState {
  filesDeployed?: number;
  targetFiles?: string[];
}

interface WorkflowState {
  currentPhase: WorkflowPhase;
  phases: {
    testing: TestingPhase;
    analyzing: AnalyzingPhase;
    fixing: FixingPhase;
    verifying: VerifyingPhase;
    deploying: DeployingPhase;
  };
  history: Array<{
    workflowId: string;
    startedAt: string;
    completedAt?: string;
    finalPhase: WorkflowPhase;
    success: boolean;
  }>;
}

const initialState: WorkflowState = {
  currentPhase: 'idle',
  phases: {
    testing: { status: 'pending' },
    analyzing: { status: 'pending' },
    fixing: { status: 'pending' },
    verifying: { status: 'pending' },
    deploying: { status: 'pending' },
  },
  history: [],
};

export const workflowSlice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    /**
     * Reset workflow to initial state
     */
    resetWorkflow: (state) => {
      state.currentPhase = 'idle';
      state.phases = {
        testing: { status: 'pending' },
        analyzing: { status: 'pending' },
        fixing: { status: 'pending' },
        verifying: { status: 'pending' },
        deploying: { status: 'pending' },
      };
    },

    /**
     * Start testing phase
     */
    startTesting: (state, action: PayloadAction<{ runId: string }>) => {
      state.currentPhase = 'testing';
      state.phases.testing = {
        status: 'in_progress',
        runId: action.payload.runId,
        startedAt: new Date().toISOString(),
      };
    },

    /**
     * Complete testing phase
     */
    completeTesting: (state, action: PayloadAction<{
      passed: number;
      failed: number;
      total: number;
    }>) => {
      state.phases.testing = {
        ...state.phases.testing,
        status: 'completed',
        passed: action.payload.passed,
        failed: action.payload.failed,
        total: action.payload.total,
        completedAt: new Date().toISOString(),
      };
      // Auto-advance to analyzing if there are failures
      if (action.payload.failed > 0) {
        state.currentPhase = 'analyzing';
        state.phases.analyzing = {
          status: 'pending',
          failureCount: action.payload.failed,
        };
      } else {
        state.currentPhase = 'idle';
      }
    },

    /**
     * Set testing error
     */
    setTestingError: (state, action: PayloadAction<string>) => {
      state.phases.testing = {
        ...state.phases.testing,
        status: 'error',
        error: action.payload,
        completedAt: new Date().toISOString(),
      };
    },

    /**
     * Start analyzing phase
     */
    startAnalyzing: (state) => {
      state.currentPhase = 'analyzing';
      state.phases.analyzing = {
        ...state.phases.analyzing,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      };
    },

    /**
     * Complete analyzing phase
     */
    completeAnalyzing: (state, action: PayloadAction<{
      fixesGenerated: number;
    }>) => {
      state.phases.analyzing = {
        ...state.phases.analyzing,
        status: 'completed',
        fixesGenerated: action.payload.fixesGenerated,
        completedAt: new Date().toISOString(),
      };
      // Auto-advance to fixing if fixes were generated
      if (action.payload.fixesGenerated > 0) {
        state.currentPhase = 'fixing';
        state.phases.fixing = {
          status: 'pending',
          pendingFixes: action.payload.fixesGenerated,
          appliedFixes: 0,
          rejectedFixes: 0,
        };
      } else {
        state.currentPhase = 'idle';
      }
    },

    /**
     * Start fixing phase
     */
    startFixing: (state) => {
      state.currentPhase = 'fixing';
      state.phases.fixing = {
        ...state.phases.fixing,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      };
    },

    /**
     * Update fixing progress
     */
    updateFixingProgress: (state, action: PayloadAction<{
      appliedFixes: number;
      rejectedFixes: number;
      pendingFixes: number;
    }>) => {
      state.phases.fixing = {
        ...state.phases.fixing,
        ...action.payload,
      };
    },

    /**
     * Complete fixing phase
     */
    completeFixing: (state, action: PayloadAction<{
      appliedFixes: number;
    }>) => {
      state.phases.fixing = {
        ...state.phases.fixing,
        status: 'completed',
        appliedFixes: action.payload.appliedFixes,
        completedAt: new Date().toISOString(),
      };
      // Auto-advance to verifying if fixes were applied
      if (action.payload.appliedFixes > 0) {
        state.currentPhase = 'verifying';
        state.phases.verifying = {
          status: 'pending',
        };
      } else {
        state.currentPhase = 'idle';
      }
    },

    /**
     * Start verifying phase
     */
    startVerifying: (state) => {
      state.currentPhase = 'verifying';
      state.phases.verifying = {
        ...state.phases.verifying,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      };
    },

    /**
     * Complete verifying phase
     */
    completeVerifying: (state, action: PayloadAction<{
      passRate: number;
      improved: boolean;
    }>) => {
      state.phases.verifying = {
        ...state.phases.verifying,
        status: 'completed',
        passRate: action.payload.passRate,
        improved: action.payload.improved,
        completedAt: new Date().toISOString(),
      };
      // Auto-advance to deploying if verification passed
      if (action.payload.improved) {
        state.currentPhase = 'deploying';
        state.phases.deploying = {
          status: 'pending',
        };
      } else {
        // Go back to fixing if verification failed
        state.currentPhase = 'fixing';
      }
    },

    /**
     * Start deploying phase
     */
    startDeploying: (state, action: PayloadAction<{ targetFiles: string[] }>) => {
      state.currentPhase = 'deploying';
      state.phases.deploying = {
        ...state.phases.deploying,
        status: 'in_progress',
        targetFiles: action.payload.targetFiles,
        startedAt: new Date().toISOString(),
      };
    },

    /**
     * Complete deploying phase
     */
    completeDeploying: (state, action: PayloadAction<{
      filesDeployed: number;
    }>) => {
      state.phases.deploying = {
        ...state.phases.deploying,
        status: 'completed',
        filesDeployed: action.payload.filesDeployed,
        completedAt: new Date().toISOString(),
      };
      state.currentPhase = 'idle';
    },

    /**
     * Set phase error
     */
    setPhaseError: (state, action: PayloadAction<{
      phase: WorkflowPhase;
      error: string;
    }>) => {
      const { phase, error } = action.payload;
      if (phase !== 'idle' && state.phases[phase]) {
        state.phases[phase] = {
          ...state.phases[phase],
          status: 'error',
          error,
          completedAt: new Date().toISOString(),
        };
      }
    },

    /**
     * Skip to a specific phase
     */
    skipToPhase: (state, action: PayloadAction<WorkflowPhase>) => {
      const targetPhase = action.payload;
      if (targetPhase === 'idle') {
        state.currentPhase = 'idle';
        return;
      }

      // Mark skipped phases
      const phaseOrder: WorkflowPhase[] = ['testing', 'analyzing', 'fixing', 'verifying', 'deploying'];
      const targetIndex = phaseOrder.indexOf(targetPhase);

      phaseOrder.forEach((phase, index) => {
        if (index < targetIndex && state.phases[phase].status === 'pending') {
          state.phases[phase].status = 'skipped';
        }
      });

      state.currentPhase = targetPhase;
      state.phases[targetPhase] = {
        ...state.phases[targetPhase],
        status: 'pending',
      };
    },
  },
});

// Export actions
export const {
  resetWorkflow,
  startTesting,
  completeTesting,
  setTestingError,
  startAnalyzing,
  completeAnalyzing,
  startFixing,
  updateFixingProgress,
  completeFixing,
  startVerifying,
  completeVerifying,
  startDeploying,
  completeDeploying,
  setPhaseError,
  skipToPhase,
} = workflowSlice.actions;

// Selectors
export const selectCurrentPhase = (state: RootState) => state.workflow.currentPhase;
export const selectWorkflowPhases = (state: RootState) => state.workflow.phases;
export const selectTestingPhase = (state: RootState) => state.workflow.phases.testing;
export const selectAnalyzingPhase = (state: RootState) => state.workflow.phases.analyzing;
export const selectFixingPhase = (state: RootState) => state.workflow.phases.fixing;
export const selectVerifyingPhase = (state: RootState) => state.workflow.phases.verifying;
export const selectDeployingPhase = (state: RootState) => state.workflow.phases.deploying;
export const selectWorkflowHistory = (state: RootState) => state.workflow.history;

// Helper selector to check if workflow is active
export const selectIsWorkflowActive = (state: RootState) =>
  state.workflow.currentPhase !== 'idle';

// Helper selector to get overall workflow progress
export const selectWorkflowProgress = (state: RootState) => {
  const phases = state.workflow.phases;
  const phaseList = ['testing', 'analyzing', 'fixing', 'verifying', 'deploying'] as const;
  const completed = phaseList.filter(p => phases[p].status === 'completed').length;
  const inProgress = phaseList.filter(p => phases[p].status === 'in_progress').length;

  return {
    completed,
    inProgress,
    total: phaseList.length,
    percentage: Math.round((completed / phaseList.length) * 100),
  };
};

// Export reducer
export default workflowSlice.reducer;
