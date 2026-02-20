/**
 * Family Records Skill
 *
 * Shows family groups from the prod tracker (parent + children linked via family_id).
 * Handles queries like:
 *   "show family records"
 *   "family groups"
 *   "sibling bookings"
 *   "multi-child records"
 *   "families with bookings"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProdTestRecords, type ProdTestRecord } from '../../services/api/testMonitorApi';

function formatDateTime(dt: string | null): string {
  if (!dt) return null as unknown as string;
  const d = new Date(dt);
  return `${d.toLocaleDateString()} @ ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

interface FamilyGroup {
  familyId: string;
  parent: ProdTestRecord | null;
  children: ProdTestRecord[];
  lastName: string;
}

async function execute(_query: string): Promise<SkillResult> {
  try {
    const { records } = await getProdTestRecords({ limit: 200 });

    // Group records by family_id (non-null only)
    const familyMap = new Map<string, ProdTestRecord[]>();
    for (const r of records) {
      if (!r.family_id) continue;
      const list = familyMap.get(r.family_id) || [];
      list.push(r);
      familyMap.set(r.family_id, list);
    }

    if (familyMap.size === 0) {
      return {
        success: true,
        markdown: '## Family Groups\n\nNo family records found (no records with family_id).',
        data: [],
      };
    }

    // Build family structures
    const families: FamilyGroup[] = [];
    for (const [familyId, members] of familyMap) {
      const parent = members.find(r => !r.is_child) || null;
      const children = members.filter(r => r.is_child);
      const lastName = parent?.patient_last_name
        || children[0]?.patient_last_name
        || 'Unknown';
      families.push({ familyId, parent, children, lastName });
    }

    // Sort by last name
    families.sort((a, b) => a.lastName.localeCompare(b.lastName));

    const lines: string[] = [];
    lines.push(`## Family Groups (${families.length} families found)\n`);

    for (const fam of families) {
      lines.push(`### ${fam.lastName} Family`);

      if (fam.parent) {
        const p = fam.parent;
        const name = [p.patient_first_name, p.patient_last_name].filter(Boolean).join(' ');
        const nameLink = p.patient_guid ? `[${name}](/patients/${p.patient_guid})` : name;
        const appt = formatDateTime(p.appointment_datetime);
        const type = p.appointment_type || '';
        const apptStr = appt ? `${appt} ${type}` : 'No appointment';
        lines.push(`**Parent:** ${nameLink} - ${apptStr} (${p.status})`);
      } else {
        lines.push(`**Parent:** _(not found)_`);
      }

      if (fam.children.length > 0) {
        lines.push(`**Children:**`);
        for (const c of fam.children) {
          const name = [c.patient_first_name, c.patient_last_name].filter(Boolean).join(' ');
          const nameLink = c.patient_guid ? `[${name}](/patients/${c.patient_guid})` : name;
          const appt = formatDateTime(c.appointment_datetime);
          const type = c.appointment_type || '';
          const apptStr = appt ? `${appt} ${type} (${c.status})` : 'No appointment';
          lines.push(`- ${nameLink} - ${apptStr}`);
        }
      } else {
        lines.push(`**Children:** _(none)_`);
      }

      lines.push('\n---');
    }

    return { success: true, markdown: lines.join('\n'), data: families };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Family Records Failed\n\nCould not fetch records: ${msg}`,
    };
  }
}

export const familyRecordsSkill: SkillEntry = {
  id: 'family-records',
  label: 'Family Records',
  category: 'cloud9',
  sampleQuery: 'Show family records',
  triggers: [
    /(?:show|list|get)\s+(?:me\s+)?(?:the\s+)?famil(?:y|ies)\s*(?:records?|groups?|bookings?)?/i,
    /family\s+(?:records?|groups?|bookings?|members?)/i,
    /sibling\s+(?:bookings?|records?|appointments?)/i,
    /multi[- ]?child\s+(?:records?|bookings?|families?)/i,
    /(?:parent|children)\s+(?:and\s+)?(?:children|parent)?\s*(?:bookings?|records?)/i,
  ],
  execute,
};
