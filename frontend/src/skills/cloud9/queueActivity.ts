/**
 * Queue Activity Skill
 *
 * Shows booking queue statistics.
 * Handles queries like:
 *   "booking queue stats"
 *   "queue status"
 *   "queue activity"
 *   "booking queue"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getQueueStats } from '../../services/api/testMonitorApi';

function extractHours(query: string): number | undefined {
  const m = query.match(/(?:last|past)\s+(\d+)\s*(?:hours?|hrs?|h)\b/i);
  return m ? parseInt(m[1], 10) : undefined;
}

function formatMs(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function rateLabel(rate: number): string {
  if (rate >= 0.95) return `**${(rate * 100).toFixed(1)}%**`;
  if (rate >= 0.80) return `**${(rate * 100).toFixed(1)}%**`;
  return `**${(rate * 100).toFixed(1)}%**`;
}

async function execute(query: string): Promise<SkillResult> {
  const hours = extractHours(query);

  try {
    const stats = await getQueueStats(hours);

    const lines: string[] = [];
    const title = hours ? `Booking Queue Stats (last ${hours}h)` : 'Booking Queue Stats';
    lines.push(`## ${title}\n`);

    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total operations | **${stats.totalOperations}** |`);
    lines.push(`| Completed | **${stats.completedOperations}** |`);
    lines.push(`| Failed | **${stats.failedOperations}** |`);
    lines.push(`| Pending | **${stats.pendingOperations}** |`);
    lines.push(`| Expired | **${stats.expiredOperations}** |`);
    lines.push(`| Success rate | ${rateLabel(stats.successRate)} |`);
    lines.push(`| Avg attempts | **${stats.averageAttempts.toFixed(1)}** |`);
    lines.push(`| Avg duration | **${formatMs(stats.averageDurationMs)}** |`);

    return { success: true, markdown: lines.join('\n'), data: stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Queue Stats Failed\n\nCould not fetch queue statistics: ${msg}`,
    };
  }
}

export const queueActivitySkill: SkillEntry = {
  id: 'queue-activity',
  label: 'Queue Activity',
  category: 'nodered',
  sampleQuery: 'Booking queue stats',
  triggers: [
    /(?:booking\s+)?queue\s+(?:stats|statistics|status|activity)/i,
    /(?:show|list|get)\s+(?:the\s+)?(?:booking\s+)?queue/i,
    /booking\s+queue/i,
  ],
  execute,
};
