/**
 * Appointment Types Skill
 *
 * Lists all Cloud9 appointment types.
 * Handles queries like:
 *   "show appointment types"
 *   "list appointment types"
 *   "what types of appointments"
 *   "appt types"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getAppointmentTypes } from '../../services/api/referenceApi';

function truncGuid(guid: string): string {
  return guid.length > 12 ? guid.slice(0, 8) + '...' : guid;
}

async function execute(_query: string): Promise<SkillResult> {
  try {
    const types = await getAppointmentTypes();

    if (types.length === 0) {
      return {
        success: true,
        markdown: '## Appointment Types\n\nNo appointment types found.',
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push('## Appointment Types');
    lines.push(`**${types.length} type${types.length !== 1 ? 's' : ''}**\n`);
    lines.push('| Description | Code | GUID | Duration | Online |');
    lines.push('|-------------|------|------|----------|--------|');

    for (const t of types) {
      const dur = t.durationMinutes ? `${t.durationMinutes} min` : '-';
      const online = t.allowOnlineScheduling ? 'Yes' : 'No';
      lines.push(`| ${t.description} | ${t.code} | ${truncGuid(t.guid)} | ${dur} | ${online} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: types };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Appointment Types Failed\n\nCould not fetch appointment types: ${msg}`,
    };
  }
}

export const appointmentTypesSkill: SkillEntry = {
  id: 'appointment-types',
  label: 'Appointment Types',
  triggers: [
    /(?:show|list|get)\s+(?:all\s+)?appo?i?ntment\s+types/i,
    /(?:show|list|get)\s+(?:all\s+)?appt\s+types/i,
    /what\s+(?:types?\s+of\s+)?appo?i?ntments?\b/i,
    /appt\s+types/i,
    /appointment\s+type\s+list/i,
  ],
  execute,
};
