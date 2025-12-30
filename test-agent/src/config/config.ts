/**
 * Configuration for the E2E Testing Agent
 */

export const config = {
  // Flowise API Configuration
  flowise: {
    endpoint: 'https://app.c1elly.ai/api/v1/prediction/5f1fa57c-e6fd-463c-ac6e-c73fd5fb578b',
    timeout: 90000, // 90 seconds - increased to allow for Cloud9 API retries
    retryAttempts: 2, // Reduced to 2 - scheduling tool handles internal retries
    retryDelay: 1000, // 1 second
  },

  // Backend API Configuration (for Cloud 9 sandbox data)
  backend: {
    baseUrl: process.env.BACKEND_URL || 'http://localhost:3001',
    timeout: 30000, // 30 seconds
  },

  // Database Configuration
  database: {
    path: './data/test-results.db',
  },

  // Output Configuration
  output: {
    transcriptsDir: './data/transcripts',
    reportsDir: './data/reports',
  },

  // Test Configuration
  tests: {
    defaultDelayBetweenSteps: 500, // ms between conversation turns
    maxConversationTurns: 20,
  },

  // LLM Analysis Configuration (for Dynamic Agent Tuning)
  llmAnalysis: {
    provider: 'anthropic' as const,
    model: 'claude-opus-4-5-20251101', // Using Opus 4.5 for deep analysis and fix recommendations
    maxTokens: 4096,
    temperature: 0.2,  // Low for consistent analysis
    apiKeyEnvVar: 'CLAUDE_CODE_OAUTH_TOKEN',  // Use Claude Code OAuth token
    timeout: 120000, // 2 minutes for complex analysis
  },

  // Agent Tuning Configuration
  agentTuning: {
    systemPromptPath: '../docs/Chord_Cloud9_SystemPrompt.md',
    schedulingToolPath: '../docs/chord_dso_scheduling-StepwiseSearch.js',
    patientToolPath: '../docs/chord_dso_patient-FIXED.js',
  },

  // Semantic Evaluation Configuration (AI-powered test validation)
  semanticEvaluation: {
    // Enable/disable AI-powered evaluation
    enabled: true,

    // Evaluation mode:
    // - 'realtime': Evaluate each step immediately (highest accuracy, best for tuning)
    // - 'batch': Evaluate all steps after test completes (balanced)
    // - 'failures-only': Only use LLM for failed tests (lowest cost)
    mode: 'realtime' as 'realtime' | 'batch' | 'failures-only',

    // Fall back to regex validation when LLM unavailable
    fallbackToRegex: true,

    // Enable response caching to reduce API calls
    cacheEnabled: true,

    // Cache TTL in milliseconds (5 minutes)
    cacheTTLMs: 300000,

    // Minimum confidence threshold for evaluation results
    minConfidenceThreshold: 0.7,

    // Maximum steps to process in a single batch API call
    batchSize: 10,

    // Timeout for evaluation API calls (30 seconds)
    timeout: 30000,
  },
};

export type Config = typeof config;
