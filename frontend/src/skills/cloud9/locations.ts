/**
 * Locations Skill
 *
 * Lists all Cloud9 practice locations.
 * Handles queries like:
 *   "show locations"
 *   "list offices"
 *   "show all locations"
 *   "practice locations"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getLocations } from '../../services/api/referenceApi';

async function execute(_query: string): Promise<SkillResult> {
  try {
    const locations = await getLocations();

    if (locations.length === 0) {
      return {
        success: true,
        markdown: '## Practice Locations\n\nNo locations found.',
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push('## Practice Locations');
    lines.push(`**${locations.length} location${locations.length !== 1 ? 's' : ''}**\n`);
    lines.push('| Name | Code | Address | Phone | Timezone |');
    lines.push('|------|------|---------|-------|----------|');

    for (const loc of locations) {
      const addr = loc.address
        ? [loc.address.street, loc.address.city, loc.address.state, loc.address.postalCode]
            .filter(Boolean)
            .join(', ')
        : '-';
      const phone = loc.phoneNumber || '-';
      const tz = loc.timeZone || '-';
      lines.push(`| ${loc.name} | ${loc.code} | ${addr} | ${phone} | ${tz} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: locations };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Locations Failed\n\nCould not fetch locations: ${msg}`,
    };
  }
}

export const locationsSkill: SkillEntry = {
  id: 'locations',
  label: 'Locations',
  triggers: [
    /(?:show|list|get)\s+(?:all\s+)?(?:practice\s+)?locations/i,
    /(?:show|list|get)\s+(?:all\s+)?offices/i,
    /practice\s+locations/i,
    /(?:where\s+are|what\s+are)\s+(?:the\s+)?(?:practice\s+)?(?:locations|offices)/i,
  ],
  execute,
};
