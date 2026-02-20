/**
 * Service Health Skill
 *
 * Fetches Dominos service health status with component details.
 * Handles queries like:
 *   "is the service up"
 *   "health status"
 *   "service health"
 *   "system status"
 *   "diagnostics"
 *   "is dominos up"
 */

import type { SkillEntry, SkillResult } from './types';
import { getHealthDetailed } from '../../services/api/dominosApi';

function statusIcon(status: string): string {
  const s = status.toLowerCase();
  if (s === 'healthy' || s === 'ok' || s === 'up') return '🟢';
  if (s === 'degraded' || s === 'warning') return '🟡';
  return '🔴';
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

async function execute(_query: string): Promise<SkillResult> {
  try {
    const health = await getHealthDetailed();

    const lines: string[] = [];
    lines.push(`## Service Health`);
    lines.push('');
    lines.push(`${statusIcon(health.status)} **Overall: ${health.status.charAt(0).toUpperCase() + health.status.slice(1)}**`);
    lines.push('');

    const details: string[] = [];
    if (health.uptime > 0) details.push(`**Uptime:** ${formatUptime(health.uptime)}`);
    if (health.version) details.push(`**Version:** ${health.version}`);
    if (details.length > 0) lines.push(details.join(' | '));

    // Component list
    if (health.components.length > 0) {
      lines.push('');
      lines.push('### Components');
      lines.push('');
      lines.push('| Component | Status | Response Time |');
      lines.push('|-----------|--------|---------------|');
      for (const c of health.components) {
        const rt = c.responseTime != null ? `${Math.round(c.responseTime)}ms` : '—';
        lines.push(`| ${c.name} | ${statusIcon(c.status)} ${c.status} | ${rt} |`);
        if (c.details) {
          lines.push(`| | *${c.details}* | |`);
        }
      }
    }

    return { success: true, markdown: lines.join('\n'), data: health };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Service Health Check Failed\n\nCould not reach the Dominos service: ${msg}\n\nThe service may be down or unreachable.`,
    };
  }
}

export const serviceHealthSkill: SkillEntry = {
  id: 'service-health',
  label: 'Service Health',
  category: 'dominos-traces',
  sampleQuery: 'Service health status',
  triggers: [
    /(?:is\s+(?:the\s+)?(?:service|dominos?)\s+(?:up|running|alive|healthy|online))/i,
    /\b(?:health|service)\s+(?:status|check)\b/i,
    /\bservice\s+health\b/i,
    /\bsystem\s+status\b/i,
    /\bhealth\s+status\b/i,
    /\bdiagnostics?\b/i,
  ],
  execute,
};
