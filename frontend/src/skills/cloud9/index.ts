/**
 * Cloud9 Skills Registry
 *
 * Central registry of client-side "skills" that intercept certain chat queries
 * and produce formatted output without hitting the backend API agent.
 *
 * Usage:
 *   import { matchSkill } from '../../skills/cloud9';
 *   const skill = matchSkill(userInput);
 *   if (skill) { const result = await skill.execute(userInput); }
 */

export type { SkillResult, SkillFn, SkillEntry } from '../dominos/types';

import { patientSearchSkill } from './patientSearch';
import { locationsSkill } from './locations';
import { appointmentTypesSkill } from './appointmentTypes';
import { providersSkill } from './providers';
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
  patientSearchSkill,     // "find patient..." - most specific
  locationsSkill,         // "show locations"
  appointmentTypesSkill,  // "show appointment types"
  providersSkill,         // "show providers"
  cacheHealthSkill,       // "cache health"
  recentSessionsSkill,    // "recent sessions"
  queueActivitySkill,     // "queue stats"
  promptVersionsSkill,    // "prompt versions"
];

/**
 * Test user input against every registered skill's trigger patterns.
 * Returns the first match, or null if no skill matches.
 */
export function matchSkill(input: string): SkillEntry | null {
  const normalized = input.trim().toLowerCase();
  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      if (trigger.test(normalized)) {
        return skill;
      }
    }
  }
  return null;
}
