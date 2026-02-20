/**
 * Locations Skill
 *
 * Lists all Cloud9 practice locations, or shows details for a specific one.
 * Handles queries like:
 *   "show locations"
 *   "list offices"
 *   "show all locations"
 *   "practice locations"
 *   "details on Allegheny"
 *   "show me the Allegheny location"
 *   "location info for Philadelphia"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getLocations } from '../../services/api/referenceApi';
import type { Location } from '../../types';

/** Words that should not be treated as location name searches. */
const LISTING_WORDS = new Set(['all', 'every', 'each', 'the', 'our', 'my', 'practice', 'available']);

/** Try to extract a location name from the query. */
function extractLocationName(query: string): string | null {
  const patterns = [
    /(?:details?\s+(?:on|of|for|about)\s+(?:the\s+)?)(.+?)(?:\s+location|\s+office)?$/i,
    /(?:show|get|find)\s+(?:me\s+)?(?:the\s+)?(.+?)\s+location/i,
    /(?:location|office)\s+(?:info|details?|information)\s+(?:for|on|about)\s+(?:the\s+)?(.+)/i,
    /(?:info|details?|information)\s+(?:for|on|about)\s+(?:the\s+)?(.+?)\s+(?:location|office)/i,
    /(?:tell\s+me\s+about)\s+(?:the\s+)?(.+?)\s+(?:location|office)/i,
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m && m[1]) {
      const name = m[1].trim();
      // Skip common listing words - "show me all locations" means list all, not search for "all"
      if (LISTING_WORDS.has(name.toLowerCase())) return null;
      return name;
    }
  }
  return null;
}

function formatLocationDetail(loc: Location): string {
  const lines: string[] = [];
  lines.push(`## ${loc.name}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Name** | ${loc.name} |`);
  lines.push(`| **Code** | ${loc.code} |`);
  lines.push(`| **GUID** | \`${loc.guid}\` |`);
  if (loc.address) {
    const parts = [loc.address.street, loc.address.city, loc.address.state, loc.address.postalCode].filter(Boolean);
    if (parts.length) lines.push(`| **Address** | ${parts.join(', ')} |`);
  }
  if (loc.phoneNumber) lines.push(`| **Phone** | ${loc.phoneNumber} |`);
  if (loc.timeZone) lines.push(`| **Timezone** | ${loc.timeZone} |`);
  return lines.join('\n');
}

async function execute(query: string): Promise<SkillResult> {
  try {
    const locations = await getLocations();

    if (locations.length === 0) {
      return {
        success: true,
        markdown: '## Practice Locations\n\nNo locations found.',
        data: [],
      };
    }

    // Check if user asked about a specific location
    const searchName = extractLocationName(query);
    if (searchName) {
      const lower = searchName.toLowerCase();
      const matches = locations.filter((l) => {
        if (l.name.toLowerCase().includes(lower)) return true;
        if (l.code.toLowerCase().includes(lower)) return true;
        if ((l as any).printedName?.toLowerCase().includes(lower)) return true;
        if (l.address) {
          const { street, city, state, postalCode } = l.address;
          if (street?.toLowerCase().includes(lower)) return true;
          if (city?.toLowerCase().includes(lower)) return true;
          if (state?.toLowerCase().includes(lower)) return true;
          if (postalCode?.toLowerCase().includes(lower)) return true;
        }
        if (l.phoneNumber?.toLowerCase().includes(lower)) return true;
        return false;
      });

      if (matches.length === 0) {
        // Show all locations with city for easier identification
        const names = locations.map((l) => {
          const city = l.address?.city;
          return city ? `${l.name} (${city})` : l.name;
        }).join(', ');
        return {
          success: true,
          markdown: `## Location Not Found\n\nNo location matching **"${searchName}"**.\n\nAvailable locations: ${names}`,
          data: locations,
        };
      }

      if (matches.length === 1) {
        return { success: true, markdown: formatLocationDetail(matches[0]), data: matches };
      }

      // Multiple matches - show detail for each
      const md = matches.map(formatLocationDetail).join('\n\n---\n\n');
      return { success: true, markdown: md, data: matches };
    }

    // Default: list all locations
    const lines: string[] = [];
    lines.push('## Practice Locations');
    lines.push(`**${locations.length} location${locations.length !== 1 ? 's' : ''}**\n`);
    lines.push('| Name | Code | GUID | Address | Phone | Timezone |');
    lines.push('|------|------|------|---------|-------|----------|');

    for (const loc of locations) {
      const addr = loc.address
        ? [loc.address.street, loc.address.city, loc.address.state, loc.address.postalCode]
            .filter(Boolean)
            .join(', ')
        : '-';
      const phone = loc.phoneNumber || '-';
      const tz = loc.timeZone || '-';
      lines.push(`| ${loc.name} | ${loc.code} | \`${loc.guid}\` | ${addr} | ${phone} | ${tz} |`);
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
  category: 'cloud9',
  sampleQuery: 'Show all locations',
  triggers: [
    /(?:show|list|get)\s+(?:me\s+)?(?:all\s+)?(?:practice\s+)?locations/i,
    /(?:show|list|get)\s+(?:me\s+)?(?:all\s+)?offices/i,
    /practice\s+locations/i,
    /(?:where\s+are|what\s+are)\s+(?:the\s+)?(?:practice\s+)?(?:locations|offices)/i,
    /(?:details?|info|information)\s+(?:on|of|for|about)\s+(?:the\s+)?\w.+?\s*(?:location|office)/i,
    /(?:show|get|find|tell)\s+(?:me\s+)?(?:the\s+)?\w.+?\s+location/i,
    /location\s+(?:info|details?|information)\s+(?:for|on|about)\s/i,
  ],
  execute,
};
