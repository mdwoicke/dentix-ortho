/**
 * Menu Browser Skill
 *
 * Fetches **live** menu data from a Dominos store API with real-time
 * prices and availability. Different from the menuLookup skill which
 * searches a hardcoded local catalog.
 *
 * Handles queries like:
 *   "show menu for store 4332"
 *   "browse menu"
 *   "what items available"
 *   "live menu"
 *   "show pizza menu for store 4332"
 */

import type { SkillEntry, SkillResult } from './types';
import { getStoreMenu } from '../../services/api/dominosApi';
import type { DominosMenuItem } from '../../types/dominos.types';

const DEFAULT_STORE_ID = '4332';

function extractStoreId(query: string): string {
  const m = query.match(/store\s*(?:id\s*)?#?\s*(\d{3,5})/i);
  if (m) return m[1];
  const m2 = query.match(/\b(\d{4,5})\b/);
  return m2 ? m2[1] : DEFAULT_STORE_ID;
}

function extractCategoryFilter(query: string): string | null {
  const filters: [RegExp, string][] = [
    [/\bpizza\b/i, 'Pizza'],
    [/\bwing/i, 'Wings'],
    [/\bbread\b/i, 'Bread'],
    [/\bdrink/i, 'Drinks'],
    [/\bdessert/i, 'Dessert'],
    [/\bpasta\b/i, 'Pasta'],
    [/\bsandwich/i, 'Sandwich'],
    [/\bsides?\b/i, 'Sides'],
    [/\bchicken\b/i, 'Chicken'],
  ];
  for (const [pattern, category] of filters) {
    if (pattern.test(query)) return category;
  }
  return null;
}

function formatPrice(price: number): string {
  return price > 0 ? `$${price.toFixed(2)}` : '—';
}

function groupByCategory(items: DominosMenuItem[]): Map<string, DominosMenuItem[]> {
  const groups = new Map<string, DominosMenuItem[]>();
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }
  return groups;
}

async function execute(query: string): Promise<SkillResult> {
  const storeId = extractStoreId(query);
  const categoryFilter = extractCategoryFilter(query);

  try {
    const { items } = await getStoreMenu(storeId);

    if (items.length === 0) {
      return {
        success: true,
        markdown: `## Live Menu for Store ${storeId}\n\nNo menu items returned. The store may be closed or the menu unavailable.`,
      };
    }

    // Apply category filter if specified
    let filtered = items;
    if (categoryFilter) {
      filtered = items.filter(item =>
        item.category.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    const grouped = groupByCategory(filtered);
    const lines: string[] = [];

    const filterLabel = categoryFilter ? ` — ${categoryFilter}` : '';
    lines.push(`## Live Menu for Store ${storeId}${filterLabel}`);
    lines.push('');
    lines.push(`**${filtered.length}** items${categoryFilter ? ` in ${categoryFilter}` : ''} (${items.length} total on menu)`);

    if (filtered.length === 0 && categoryFilter) {
      lines.push('');
      lines.push(`No items found matching "${categoryFilter}". Try a different category or browse the full menu.`);
      return { success: true, markdown: lines.join('\n'), data: { storeId, items: [] } };
    }

    // Cap display at 40 items total
    let displayed = 0;
    const maxDisplay = 40;

    for (const [category, categoryItems] of grouped) {
      if (displayed >= maxDisplay) break;

      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(`### ${category} (${categoryItems.length})`);
      lines.push('');
      lines.push('| Code | Item | Price | Available |');
      lines.push('|------|------|-------|-----------|');

      for (const item of categoryItems) {
        if (displayed >= maxDisplay) break;
        const avail = item.available ? '✅' : '❌';
        lines.push(`| \`${item.code}\` | ${item.name} | ${formatPrice(item.price)} | ${avail} |`);
        displayed++;
      }
    }

    if (filtered.length > maxDisplay) {
      lines.push('');
      lines.push(`*...and ${filtered.length - maxDisplay} more items. Use a category filter to narrow results (e.g. "show pizza menu").*`);
    }

    return { success: true, markdown: lines.join('\n'), data: { storeId, categoryFilter, items: filtered } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Menu Browser Failed\n\nCould not fetch menu for store **${storeId}**: ${msg}`,
    };
  }
}

export const menuBrowserSkill: SkillEntry = {
  id: 'menu-browser',
  label: 'Browse Store Menu',
  category: 'dominos-menu',
  sampleQuery: 'Show menu for store 4332',
  triggers: [
    /(?:show|browse|get|display|view)\s+(?:the\s+)?(?:live\s+)?(?:\w+\s+)?menu\s+(?:for|at|from)\s+store/i,
    /\blive\s+menu\b/i,
    /\bbrowse\s+(?:the\s+)?menu\b/i,
    /what\s+(?:items?|products?)\s+(?:are\s+)?available/i,
    /(?:show|get)\s+(?:the\s+)?(?:full|store|current)\s+menu\b/i,
  ],
  execute,
};
