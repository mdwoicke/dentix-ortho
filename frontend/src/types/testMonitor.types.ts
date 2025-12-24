/**
 * Test Monitor Types
 * Types for the Flowise test monitoring dashboard
 */

export interface TestRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  summary?: Record<string, any>;
}

export interface TestResult {
  id: number;
  runId: string;
  testId: string;
  testName: string;
  category: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorMessage?: string;
}

export interface TestRunWithResults extends TestRun {
  results: TestResult[];
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  responseTimeMs?: number;
  stepId?: string;
  validationPassed?: boolean;
  validationMessage?: string;
}

export interface ApiCall {
  id: number;
  runId: string;
  testId: string;
  stepId?: string;
  toolName: string;
  requestPayload?: Record<string, any>;
  responsePayload?: Record<string, any>;
  status?: string;
  durationMs?: number;
  timestamp: string;
}

export interface Finding {
  id: number;
  runId: string;
  testId: string;
  type: 'bug' | 'enhancement' | 'prompt-issue' | 'tool-issue' | 'regression';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description?: string;
  affectedStep?: string;
  agentQuestion?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  recommendation?: string;
  status: 'new' | 'in-progress' | 'resolved' | 'wont-fix';
  createdAt: string;
}

export interface Recommendation {
  id: string;
  runId: string;
  type: 'flowise-prompt' | 'function-tool' | 'node-red' | 'backend';
  priority: number;
  title: string;
  problem?: string;
  solution?: string;
  promptSuggestion?: Record<string, any>;
  toolSuggestion?: Record<string, any>;
  affectedTests: string[];
  evidence: any[];
  createdAt: string;
}

export interface GeneratedFix {
  id: number;
  fixId: string;
  runId: string;
  type: 'prompt' | 'tool';
  targetFile: string;
  changeDescription: string;
  changeCode: string;
  location: {
    section?: string;
    function?: string;
    afterLine?: string;
  } | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  affectedTests: string[];
  rootCause: {
    type: string;
    evidence: string[];
  } | null;
  status: 'pending' | 'applied' | 'rejected' | 'verified';
  createdAt: string;
}

// Prompt version management types
export interface PromptFile {
  fileKey: string;
  filePath: string;
  displayName: string;
  version: number;
  lastFixId: string | null;
  updatedAt: string;
}

export interface PromptVersionHistory {
  id: number;
  fileKey: string;
  version: number;
  content: string;
  fixId: string | null;
  changeDescription: string | null;
  createdAt: string;
}

export interface PromptContent {
  content: string;
  version: number;
}

export interface ApplyFixResult {
  newVersion: number;
  message: string;
}

// API Response types
export interface TestMonitorApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
