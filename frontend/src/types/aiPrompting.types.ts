/**
 * AI Prompting Types
 * Types for the AI prompt enhancement feature
 * @module aiPrompting.types
 */

/**
 * Request to enhance a prompt using AI
 */
export interface EnhanceRequest {
  fileKey: string;
  command: string;
  templateId?: string;
  useWebSearch?: boolean;
  sourceVersion?: number;
}

/**
 * Result of an AI enhancement operation
 */
export interface EnhanceResult {
  enhancementId: string;
  fileKey: string;
  originalContent: string;
  enhancedContent: string;
  diff: DiffResult;
  qualityScores: {
    before: number;
    after: number;
    improvement: number;
  };
  webSearchResults?: WebSearchResult[];
  reasoning: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/**
 * Diff result showing changes between original and enhanced content
 */
export interface DiffResult {
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

/**
 * A single hunk (section) of changes in a diff
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * A single line in a diff
 */
export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Web search result used for enhancement context
 */
export interface WebSearchResult {
  source: string;
  title: string;
  url?: string;
  excerpt: string;
  relevanceScore: number;
  keyTakeaways: string[];
}

/**
 * Quality score for a prompt
 */
export interface QualityScore {
  overall: number;
  dimensions: {
    clarity: number;
    completeness: number;
    examples: number;
    consistency: number;
    edgeCases: number;
  };
  suggestions: string[];
  tokenCount?: number;
  charCount?: number;
  lineCount?: number;
}

/**
 * Enhancement template for quick actions
 */
export interface EnhancementTemplate {
  templateId: string;
  name: string;
  description?: string;
  commandTemplate: string;
  category: 'clarity' | 'examples' | 'edge-cases' | 'format' | 'validation' | 'custom';
  useWebSearch: boolean;
  isBuiltIn: boolean;
  usageCount: number;
}

/**
 * Category info for template grouping
 */
export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

/**
 * History record of an AI enhancement
 */
export interface EnhancementHistory {
  enhancementId: string;
  fileKey: string;
  sourceVersion: number;
  resultVersion?: number;
  command: string;
  commandTemplate?: string;
  webSearchUsed: boolean;
  webSearchResultsJson?: string;
  aiResponseJson?: string;
  qualityScoreBefore?: number;
  qualityScoreAfter?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'applied' | 'promoted';
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  // New fields for applied/promoted workflow
  appliedAt?: string;
  promotedAt?: string;
  appliedContent?: string;
}

/**
 * Response from applying an enhancement
 */
export interface ApplyEnhancementResult {
  success: boolean;
  newVersion: number;
  fileKey: string;
  enhancementId: string;
  langfuseSaved?: boolean;
  langfusePromptId?: string;
  error?: string;
}

/**
 * Prompt file info for selection
 */
export interface PromptFileInfo {
  fileKey: string;
  displayName: string;
  fileType: 'markdown' | 'javascript';
  currentVersion: number;
  lastUpdated: string;
}

/**
 * Version info for a prompt file
 */
export interface PromptVersionInfo {
  version: number;
  createdAt: string;
  changeDescription?: string;
  isExperimental: boolean;
  aiGenerated: boolean;
  enhancementId?: string;
}

/**
 * Preview state for enhancement UI
 */
export interface EnhancementPreview {
  isLoading: boolean;
  result?: EnhanceResult;
  error?: string;
}

/**
 * Enhancement form state
 */
export interface EnhancementFormState {
  fileKey: string;
  sourceVersion?: number;
  command: string;
  selectedTemplateId?: string;
  useWebSearch: boolean;
}

/**
 * Template categories for grouping
 */
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: 'examples', name: 'Examples', description: 'Add concrete examples' },
  { id: 'clarity', name: 'Clarity', description: 'Improve clarity and specificity' },
  { id: 'edge-cases', name: 'Edge Cases', description: 'Add edge case handling' },
  { id: 'format', name: 'Format', description: 'Improve structure and formatting' },
  { id: 'validation', name: 'Validation', description: 'Add input validation' },
  { id: 'custom', name: 'Custom', description: 'Custom enhancement commands' },
];

/**
 * File key to display name mapping
 */
export const FILE_KEY_DISPLAY_NAMES: Record<string, string> = {
  'system_prompt': 'System Prompt',
  'scheduling_tool': 'Scheduling Tool',
  'patient_tool': 'Patient Tool',
};
