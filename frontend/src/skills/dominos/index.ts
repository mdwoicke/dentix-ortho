/**
 * Dominos Skills Registry
 *
 * Central registry of client-side "skills" that intercept certain chat queries
 * and produce formatted output without hitting the backend API agent.
 *
 * Usage:
 *   import { matchSkill } from '../../skills/dominos';
 *   const skill = matchSkill(userInput);
 *   if (skill) { const result = await skill.execute(userInput); }
 */

export type { SkillResult, SkillFn, SkillEntry } from './types';

import { menuLookupSkill } from './menuLookup';
import { couponSearchSkill } from './couponSearch';
import { sampleOrderSkill } from './sampleOrder';
import type { SkillEntry } from './types';

/** All registered Dominos skills. */
const skills: SkillEntry[] = [
  menuLookupSkill,
  couponSearchSkill,
  sampleOrderSkill,
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
