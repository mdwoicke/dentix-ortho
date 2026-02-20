/**
 * Cache Health Skill
 *
 * Shows Redis slot cache health status from Node-RED.
 * Handles queries like:
 *   "cache health"
 *   "slot cache status"
 *   "cache status"
 *   "is cache healthy"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getCacheHealth } from '../../services/api/testMonitorApi';

function statusIcon(status: string): string {
  switch (status) {
    case 'healthy':
    case 'fresh':
      return '**healthy**';
    case 'degraded':
    case 'stale':
      return '**degraded**';
    case 'unhealthy':
    case 'critical_stale':
    case 'error':
    case 'empty':
      return '**unhealthy**';
    default:
      return `**${status}**`;
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

async function execute(_query: string): Promise<SkillResult> {
  try {
    const health = await getCacheHealth();

    const lines: string[] = [];
    lines.push('## Slot Cache Health');
    lines.push(`**Overall:** ${statusIcon(health.status)}\n`);

    // Summary
    const s = health.summary;
    lines.push('### Summary');
    lines.push(`- Total slots: **${s.totalSlots}**`);
    lines.push(`- Stale tiers: **${s.staleTiers}**`);
    lines.push(`- Failed tiers: **${s.failedTiers}**`);
    if (s.maxConsecutiveFailures > 0) {
      lines.push(`- Max consecutive failures: **${s.maxConsecutiveFailures}**`);
    }
    lines.push('');

    // Tier table
    lines.push('### Tiers');
    lines.push('| Tier | Days | Status | Slots | Age | Date Range |');
    lines.push('|------|------|--------|-------|-----|------------|');

    for (const t of health.tiers) {
      const age = formatAge(t.ageSeconds);
      const range = t.dateRange ? `${t.dateRange.start} - ${t.dateRange.end}` : '-';
      lines.push(`| ${t.tier} | ${t.tierDays} | ${statusIcon(t.status)} | ${t.slotCount} | ${age} | ${range} |`);
    }
    lines.push('');

    // Refresh stats
    const r = health.refreshStats.last20Refreshes;
    lines.push('### Refresh Stats (last 20)');
    lines.push(`- Success: **${r.success}** / Failure: **${r.failure}** / Rate: **${r.successRate}**`);

    // Scheduler status
    if (health.backendScheduler) {
      const sched = health.backendScheduler;
      lines.push('');
      lines.push('### Scheduler');
      lines.push(`- Running: **${sched.running ? 'Yes' : 'No'}**`);
      lines.push(`- Business hours: **${sched.isBusinessHours ? 'Yes' : 'No'}**`);
      if (sched.lastRefreshTime) {
        lines.push(`- Last refresh: ${sched.lastRefreshTime}`);
      }
      if (sched.nextRefreshIn > 0) {
        lines.push(`- Next refresh in: **${formatAge(Math.round(sched.nextRefreshIn / 1000))}**`);
      }
    }

    return { success: true, markdown: lines.join('\n'), data: health };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Cache Health Failed\n\nCould not fetch cache health: ${msg}`,
    };
  }
}

export const cacheHealthSkill: SkillEntry = {
  id: 'cache-health',
  label: 'Cache Health',
  category: 'nodered',
  sampleQuery: 'Cache health status',
  triggers: [
    /cache\s+health/i,
    /(?:slot\s+)?cache\s+status/i,
    /is\s+(?:the\s+)?cache\s+healthy/i,
    /cache\s+(?:health|status)\s+(?:check|status)/i,
  ],
  execute,
};
