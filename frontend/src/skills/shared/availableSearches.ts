/**
 * Available Searches Skill — Shared Factory
 *
 * Creates a skill that lists all available skills for the current tab/category.
 * Works with both Cloud9 and Dominos registries.
 */

import type { SkillEntry, SkillResult } from '../dominos/types';

/** Human-readable labels for each category key. */
const CATEGORY_LABELS: Record<string, string> = {
  call: 'Call Tracing',
  cloud9: 'Cloud9 API',
  nodered: 'Node-RED',
  'dominos-menu': 'Menu / Coupons',
  'dominos-orders': 'Orders',
  'dominos-traces': 'Trace Calls',
};

interface AvailableSearchesConfig {
  /** Returns the currently active tab/source. */
  getCurrentSource: () => string;
}

/**
 * Build one category section as markdown.
 */
function renderCategory(label: string, skills: SkillEntry[]): string[] {
  const lines: string[] = [];
  lines.push(`### ${label} (${skills.length})\n`);
  lines.push('| # | Skill | Sample Query |');
  lines.push('|---|-------|-------------|');
  skills.forEach((s, i) => {
    const sample = s.sampleQuery ? `\`${s.sampleQuery}\`` : '-';
    lines.push(`| ${i + 1} | **${s.label}** | ${sample} |`);
  });
  return lines;
}

/**
 * Factory: creates an "available searches" SkillEntry for any skill registry.
 */
export function createAvailableSearchesSkill(
  allSkills: SkillEntry[],
  config: AvailableSearchesConfig,
): SkillEntry {
  async function execute(query: string): Promise<SkillResult> {
    const q = query.toLowerCase();
    const showAll = /\ball\b/.test(q);

    // Only include skills that have a category (excludes the help skill itself)
    const categorized = allSkills.filter((s) => s.category);

    if (showAll) {
      // Group by category
      const groups = new Map<string, SkillEntry[]>();
      for (const s of categorized) {
        const cat = s.category!;
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(s);
      }

      const totalSkills = categorized.length;
      const lines: string[] = [];
      lines.push(`## All Available Searches`);
      lines.push(`**${totalSkills} skills across ${groups.size} categories**\n`);

      for (const [cat, skills] of groups) {
        const label = CATEGORY_LABELS[cat] ?? cat;
        lines.push(...renderCategory(label, skills));
        lines.push('');
      }

      return { success: true, markdown: lines.join('\n'), data: { total: totalSkills } };
    }

    // Filter to current tab
    const currentSource = config.getCurrentSource();
    const filtered = categorized.filter((s) => s.category === currentSource);
    const label = CATEGORY_LABELS[currentSource] ?? currentSource;

    const lines: string[] = [];
    lines.push(`## Available Searches: ${label}`);
    lines.push(`**${filtered.length} skills available**\n`);

    if (filtered.length === 0) {
      lines.push('No skills registered for this category.');
      return { success: true, markdown: lines.join('\n') };
    }

    lines.push('| # | Skill | Sample Query |');
    lines.push('|---|-------|-------------|');
    filtered.forEach((s, i) => {
      const sample = s.sampleQuery ? `\`${s.sampleQuery}\`` : '-';
      lines.push(`| ${i + 1} | **${s.label}** | ${sample} |`);
    });

    return { success: true, markdown: lines.join('\n'), data: { count: filtered.length } };
  }

  return {
    id: 'available-searches',
    label: 'Available Searches',
    triggers: [
      /(?:what|which)\s+(?:searches|skills|commands?)\s+(?:are\s+)?(?:available|exist)/i,
      /(?:available|show|list)\s+(?:searches|skills|commands)/i,
      /what\s+can\s+(?:i|you)\s+(?:search|do|ask)/i,
      /^help$/i,
    ],
    execute,
  };
}
