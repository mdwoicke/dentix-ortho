/**
 * Cloud9 Skills Registry
 *
 * Central registry of client-side "skills" that intercept certain chat queries
 * and produce formatted output without hitting the backend API agent.
 *
 * Usage:
 *   import { matchSkill, clearLastSkill } from '../../skills/cloud9';
 *   const skill = matchSkill(userInput);
 *   if (skill) { const result = await skill.execute(userInput); }
 */

export type { SkillResult, SkillFn, SkillEntry } from '../dominos/types';

import { patientSearchSkill } from './patientSearch';
import { trackerSearchSkill } from './trackerSearch';
import { locationsSkill } from './locations';
import { appointmentTypesSkill } from './appointmentTypes';
import { providersSkill } from './providers';
import { sessionLookupSkill } from './sessionLookup';
import { callStatsSkill } from './callStats';
import { traceInsightsSkill } from './traceInsights';
import { errorSessionsSkill } from './errorSessions';
import { sessionsByPatientSkill } from './sessionsByPatient';
import { trackerStatsSkill } from './trackerStats';
import { activeAppointmentsSkill } from './activeAppointments';
import { cancelledRecordsSkill } from './cancelledRecords';
import { appointmentsByLocationSkill } from './appointmentsByLocation';
import { appointmentsByProviderSkill } from './appointmentsByProvider';
import { familyRecordsSkill } from './familyRecords';
import { cacheHealthSkill } from './cacheHealth';
import { recentSessionsSkill } from './recentSessions';
import { queueActivitySkill } from './queueActivity';
import { promptVersionsSkill } from './promptVersions';
import type { SkillEntry } from '../dominos/types';

/**
 * All registered Cloud9 skills.
 * Order matters - first match wins. More specific triggers come first.
 */
const skills: SkillEntry[] = [
  patientSearchSkill,          // "find patient..." - most specific
  trackerSearchSkill,          // "find test record..." / "tracker search..." - before generic
  locationsSkill,              // "show locations"
  appointmentTypesSkill,       // "show appointment types"
  providersSkill,              // "show providers"
  sessionLookupSkill,          // "show session {id}" - before recentSessions
  callStatsSkill,              // "how many calls today" / "call stats"
  traceInsightsSkill,          // "show insights" / "call analytics"
  errorSessionsSkill,          // "error sessions" / "failed calls"
  sessionsByPatientSkill,      // "calls for Smith" - before recentSessions
  trackerStatsSkill,           // "tracker stats"
  activeAppointmentsSkill,     // "active test appointments"
  cancelledRecordsSkill,       // "cancelled appointments"
  appointmentsByLocationSkill, // "appointments at Philly"
  appointmentsByProviderSkill, // "appointments with Dr..."
  familyRecordsSkill,          // "family records"
  cacheHealthSkill,            // "cache health"
  recentSessionsSkill,         // "recent sessions"
  queueActivitySkill,          // "queue stats"
  promptVersionsSkill,         // "prompt versions"
];

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
 * If no direct match, checks for follow-up context (e.g. "how about yesterday"
 * after a call stats query).
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

/** Reset follow-up context (e.g. on "New Chat" or API source toggle) */
export function clearLastSkill(): void {
  _lastSkill = null;
}
