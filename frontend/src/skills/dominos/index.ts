/**
 * Dominos Skills Registry
 *
 * Central registry of client-side "skills" that intercept certain chat queries
 * and produce formatted output without hitting the backend API agent.
 *
 * Usage:
 *   import { matchSkill, clearLastSkill } from '../../skills/dominos';
 *   const skill = matchSkill(userInput);
 *   if (skill) { const result = await skill.execute(userInput); }
 */

export type { SkillResult, SkillFn, SkillEntry } from './types';

import { menuLookupSkill } from './menuLookup';
import { couponSearchSkill } from './couponSearch';
import { menuBrowserSkill } from './menuBrowser';
import { storeInfoSkill } from './storeInfo';
import { dashboardStatsSkill } from './dashboardStats';
import { orderLogsSkill } from './orderLogs';
import { errorAnalysisSkill } from './errorAnalysis';
import { serviceHealthSkill } from './serviceHealth';
import { sampleOrderSkill } from './sampleOrder';
import type { SkillEntry } from './types';

/**
 * All registered Dominos skills.
 * Order matters — first match wins. More specific triggers come first.
 */
const skills: SkillEntry[] = [
  menuLookupSkill,      // "menu code for..." — local catalog
  couponSearchSkill,    // "find coupons..." — live API
  menuBrowserSkill,     // "show menu for store..." — live API (must be after menuLookup)
  storeInfoSkill,       // "store info for..."
  dashboardStatsSkill,  // "show dashboard stats"
  orderLogsSkill,       // "list recent orders"
  errorAnalysisSkill,   // "show error breakdown"
  serviceHealthSkill,   // "is service up"
  sampleOrderSkill,     // "create a sample order" — last (broadest triggers)
];

/** Skills that support follow-up timeframe queries */
const TIMEFRAME_SKILL_IDS = new Set(['dashboard-stats', 'order-logs', 'error-analysis']);

/** Pattern that detects follow-up queries with a timeframe but no explicit topic */
const FOLLOWUP_PATTERN = /(?:how\s+about|what\s+about|and\s+(?:for)?|same\s+(?:for|but))\s+/i;
const TIMEFRAME_PATTERN = /(?:today|yesterday|last\s+\w+|past\s+\w+|this\s+\w+|\d+\s+(?:days?|weeks?|hours?|months?))/i;

/** Last skill that was successfully matched (for follow-up context) */
let _lastSkill: SkillEntry | null = null;

/**
 * Test user input against every registered skill's trigger patterns.
 * If no direct match, checks for follow-up context (e.g. "how about last 2 weeks"
 * after a dashboard stats query).
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

  // Follow-up detection: if the query has a timeframe and the last skill supports it
  if (_lastSkill && TIMEFRAME_SKILL_IDS.has(_lastSkill.id)) {
    const hasFollowupPhrase = FOLLOWUP_PATTERN.test(normalized);
    const hasTimeframe = TIMEFRAME_PATTERN.test(normalized);
    if (hasFollowupPhrase || hasTimeframe) {
      return _lastSkill;
    }
  }

  return null;
}

/** Reset follow-up context (e.g. on "New Chat") */
export function clearLastSkill(): void {
  _lastSkill = null;
}
