/**
 * Tracker Stats Skill
 *
 * Shows production test record statistics overview.
 * Handles queries like:
 *   "tracker stats"
 *   "test record stats"
 *   "how many test patients"
 *   "test appointment count"
 *   "prod tracker stats"
 *   "tracker overview"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProdTestRecordStats } from '../../services/api/testMonitorApi';

async function execute(_query: string): Promise<SkillResult> {
  try {
    const stats = await getProdTestRecordStats();

    const lines: string[] = [];
    lines.push(`## Prod Tracker Stats\n`);
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| **Total Patients** | ${stats.totalPatients} |`);
    lines.push(`| **Active Patients** | ${stats.activePatients} |`);
    lines.push(`| **Total Appointments** | ${stats.totalAppointments} |`);
    lines.push(`| **Active Appointments** | ${stats.activeAppointments} |`);
    lines.push(`| **Cancelled Appointments** | ${stats.cancelledAppointments} |`);
    lines.push(`| **Deleted Records** | ${stats.deletedRecords} |`);

    return { success: true, markdown: lines.join('\n'), data: stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Tracker Stats Failed\n\nCould not fetch stats: ${msg}`,
    };
  }
}

export const trackerStatsSkill: SkillEntry = {
  id: 'tracker-stats',
  label: 'Tracker Stats',
  category: 'nodered',
  sampleQuery: 'Show tracker stats',
  triggers: [
    /tracker\s+(?:stats|overview|summary)/i,
    /(?:test\s+record|prod\s+tracker)\s+stats/i,
    /how\s+many\s+test\s+(?:patients|appointments)/i,
    /test\s+(?:appointment|patient)\s+count/i,
  ],
  execute,
};
