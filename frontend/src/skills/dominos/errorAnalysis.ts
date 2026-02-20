/**
 * Error Analysis Skill
 *
 * Fetches error breakdown and top errors by type, formats them for display.
 * Handles queries like:
 *   "show error breakdown"
 *   "what errors"
 *   "what's failing"
 *   "error summary"
 *   "top errors"
 */

import type { SkillEntry, SkillResult } from './types';
import { getErrorBreakdown, getErrorsByType } from '../../services/api/dominosApi';

function formatTimestamp(ts: string): string {
  if (!ts) return 'N/A';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true,
    });
  } catch {
    return ts;
  }
}

async function execute(_query: string): Promise<SkillResult> {
  try {
    const [breakdown, byType] = await Promise.all([
      getErrorBreakdown(),
      getErrorsByType(),
    ]);

    const lines: string[] = [];
    const totalErrors = breakdown.reduce((sum, e) => sum + e.count, 0);

    lines.push('## Error Analysis');
    lines.push('');
    lines.push(`**${totalErrors}** total errors recorded`);
    lines.push('');

    // Error breakdown table
    if (breakdown.length > 0) {
      lines.push('### Error Breakdown');
      lines.push('');
      lines.push('| Error Type | Count | % | Last Occurred |');
      lines.push('|:-----------|------:|--:|:--------------|');
      for (const e of breakdown) {
        const pct = totalErrors > 0 ? ((e.count / totalErrors) * 100).toFixed(1) : '0.0';
        lines.push(`| ${e.error_type || 'Unknown'} | ${e.count} | ${pct}% | ${formatTimestamp(e.last_occurred)} |`);
      }
    } else {
      lines.push('No errors found in the current period.');
    }

    // Top errors by type
    if (byType.length > 0) {
      lines.push('');
      lines.push('### Top Errors by Type');
      lines.push('');
      for (const e of byType.slice(0, 10)) {
        lines.push(`- **${e.type || 'Unknown'}** — ${e.count} occurrence${e.count !== 1 ? 's' : ''}`);
        if (e.examples && e.examples.length > 0) {
          for (const ex of e.examples.slice(0, 2)) {
            lines.push(`  - \`${ex}\``);
          }
        }
      }
    }

    return { success: true, markdown: lines.join('\n'), data: { breakdown, byType, totalErrors } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Error Analysis Failed\n\nCould not fetch error data: ${msg}`,
    };
  }
}

export const errorAnalysisSkill: SkillEntry = {
  id: 'error-analysis',
  label: 'Error Analysis',
  category: 'dominos-orders',
  sampleQuery: 'Show error breakdown',
  triggers: [
    /(?:show|get|display)\s+(?:the\s+)?error\s+(?:breakdown|summary|analysis)/i,
    /what(?:'s|\s+is)\s+failing/i,
    /what\s+errors/i,
    /\btop\s+errors\b/i,
    /\berror\s+(?:report|overview)\b/i,
  ],
  execute,
};
