/**
 * Providers Skill
 *
 * Lists Cloud9 providers/chairs grouped by location.
 * Handles queries like:
 *   "show providers"
 *   "list providers"
 *   "show chairs"
 *   "list doctors"
 *   "provider list"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProviders } from '../../services/api/referenceApi';

function truncGuid(guid: string): string {
  return guid.length > 12 ? guid.slice(0, 8) + '...' : guid;
}

async function execute(_query: string): Promise<SkillResult> {
  try {
    const providers = await getProviders();

    if (providers.length === 0) {
      return {
        success: true,
        markdown: '## Providers\n\nNo providers found.',
        data: [],
      };
    }

    // Group by location
    const byLocation = new Map<string, typeof providers>();
    for (const p of providers) {
      const key = p.locationName || 'Unknown';
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(p);
    }

    const lines: string[] = [];
    lines.push('## Providers / Chairs');
    lines.push(`**${providers.length} provider${providers.length !== 1 ? 's' : ''}** across ${byLocation.size} location${byLocation.size !== 1 ? 's' : ''}\n`);

    for (const [locName, locProviders] of byLocation) {
      lines.push(`### ${locName} (${locProviders.length})`);
      lines.push('');
      lines.push('| Schedule View | Column (Chair) | View GUID | Column GUID |');
      lines.push('|--------------|----------------|-----------|-------------|');

      for (const p of locProviders) {
        lines.push(
          `| ${p.scheduleViewDescription} | ${p.scheduleColumnDescription} | ${truncGuid(p.scheduleViewGuid)} | ${truncGuid(p.scheduleColumnGuid)} |`
        );
      }
      lines.push('');
    }

    return { success: true, markdown: lines.join('\n'), data: providers };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Providers Failed\n\nCould not fetch providers: ${msg}`,
    };
  }
}

export const providersSkill: SkillEntry = {
  id: 'providers',
  label: 'Providers',
  triggers: [
    /(?:show|list|get)\s+(?:all\s+)?providers/i,
    /(?:show|list|get)\s+(?:all\s+)?(?:chairs|doctors)/i,
    /provider\s+list/i,
    /(?:what|who)\s+(?:are\s+)?(?:the\s+)?(?:providers|doctors|chairs)/i,
  ],
  execute,
};
