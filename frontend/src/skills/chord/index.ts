/**
 * Chord Skills Registry
 *
 * Subset of Cloud9 skills relevant to Chord (Dental IVA).
 * Excludes Ortho-specific skills (tracker, cache, queue, NexHealth appointments).
 *
 * Usage:
 *   import { matchSkill, clearLastSkill, setCurrentApiSource } from '../../skills/chord';
 *   const skill = matchSkill(userInput);
 *   if (skill) { const result = await skill.execute(userInput); }
 */

export type { SkillResult, SkillFn, SkillEntry } from '../dominos/types';

import { patientSearchSkill } from './patientSearch';
import { sessionLookupSkill } from './sessionLookup';
import { callStatsSkill } from './callStats';
import { recentSessionsSkill } from './recentSessions';
import { errorSessionsSkill } from './errorSessions';
import { traceInsightsSkill } from './traceInsights';
import { promptVersionsSkill } from './promptVersions';
import { bookingInvestigationSkill } from './bookingInvestigation';
import { callLookupSkill } from './callLookup';
import { createAvailableSearchesSkill } from '../shared/availableSearches';
import type { SkillEntry } from '../dominos/types';

/** Tracks the currently active API source tab. */
let _currentApiSource = 'call';

/** Update the active tab so the available-searches skill can filter by it. */
export function setCurrentApiSource(source: string): void {
  _currentApiSource = source;
}

/**
 * Chord skills — order matters, first match wins.
 */
const coreSkills: SkillEntry[] = [
  callLookupSkill,       // "lookup {id}" / "find call {id}" / "search langfuse"
  sessionLookupSkill,    // "show session {id}" — before recentSessions
  callStatsSkill,        // "how many calls today" / "call stats"
  traceInsightsSkill,    // "show insights" / "call analytics"
  errorSessionsSkill,    // "error sessions" / "failed calls"
  bookingInvestigationSkill, // "investigate session..." / "check false positive"
  patientSearchSkill,    // "find patient..." — broad catch-all
  recentSessionsSkill,   // "recent sessions"
  promptVersionsSkill,   // "prompt versions"
];

/** Meta skill: lists available searches for the current tab. */
const availableSearchesSkill = createAvailableSearchesSkill(coreSkills, {
  getCurrentSource: () => _currentApiSource,
});

/** Full skill list with available-searches checked first. */
const skills: SkillEntry[] = [availableSearchesSkill, ...coreSkills];

/** Skills that support follow-up timeframe queries */
const TIMEFRAME_SKILL_IDS = new Set([
  'call-stats',
  'trace-insights',
  'recent-sessions',
  'error-sessions',
]);

/** Pattern that detects follow-up queries with a timeframe but no explicit topic */
const FOLLOWUP_PATTERN = /(?:how\s+about|what\s+about|and\s+(?:for)?|same\s+(?:for|but))\s+/i;
const TIMEFRAME_PATTERN = /(?:today|yesterday|last\s+\w+|past\s+\w+|this\s+\w+|\d+\s+(?:days?|weeks?|hours?|months?)|(?:mon|tue|wed|thu|fri|sat|sun)\w*)/i;

/** Last skill that was successfully matched (for follow-up context) */
let _lastSkill: SkillEntry | null = null;

/**
 * Test user input against every registered skill's trigger patterns.
 * If no direct match, checks for follow-up context.
 * Returns the first match, or null if no skill matches.
 */
export function matchSkill(input: string): SkillEntry | null {
  const normalized = input.trim().toLowerCase();

  // Direct trigger match
  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      if (trigger.test(normalized)) {
        _lastSkill = skill;
        return skill;
      }
    }
  }

  // Follow-up detection
  if (_lastSkill && TIMEFRAME_SKILL_IDS.has(_lastSkill.id)) {
    const hasFollowupPhrase = FOLLOWUP_PATTERN.test(normalized);
    const hasTimeframe = TIMEFRAME_PATTERN.test(normalized);
    if (hasFollowupPhrase || hasTimeframe) {
      return _lastSkill;
    }
  }

  return null;
}

/** Reset follow-up context (e.g. on "New Chat" or API source toggle) */
export function clearLastSkill(): void {
  _lastSkill = null;
}
