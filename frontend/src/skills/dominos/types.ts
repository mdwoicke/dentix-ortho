/**
 * Dominos Skills — Shared Types
 */

/** Result returned from any Dominos skill. */
export interface SkillResult {
  /** Whether the skill completed successfully. */
  success: boolean;
  /** Human-readable markdown output for the chat panel. */
  markdown: string;
  /** Optional structured data the caller can inspect programmatically. */
  data?: unknown;
}

/** A skill function takes a user query string and returns a SkillResult. */
export type SkillFn = (query: string) => Promise<SkillResult>;

/** Registry entry for a skill. */
export interface SkillEntry {
  /** Unique key, e.g. 'sample-order'. */
  id: string;
  /** Short label shown in UI. */
  label: string;
  /** Regex patterns that trigger this skill (tested against user input). */
  triggers: RegExp[];
  /** The function that executes the skill. */
  execute: SkillFn;
  /** Tab category this skill belongs to, e.g. 'call', 'cloud9', 'nodered'. */
  category?: string;
  /** Example query shown in the "available searches" listing. */
  sampleQuery?: string;
}
