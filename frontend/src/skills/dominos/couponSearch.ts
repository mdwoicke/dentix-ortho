/**
 * Coupon Search Skill
 *
 * Fetches coupons for a Dominos store and filters them by keyword(s).
 * Handles queries like:
 *   "find coupons that have wings for store 7539"
 *   "search coupons for pizza at store 4332"
 *   "show coupons with chicken for 7539"
 *   "coupons for store 4332"           (no filter — shows all)
 *   "find wing coupons"                (no store — uses default)
 */

import type { SkillEntry, SkillResult } from './types';
import { getStoreCoupons } from '../../services/api/dominosApi';
import type { DominosCoupon } from '../../types/dominos.types';

const DEFAULT_STORE_ID = '4332';

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function extractStoreId(query: string): string {
  const m = query.match(/store\s*(?:id\s*)?#?\s*(\d{3,5})/i);
  return m ? m[1] : DEFAULT_STORE_ID;
}

/**
 * Pull search keywords from the query after stripping the "noise" words.
 * e.g. "find coupons that have wings for store 7539" → ["wings"]
 *      "search coupons for pepperoni pizza" → ["pepperoni", "pizza"]
 */
function extractKeywords(query: string): string[] {
  // Remove structural/noise phrases
  let cleaned = query.toLowerCase();
  cleaned = cleaned.replace(/store\s*(?:id\s*)?#?\s*\d{3,5}/gi, '');
  cleaned = cleaned.replace(
    /\b(find|search|show|list|get|fetch|look\s*up|display|coupons?|coupon|deals?|that\s+have|that\s+include|with|for|at|the|a|an|all|any|me|available|dominos?)\b/gi,
    '',
  );
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 1);
  return tokens;
}

/**
 * Score how well a coupon matches the keywords.
 * Checks code, name, and description fields.
 */
function matchScore(coupon: DominosCoupon, keywords: string[]): number {
  if (keywords.length === 0) return 1; // no filter → everything matches
  const searchable = `${coupon.code} ${coupon.name} ${coupon.description}`.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (searchable.includes(kw)) hits++;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatPrice(price: number): string {
  return price > 0 ? `$${price.toFixed(2)}` : 'Varies';
}

function formatServiceMethods(methods?: string[]): string {
  if (!methods || methods.length === 0) return 'Delivery & Carryout';
  return methods.map(m => {
    if (m === 'Delivery') return 'Delivery';
    if (m === 'Carryout') return 'Carryout';
    return m;
  }).join(' & ');
}

function formatCouponCard(c: DominosCoupon, index: number): string {
  const lines: string[] = [];

  lines.push(`### ${index}. ${c.name || 'Unnamed Coupon'}`);
  lines.push('');
  lines.push(`**Code:** \`${c.code}\` | **Price:** ${formatPrice(c.price)} | **${formatServiceMethods(c.validServiceMethods)}**`);

  if (c.description) {
    lines.push('');
    lines.push(`${c.description}`);
  }

  if (c.isLocal || c.isBundle) {
    const tags: string[] = [];
    if (c.isLocal) tags.push('Local Only');
    if (c.isBundle) tags.push('Bundle Deal');
    lines.push('');
    lines.push(`*${tags.join(' | ')}*`);
  }

  return lines.join('\n');
}

function formatMarkdown(
  storeId: string,
  keywords: string[],
  matches: DominosCoupon[],
  totalCount: number,
): string {
  const lines: string[] = [];
  const filterLabel = keywords.length > 0
    ? ` matching **${keywords.join(', ')}**`
    : '';

  lines.push(`## Coupons for Store ${storeId}${filterLabel}`);
  lines.push('');

  if (matches.length === 0) {
    lines.push(`No coupons found${filterLabel} (${totalCount} total coupons available).`);
    if (keywords.length > 0) {
      lines.push('');
      lines.push('Try broadening your search or using different keywords.');
    }
    return lines.join('\n');
  }

  lines.push(`Found **${matches.length}** coupon${matches.length === 1 ? '' : 's'}${keywords.length > 0 ? ` out of ${totalCount} total` : ''}:`);

  // Render each coupon as a card, capped at 20
  const shown = matches.slice(0, 20);
  for (let i = 0; i < shown.length; i++) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(formatCouponCard(shown[i], i + 1));
  }

  if (matches.length > 20) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`*...and ${matches.length - 20} more results. Try a more specific search to narrow down.*`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill entry
// ---------------------------------------------------------------------------

async function execute(query: string): Promise<SkillResult> {
  const storeId = extractStoreId(query);
  const keywords = extractKeywords(query);

  let allCoupons: DominosCoupon[];
  try {
    allCoupons = await getStoreCoupons(storeId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Coupon Search Failed\n\nCould not fetch coupons for store **${storeId}**: ${msg}\n\nMake sure the Dominos service is configured for this tenant.`,
    };
  }

  // Score and filter
  const scored = allCoupons
    .map(c => ({ coupon: c, score: matchScore(c, keywords) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const matches = scored.map(s => s.coupon);
  const markdown = formatMarkdown(storeId, keywords, matches, allCoupons.length);

  return { success: true, markdown, data: { storeId, keywords, matches } };
}

export const couponSearchSkill: SkillEntry = {
  id: 'coupon-search',
  label: 'Search Coupons',
  triggers: [
    /(?:find|search|show|list|get|look\s*up)\s+(?:.*\s+)?coupons?/i,
    /coupons?\s+(?:for|at|with|that|matching|having)/i,
    /coupons?\s+(?:store|#?\d{3,5})/i,
    /(?:find|search)\s+(?:.*\s+)?deals?\s+/i,
  ],
  execute,
};
