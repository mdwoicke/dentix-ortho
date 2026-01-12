/**
 * Test Monitor Types
 * Types for the Flowise test monitoring dashboard
 * @module testMonitor.types
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
  status: 'passed' | 'failed' | 'error' | 'skipped' | 'running';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorMessage?: string;
  langfuseTraceId?: string;
  // Flowise session ID (UUID) - used for Langfuse session URL
  flowiseSessionId?: string;
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

/**
 * Classification of whether the issue is with the bot, test agent, or both
 * Based on the "Golden Rule" from iva-prompt-tuning skill
 */
export interface FixClassification {
  /** Where the issue originates - determines which system to fix */
  issueLocation: 'bot' | 'test-agent' | 'both';
  /** Confidence score from 0-1 */
  confidence: number;
  /** Explanation for the classification */
  reasoning: string;
  /** Would a real user say what the test agent said? */
  userBehaviorRealistic: boolean;
  /** Did the bot respond appropriately to the input? */
  botResponseAppropriate: boolean;
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
  /** Classification of bot vs test-agent issue (Phase 2) */
  classification?: FixClassification;
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
  // Sandbox-specific fields
  exists?: boolean;  // Whether file exists in sandbox (for "Copy from Production" UI)
  fileType?: 'markdown' | 'javascript';  // File type for sandbox files
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

// Test Execution Types
export interface TestScenario {
  id: string;
  name: string;
  description: string;
  category: 'happy-path' | 'edge-case' | 'error-handling';
  tags: string[];
  stepCount: number;
}

export interface ExecutionConfig {
  concurrency: number;
  retryFailed: boolean;
  timeoutMs: number;
  enableSemanticEval: boolean;
}

export interface WorkerStatus {
  workerId: number;
  status: 'idle' | 'running' | 'error';
  currentTestId: string | null;
  currentTestName: string | null;
  startedAt: string | null;
}

export interface ExecutionProgress {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  skipped: number;
}

// Enhanced execution metrics for parallel execution optimization
export interface EnhancedExecutionMetrics {
  // Time metrics
  startedAt: string;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  estimatedCompletionAt: string | null;

  // Throughput
  testsPerMinute: number;
  avgTestDurationMs: number;

  // Failure analysis
  failureRate: number;
  recentFailures: RecentFailure[];
  failureClusters: FailureClusterSummary[];

  // Worker efficiency
  workerUtilization: number;  // 0-1
  idleWorkerCount: number;

  // Retries
  totalRetries: number;
  retriedTests: string[];

  // Early terminations
  earlyTerminations: number;
}

export interface RecentFailure {
  testId: string;
  testName: string;
  failedAt: string;
  errorType: string;
  errorMessage: string;
  workerId: number;
}

export interface FailureClusterSummary {
  clusterId: string;
  name: string;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  trend: 'new' | 'recurring' | 'improving' | 'worsening' | 'stable';
}

export interface StartExecutionRequest {
  categories: string[];
  scenarios: string[];
  config: ExecutionConfig;
}

export interface StartExecutionResponse {
  runId: string;
  status: 'started';
}

// Analytics Types
export interface TrendDataPoint {
  date: string;
  value: number;
  runId: string;
}

export interface RunComparisonResult {
  run1: TestRunWithResults;
  run2: TestRunWithResults;
  regressions: string[];
  improvements: string[];
  unchanged: string[];
}

// ============================================================================
// TEST CASE MANAGEMENT TYPES
// ============================================================================

export interface SemanticExpectationDTO {
  type: string;
  description: string;
  customCriteria?: string;
  required: boolean;
}

export interface NegativeExpectationDTO {
  type: string;
  description: string;
  customCriteria?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface TestCaseStepDTO {
  id: string;
  description?: string;
  userMessage: string;
  expectedPatterns: string[];
  unexpectedPatterns: string[];
  semanticExpectations: SemanticExpectationDTO[];
  negativeExpectations: NegativeExpectationDTO[];
  timeout?: number;
  delay?: number;
  optional?: boolean;
}

export interface ExpectationDTO {
  type: 'conversation-complete' | 'final-state' | 'no-errors' | 'custom';
  description: string;
}

export interface TestCaseRecord {
  id?: number;
  caseId: string;
  name: string;
  description: string;
  category: 'happy-path' | 'edge-case' | 'error-handling';
  tags: string[];
  steps: TestCaseStepDTO[];
  expectations: ExpectationDTO[];
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseStats {
  total: number;
  byCategory: Record<string, number>;
  archived: number;
}

export interface TestCaseListResponse {
  testCases: TestCaseRecord[];
  stats: TestCaseStats;
  tags: string[];
}

export interface TestCaseValidationError {
  field: string;
  message: string;
}

export interface SemanticExpectationPreset {
  type: string;
  label: string;
  description: string;
}

export interface NegativeExpectationPreset {
  type: string;
  label: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface TestCasePresets {
  semanticExpectations: SemanticExpectationPreset[];
  negativeExpectations: NegativeExpectationPreset[];
}

// ============================================================================
// GOAL-ORIENTED TEST TYPES
// ============================================================================

/**
 * Child data in persona inventory
 */
export interface ChildDataDTO {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  isNewPatient: TristateValue;
  hadBracesBefore?: TristateValue;
  specialNeeds?: string;
}

/**
 * Data inventory for a persona
 */
export interface DataInventoryDTO {
  parentFirstName: string;
  parentLastName: string;
  parentPhone: string;
  parentEmail?: string;
  children: ChildDataDTO[];
  hasInsurance?: TristateValue;
  insuranceProvider?: string;
  preferredLocation?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'any';
  preferredDateRange?: {
    start: string;
    end: string;
  };
  previousVisitToOffice?: TristateValue;
  previousOrthoTreatment?: TristateValue;
}

/**
 * Persona traits
 */
export interface PersonaTraitsDTO {
  verbosity: 'terse' | 'normal' | 'verbose';
  providesExtraInfo: TristateValue;
  patienceLevel?: 'patient' | 'moderate' | 'impatient';
  techSavviness?: 'low' | 'moderate' | 'high';
}

/**
 * User persona for goal-oriented tests
 */
export interface UserPersonaDTO {
  name: string;
  description?: string;
  inventory: DataInventoryDTO;
  traits: PersonaTraitsDTO;
}

/**
 * Collectable field types
 */
export type CollectableFieldDTO =
  | 'parent_name' | 'parent_name_spelling' | 'parent_phone' | 'parent_email'
  | 'child_count' | 'child_names' | 'child_dob' | 'child_age'
  | 'is_new_patient' | 'previous_visit' | 'previous_ortho'
  | 'insurance' | 'special_needs' | 'time_preference' | 'location_preference';

/**
 * Goal types
 */
export type GoalTypeDTO =
  | 'data_collection'
  | 'booking_confirmed'
  | 'transfer_initiated'
  | 'conversation_ended'
  | 'error_handled'
  | 'custom';

/**
 * Default value configuration for a collectable field
 */
export interface FieldDefaultValueDTO {
  /** Whether to use a random value from pool */
  useRandom: boolean;
  /** Fixed value (used when useRandom is false) */
  fixedValue?: string;
  /** Pool of values to pick from randomly (used when useRandom is true) */
  randomPool?: string[];
}

/**
 * Conversation goal
 */
export interface ConversationGoalDTO {
  id: string;
  type: GoalTypeDTO;
  description: string;
  requiredFields?: CollectableFieldDTO[];
  /** Default values for required fields (overrides persona if set) */
  fieldDefaults?: Partial<Record<CollectableFieldDTO, FieldDefaultValueDTO>>;
  priority: number;
  required: boolean;
}

/**
 * Constraint types
 */
export type ConstraintTypeDTO =
  | 'must_happen'
  | 'must_not_happen'
  | 'max_turns'
  | 'max_time';

/**
 * Test constraint
 */
export interface TestConstraintDTO {
  type: ConstraintTypeDTO;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  maxTurns?: number;
  maxTimeMs?: number;
}

/**
 * Tristate value that supports true, false, or random selection
 */
export type TristateValue = boolean | 'random';

/**
 * Response config for goal tests
 */
export interface ResponseConfigDTO {
  maxTurns: number;
  useLlmResponses: TristateValue;
  handleUnknownIntents: 'fail' | 'clarify' | 'generic' | 'random';
}

/**
 * Goal-oriented test case record
 */
export interface GoalTestCaseRecord {
  id?: number;
  caseId: string;
  name: string;
  description: string;
  category: 'happy-path' | 'edge-case' | 'error-handling';
  tags: string[];
  persona: UserPersonaDTO;
  goals: ConversationGoalDTO[];
  constraints: TestConstraintDTO[];
  responseConfig: ResponseConfigDTO;
  initialMessage: string;
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// DYNAMIC FIELD TYPES
// ============================================================================
// These types support fields that can be either fixed values or dynamically
// generated at test runtime using Faker.js.

/**
 * Supported dynamic field types for generation
 */
export type DynamicFieldTypeDTO =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'date'
  | 'dateOfBirth'
  | 'boolean'
  | 'insuranceProvider'
  | 'insuranceId'
  | 'location'
  | 'timeOfDay'
  | 'specialNeeds'
  | 'verbosity'
  | 'patienceLevel';

/**
 * Constraints for field generation
 */
export interface FieldConstraintsDTO {
  // Date constraints
  minDate?: string;  // ISO date string YYYY-MM-DD
  maxDate?: string;  // ISO date string YYYY-MM-DD
  minAge?: number;   // For dateOfBirth - minimum age
  maxAge?: number;   // For dateOfBirth - maximum age

  // Phone constraints
  phoneFormat?: string;  // e.g., '###-###-####' or '##########'

  // Selection pool constraints
  options?: string[];  // Pick randomly from these options

  // Boolean constraints
  probability?: number;  // 0-1, probability of generating true (default 0.5)

  // String constraints
  prefix?: string;
  suffix?: string;
}

/**
 * Specification for a dynamically generated field value
 */
export interface DynamicFieldSpecDTO {
  /** Marker to identify this as a dynamic field */
  _dynamic: true;

  /** Field type for generation */
  fieldType: DynamicFieldTypeDTO;

  /** Optional constraints for generation */
  constraints?: FieldConstraintsDTO;

  /** Optional seed for reproducibility */
  seed?: number | null;
}

/**
 * Type helper: A value that can be either fixed or dynamic
 */
export type MaybeDynamicDTO<T> = T | DynamicFieldSpecDTO;

/**
 * Type guard to check if a value is a DynamicFieldSpec
 */
export function isDynamicFieldDTO<T>(value: T | DynamicFieldSpecDTO): value is DynamicFieldSpecDTO {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_dynamic' in value &&
    (value as DynamicFieldSpecDTO)._dynamic === true
  );
}

/**
 * Child data with dynamic field support
 */
export interface DynamicChildDataDTO {
  firstName: MaybeDynamicDTO<string>;
  lastName: MaybeDynamicDTO<string>;
  dateOfBirth: MaybeDynamicDTO<string>;
  isNewPatient: MaybeDynamicDTO<boolean>;
  hadBracesBefore?: MaybeDynamicDTO<boolean>;
  specialNeeds?: MaybeDynamicDTO<string>;
}

/**
 * Data inventory with dynamic field support
 */
export interface DynamicDataInventoryDTO {
  parentFirstName: MaybeDynamicDTO<string>;
  parentLastName: MaybeDynamicDTO<string>;
  parentPhone: MaybeDynamicDTO<string>;
  parentEmail?: MaybeDynamicDTO<string>;
  children: DynamicChildDataDTO[];
  hasInsurance?: MaybeDynamicDTO<boolean>;
  insuranceProvider?: MaybeDynamicDTO<string>;
  preferredLocation?: MaybeDynamicDTO<string>;
  preferredTimeOfDay?: MaybeDynamicDTO<'morning' | 'afternoon' | 'any'>;
  preferredDateRange?: MaybeDynamicDTO<{
    start: string;
    end: string;
  }>;
  previousVisitToOffice?: MaybeDynamicDTO<boolean>;
  previousOrthoTreatment?: MaybeDynamicDTO<boolean>;
}

/**
 * User persona with dynamic data inventory
 */
export interface DynamicUserPersonaDTO {
  name: string;
  description?: string;
  inventory: DynamicDataInventoryDTO;
  traits: PersonaTraitsDTO;
}

/**
 * Resolution metadata for tracking generated values
 */
export interface ResolutionMetadataDTO {
  /** Seed used for generation (for reproducibility) */
  seed: number;

  /** Timestamp when resolution occurred */
  resolvedAt: string;

  /** List of fields that were dynamically generated */
  dynamicFields: string[];
}

/**
 * Resolved persona information stored with test results
 */
export interface ResolvedPersonaDTO {
  /** The original template (may contain dynamic specs) */
  template: DynamicUserPersonaDTO;

  /** The resolved persona with concrete values */
  resolved: UserPersonaDTO;

  /** Metadata about the resolution */
  metadata: ResolutionMetadataDTO;
}

/**
 * Default pools for dynamic field generation
 */
export const DEFAULT_DYNAMIC_POOLS = {
  insuranceProviders: [
    'Keystone First',
    'Aetna Better Health',
    'Blue Cross Blue Shield',
    'United Healthcare',
    'Cigna',
    'AmeriHealth',
    'Highmark',
    'Independence Blue Cross',
    'Geisinger Health Plan',
  ],

  locations: [
    'Alleghany',
    'Philadelphia',
  ],

  specialNeeds: [
    'None',
    'Autism',
    'ADHD',
    'Sensory sensitivity',
    'Anxiety',
    'Down syndrome',
    'Cerebral palsy',
  ],

  timeOfDay: [
    'morning',
    'afternoon',
    'any',
  ],

  verbosity: [
    'terse',
    'normal',
    'verbose',
  ],

  patienceLevel: [
    'patient',
    'moderate',
    'impatient',
  ],
};

/**
 * Default constraints for dynamic field types
 */
export const DEFAULT_FIELD_CONSTRAINTS: Record<DynamicFieldTypeDTO, FieldConstraintsDTO> = {
  firstName: {},
  lastName: {},
  fullName: {},
  phone: { phoneFormat: '##########' },
  email: {},
  date: {},
  dateOfBirth: { minAge: 7, maxAge: 18 },
  boolean: { probability: 0.5 },
  insuranceProvider: { options: DEFAULT_DYNAMIC_POOLS.insuranceProviders },
  insuranceId: {},
  location: { options: DEFAULT_DYNAMIC_POOLS.locations },
  timeOfDay: { options: DEFAULT_DYNAMIC_POOLS.timeOfDay },
  specialNeeds: { options: DEFAULT_DYNAMIC_POOLS.specialNeeds, probability: 0.1 },
  verbosity: { options: DEFAULT_DYNAMIC_POOLS.verbosity },
  patienceLevel: { options: DEFAULT_DYNAMIC_POOLS.patienceLevel },
};

/**
 * Human-readable labels for dynamic field types
 */
export const DYNAMIC_FIELD_TYPE_LABELS: Record<DynamicFieldTypeDTO, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name',
  phone: 'Phone Number',
  email: 'Email Address',
  date: 'Date',
  dateOfBirth: 'Date of Birth',
  boolean: 'Yes/No',
  insuranceProvider: 'Insurance Provider',
  insuranceId: 'Insurance ID',
  location: 'Location',
  timeOfDay: 'Time of Day',
  specialNeeds: 'Special Needs',
  verbosity: 'Verbosity',
  patienceLevel: 'Patience Level',
};

/**
 * Available collectable fields with labels and configuration
 */
export const COLLECTABLE_FIELDS: {
  value: CollectableFieldDTO;
  label: string;
  /** Whether this field supports default value configuration */
  supportsDefault: boolean;
  /** Default pool for random selection (if applicable) */
  defaultPool?: string[];
  /** Input type for fixed value */
  inputType?: 'text' | 'select' | 'boolean';
}[] = [
  { value: 'parent_name', label: 'Parent Name', supportsDefault: false },
  { value: 'parent_name_spelling', label: 'Name Spelling', supportsDefault: false },
  { value: 'parent_phone', label: 'Phone Number', supportsDefault: false },
  { value: 'parent_email', label: 'Email Address', supportsDefault: false },
  { value: 'child_count', label: 'Child Count', supportsDefault: false },
  { value: 'child_names', label: 'Child Names', supportsDefault: false },
  { value: 'child_dob', label: 'Child DOB', supportsDefault: false },
  { value: 'child_age', label: 'Child Age', supportsDefault: false },
  { value: 'is_new_patient', label: 'New Patient Status', supportsDefault: true, inputType: 'boolean', defaultPool: ['yes', 'no'] },
  { value: 'previous_visit', label: 'Previous Visit', supportsDefault: true, inputType: 'boolean', defaultPool: ['yes', 'no'] },
  { value: 'previous_ortho', label: 'Previous Ortho', supportsDefault: true, inputType: 'boolean', defaultPool: ['yes', 'no'] },
  { value: 'insurance', label: 'Insurance', supportsDefault: true, inputType: 'select', defaultPool: ['Keystone First', 'Aetna Better Health', 'Blue Cross Blue Shield', 'United Healthcare', 'Cigna', 'AmeriHealth', 'No insurance'] },
  { value: 'special_needs', label: 'Special Needs', supportsDefault: true, inputType: 'select', defaultPool: ['None', 'Autism', 'ADHD', 'Sensory sensitivity', 'Anxiety'] },
  { value: 'time_preference', label: 'Time Preference', supportsDefault: true, inputType: 'select', defaultPool: ['morning', 'afternoon', 'any'] },
  { value: 'location_preference', label: 'Location Preference', supportsDefault: true, inputType: 'select', defaultPool: ['Alleghany', 'Philadelphia', 'Any location'] },
];

/**
 * Goal type options with labels
 */
export const GOAL_TYPES: { value: GoalTypeDTO; label: string; description: string }[] = [
  { value: 'data_collection', label: 'Data Collection', description: 'Collect required information fields' },
  { value: 'booking_confirmed', label: 'Booking Confirmed', description: 'Complete appointment booking' },
  { value: 'transfer_initiated', label: 'Transfer Initiated', description: 'Transfer to live agent' },
  { value: 'conversation_ended', label: 'Conversation Ended', description: 'End conversation properly' },
  { value: 'error_handled', label: 'Error Handled', description: 'Handle errors gracefully' },
  { value: 'custom', label: 'Custom', description: 'Custom success criteria' },
];

// ============================================================================
// GOAL TEST ORGANIZER TYPES
// ============================================================================

/**
 * Statistics for goal test cases dashboard
 */
export interface GoalTestStats {
  total: number;
  byCategory: Record<string, number>;
  byStatus: {
    active: number;
    archived: number;
  };
  goalsDistribution: Record<string, number>;
  personasUsed: string[];
  recentlyModified: string[];
}

/**
 * Saved filter preset for goal tests
 */
export interface GoalTestFilterPreset {
  id: string;
  name: string;
  filters: GoalTestFilters;
  createdAt: string;
}

/**
 * Filter criteria for goal tests
 */
export interface GoalTestFilters {
  search: string;
  categories: string[];
  tags: string[];
  personas: string[];
  goalTypes: string[];
  includeArchived: boolean;
}

/**
 * Category order for drag-and-drop
 */
export interface CategoryOrder {
  category: string;
  caseIds: string[];
}

/**
 * Reorder request payload
 */
export interface ReorderRequest {
  caseId: string;
  category: string;
  order: number;
}

/**
 * Category display configuration
 */
export type TestCategory = 'happy-path' | 'edge-case' | 'error-handling';

// ============================================================================
// VERIFICATION TYPES
// ============================================================================

/**
 * Result of verifying a single fix by re-running affected tests
 */
export interface VerificationResult {
  fixId: string;
  testId: string;
  testName: string;
  beforeStatus: 'passed' | 'failed' | 'error' | 'skipped';
  afterStatus: 'passed' | 'failed' | 'error' | 'skipped';
  effective: boolean;
  durationMs?: number;
}

/**
 * Summary of a verification run
 */
export interface VerificationSummary {
  runId: string;
  previousRunId: string;
  fixIds: string[];
  totalTests: number;
  improved: number;
  regressed: number;
  unchanged: number;
  overallEffective: boolean;
  results: VerificationResult[];
  startedAt: string;
  completedAt?: string;
}

/**
 * Request to verify fixes
 */
export interface VerifyFixesRequest {
  fixIds: string[];
  testIds?: string[];
  syncToDisk?: boolean;
}

/**
 * Response from verify endpoint
 */
export interface VerifyFixesResponse {
  runId: string;
  previousRunId: string;
  testsToRun: string[];
  status: 'started' | 'completed';
}

export const CATEGORY_STYLES: Record<TestCategory, {
  border: string;
  header: string;
  badge: string;
  text: string;
  icon: string;
}> = {
  'happy-path': {
    border: 'border-l-4 border-l-green-500',
    header: 'bg-green-50 dark:bg-green-900/20',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    text: 'text-green-700 dark:text-green-400',
    icon: 'text-green-500',
  },
  'edge-case': {
    border: 'border-l-4 border-l-yellow-500',
    header: 'bg-yellow-50 dark:bg-yellow-900/20',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    text: 'text-yellow-700 dark:text-yellow-400',
    icon: 'text-yellow-500',
  },
  'error-handling': {
    border: 'border-l-4 border-l-red-500',
    header: 'bg-red-50 dark:bg-red-900/20',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    text: 'text-red-700 dark:text-red-400',
    icon: 'text-red-500',
  },
};

// ============================================================================
// ENVIRONMENT / PROMPT CONTEXT TYPES
// ============================================================================

/**
 * Environment context for prompt operations
 * - production: Live production files in /docs/v1/
 * - sandbox_a: Sandbox A testing environment
 * - sandbox_b: Sandbox B testing environment
 */
export type PromptContext = 'production' | 'sandbox_a' | 'sandbox_b';

/**
 * Environment-specific prompt files state
 */
export interface EnvironmentPromptState {
  files: PromptFile[];
  deployedVersions: Record<string, number>;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// PRODUCTION CALLS (LANGFUSE TRACES) TYPES
// ============================================================================

/**
 * Imported production trace from Langfuse
 */
export interface ProductionTrace {
  id: number;
  traceId: string;
  configId: number;
  configName: string;
  sessionId: string | null;
  userId: string | null;
  name: string | null;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  metadata: Record<string, any> | null;
  tags: string[];
  release: string | null;
  version: string | null;
  totalCost: number | null;
  latencyMs: number | null;
  startedAt: string;
  endedAt: string | null;
  environment: string | null;
  importedAt: string;
  langfuseHost: string;
  errorCount: number;
}

/**
 * Observation from a Langfuse trace (generation, span, event)
 */
export interface ProductionTraceObservation {
  id: number;
  observationId: string;
  traceId: string;
  parentObservationId: string | null;
  type: 'GENERATION' | 'SPAN' | 'EVENT';
  name: string | null;
  model: string | null;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  metadata: Record<string, any> | null;
  startedAt: string;
  endedAt: string | null;
  latencyMs: number | null;
  usage: {
    input: number | null;
    output: number | null;
    total: number | null;
  };
  cost: number | null;
  level: string;
  statusMessage: string | null;
}

/**
 * Full trace detail with observations and transformed transcript
 */
export interface ProductionTraceDetail {
  trace: ProductionTrace;
  observations: ProductionTraceObservation[];
  transcript: ConversationTurn[];
  apiCalls: ApiCall[];
}

/**
 * Result from an import operation
 */
export interface ImportResult {
  importId: number;
  tracesImported: number;
  tracesSkipped: number;
  status: 'completed' | 'failed';
  errorMessage?: string;
}

/**
 * Import history entry
 */
export interface ImportHistoryEntry {
  id: number;
  langfuse_config_id: number;
  config_name: string;
  import_started_at: string;
  import_completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  traces_imported: number;
  traces_skipped: number;
  error_message: string | null;
  from_date: string;
  to_date: string | null;
}

/**
 * Paginated traces response
 */
export interface ProductionTracesResponse {
  traces: ProductionTrace[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// PRODUCTION SESSIONS - Grouped Conversations
// ============================================================================

/**
 * Production Session - Groups multiple traces into a conversation
 */
export interface ProductionSession {
  sessionId: string;
  configId: number;
  configName: string;
  langfuseHost: string;
  userId: string | null;
  environment: string | null;
  firstTraceAt: string;
  lastTraceAt: string;
  traceCount: number;
  totalCost: number | null;
  totalLatencyMs: number | null;
  inputPreview: string | null;
  tags: string[] | null;
  metadata: Record<string, any> | null;
  importedAt: string;
  errorCount: number;
  hasSuccessfulBooking: boolean;
}

/**
 * Paginated sessions response
 */
export interface ProductionSessionsResponse {
  sessions: ProductionSession[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Session detail response - includes all traces and combined transcript
 */
export interface ProductionSessionDetailResponse {
  session: ProductionSession;
  traces: ProductionTrace[];
  transcript: ConversationTurn[];
  apiCalls: any[];
}

// ============================================================================
// Trace Insights Types
// ============================================================================

/**
 * Issue detail with occurrence count and related session IDs
 */
export interface TraceIssue {
  count: number;
  sessionIds: string[];
  description: string;
}

/**
 * API error breakdown by HTTP status code
 */
export interface ApiErrorBreakdown {
  http502: number;
  http500: number;
  other: number;
}

/**
 * Session length category with count and range description
 */
export interface SessionLengthCategory {
  count: number;
  range: string;
  sessionIds: string[];
}

/**
 * Cost analysis by session type
 */
export interface SessionTypeCost {
  count: number;
  avgCost: number;
  totalCost: number;
  sessionIds: string[];
}

/**
 * Tool call statistics
 */
export interface ToolCallStats {
  count: number;
  avgLatencyMs: number;
}

/**
 * Complete trace insights response
 */
export interface TraceInsightsResponse {
  timeframe: {
    fromDate: string;
    toDate: string;
    daysCount: number;
  };

  overview: {
    totalTraces: number;
    totalSessions: number;
    totalObservations: number;
    successfulBookings: number;
    patientsCreated: number;
    patientToBookingConversion: number;
    totalCost: number;
    avgCostPerSession: number;
  };

  issues: {
    emptyPatientGuid: TraceIssue & {
      patientsCreatedInSameTrace: number;
    };
    apiErrors: TraceIssue & {
      breakdown: ApiErrorBreakdown;
    };
    slotFetchFailures: TraceIssue & {
      failureRate: number;
      totalAttempts: number;
    };
    missingSlotData: TraceIssue & {
      recoveryRate: number;
      recovered: number;
      notRecovered: number;
    };
    sessionAbandonment: TraceIssue & {
      rate: number;
    };
    excessiveConfirmations: TraceIssue & {
      avgConfirmations: number;
      threshold: number;
    };
    longSessions: TraceIssue & {
      avgTurns: number;
      costImpact: number;
    };
  };

  sessionLengthDistribution: {
    abandoned: SessionLengthCategory;
    partial: SessionLengthCategory;
    complete: SessionLengthCategory;
    long: SessionLengthCategory;
  };

  costAnalysis: {
    bySessionType: {
      abandoned: SessionTypeCost;
      partial: SessionTypeCost;
      complete: SessionTypeCost;
      long: SessionTypeCost;
    };
    totalCost: number;
  };

  toolCallStats: {
    chordOrthoPatient: ToolCallStats;
    scheduleAppointmentOrtho: ToolCallStats;
    currentDateTime: ToolCallStats;
    handleEscalation: ToolCallStats;
  };

  escalations: {
    count: number;
    sessionIds: string[];
    reasons: Array<{
      reason: string;
      count: number;
    }>;
  };
}
