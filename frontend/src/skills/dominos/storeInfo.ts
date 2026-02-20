/**
 * Store Info Skill
 *
 * Fetches and formats Dominos store information.
 * Handles queries like:
 *   "store info for 4332"
 *   "get store info"
 *   "store details"
 *   "store address for 7539"
 *   "store phone"
 */

import type { SkillEntry, SkillResult } from './types';
import { getStoreInfo } from '../../services/api/dominosApi';

const DEFAULT_STORE_ID = '4332';

function extractStoreId(query: string): string {
  const m = query.match(/(?:store|#)\s*(?:id\s*)?#?\s*(\d{3,5})/i);
  if (m) return m[1];
  // Also match bare store number at end: "store info 4332"
  const m2 = query.match(/\b(\d{4,5})\b/);
  return m2 ? m2[1] : DEFAULT_STORE_ID;
}

async function execute(query: string): Promise<SkillResult> {
  const storeId = extractStoreId(query);

  try {
    const info = await getStoreInfo(storeId);

    if (!info) {
      return {
        success: false,
        markdown: `## Store Info\n\nNo information found for store **${storeId}**. The store may not exist or the service may be unavailable.`,
      };
    }

    const lines: string[] = [];
    lines.push(`## Store ${info.storeId || storeId}`);
    lines.push('');

    if (info.name) lines.push(`**Name:** ${info.name}`);

    const address = [info.street, info.city, info.region].filter(Boolean).join(', ');
    if (address) {
      lines.push(`**Address:** ${address}`);
    } else if (info.address) {
      lines.push(`**Address:** ${info.address}`);
    }

    if (info.phone) lines.push(`**Phone:** ${info.phone}`);
    lines.push(`**Store ID:** ${info.storeId || storeId}`);

    return { success: true, markdown: lines.join('\n'), data: info };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Store Info Failed\n\nCould not fetch info for store **${storeId}**: ${msg}`,
    };
  }
}

export const storeInfoSkill: SkillEntry = {
  id: 'store-info',
  label: 'Store Info',
  category: 'dominos-menu',
  sampleQuery: 'Store info for 4332',
  triggers: [
    /store\s+(?:info|details|information)\b/i,
    /(?:get|show|find|what(?:'s|\s+is))\s+(?:the\s+)?(?:store\s+)?(?:address|phone|location)\s+(?:for|of)/i,
    /(?:what(?:'s|\s+is)\s+the\s+address\s+for\s+store)/i,
    /info\s+(?:for|on|about)\s+store/i,
  ],
  execute,
};
