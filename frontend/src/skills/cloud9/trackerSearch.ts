/**
 * Tracker Search Skill
 *
 * Searches production test records by patient name.
 * Handles queries like:
 *   "find test record Smith"
 *   "tracker search Smith"
 *   "test patient Smith"
 *   "search tracker for Canales"
 *   "tracker record Canales"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProdTestRecords } from '../../services/api/testMonitorApi';

function extractName(query: string): string | null {
  const m = query.match(/(?:test\s+(?:record|patient)|tracker\s+(?:search|record)?)\s+(?:for\s+)?(\w+)/i);
  return m ? m[1] : null;
}

async function execute(query: string): Promise<SkillResult> {
  const name = extractName(query);
  if (!name) {
    return {
      success: false,
      markdown: '## Tracker Search\n\nCould not extract a name from your query. Try: "tracker search Smith" or "find test record Canales"',
    };
  }

  try {
    const { records } = await getProdTestRecords({ sortOrder: 'desc', limit: 50 });
    const needle = name.toLowerCase();
    const matches = records.filter(r =>
      (r.patient_first_name && r.patient_first_name.toLowerCase().includes(needle)) ||
      (r.patient_last_name && r.patient_last_name.toLowerCase().includes(needle))
    );

    if (matches.length === 0) {
      return {
        success: true,
        markdown: `## Tracker Search: "${name}"\n\nNo test records found matching "${name}".`,
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## Tracker Search: "${name}" (${matches.length} found)\n`);
    lines.push(`| ID | Type | Name | Status | Date | Appt Details |`);
    lines.push(`|----|------|------|--------|------|-------------|`);

    for (const r of matches) {
      const fullName = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '-';
      const date = r.cloud9_created_at
        ? new Date(r.cloud9_created_at).toLocaleDateString()
        : r.created_at
          ? new Date(r.created_at).toLocaleDateString()
          : '-';
      const apptDetails = r.record_type === 'appointment'
        ? [r.appointment_type, r.location_name].filter(Boolean).join(', ') || '-'
        : '-';

      const nameCell = r.patient_guid ? `[${fullName}](/patients/${r.patient_guid})` : fullName;
      lines.push(`| ${r.id} | ${r.record_type} | ${nameCell} | ${r.status} | ${date} | ${apptDetails} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: matches };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Tracker Search Failed\n\nCould not search records: ${msg}`,
    };
  }
}

export const trackerSearchSkill: SkillEntry = {
  id: 'tracker-search',
  label: 'Tracker Search',
  triggers: [
    /(?:find|search)\s+test\s+(?:record|patient)\s+/i,
    /tracker\s+(?:search|record)\s+/i,
    /test\s+patient\s+\w+/i,
    /search\s+tracker\s+(?:for\s+)?\w+/i,
  ],
  execute,
};
