/**
 * Recent Sessions Skill
 *
 * Shows recent production sessions (grouped conversations).
 * Handles queries like:
 *   "show recent sessions"
 *   "recent calls"
 *   "last 10 sessions"
 *   "recent conversations"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProductionSessions } from '../../services/api/testMonitorApi';

function extractLimit(query: string): number {
  const m = query.match(/(?:last|recent|top)\s+(\d+)/i);
  return m ? Math.min(parseInt(m[1], 10), 50) : 10;
}

function truncId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) + '...' : id;
}

function truncText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function formatMs(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function execute(query: string): Promise<SkillResult> {
  const limit = extractLimit(query);

  try {
    const response = await getProductionSessions({ limit });
    const sessions = response.sessions || [];

    if (sessions.length === 0) {
      return {
        success: true,
        markdown: '## Recent Sessions\n\nNo sessions found.',
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## Recent Sessions (${sessions.length} of ${response.total})\n`);

    for (const s of sessions) {
      const flags: string[] = [];
      if (s.hasSuccessfulBooking) flags.push('booked');
      if (s.hasTransfer) flags.push('transfer');
      if (s.errorCount > 0) flags.push(`${s.errorCount} err`);
      if (s.hasOrder) flags.push('order');

      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
      const preview = s.inputPreview ? truncText(s.inputPreview, 60) : '';
      const latency = formatMs(s.totalLatencyMs);
      const time = s.firstTraceAt ? new Date(s.firstTraceAt).toLocaleString() : '-';

      lines.push(`**${truncId(s.sessionId)}**${flagStr}`);
      lines.push(`- Time: ${time} | Traces: ${s.traceCount} | Latency: ${latency}`);
      if (preview) lines.push(`- Input: _${preview}_`);
      lines.push('');
    }

    return { success: true, markdown: lines.join('\n'), data: sessions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Recent Sessions Failed\n\nCould not fetch sessions: ${msg}`,
    };
  }
}

export const recentSessionsSkill: SkillEntry = {
  id: 'recent-sessions',
  label: 'Recent Sessions',
  triggers: [
    /(?:show|list|get)\s+(?:the\s+)?recent\s+(?:sessions|calls|conversations)/i,
    /recent\s+(?:sessions|calls|conversations)/i,
    /last\s+\d+\s+(?:sessions|calls|conversations)/i,
  ],
  execute,
};
