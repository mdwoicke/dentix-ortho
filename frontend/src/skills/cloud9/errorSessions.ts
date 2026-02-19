/**
 * Error Sessions Skill
 *
 * Lists recent sessions that have errors.
 * Handles queries like:
 *   "error sessions"
 *   "failed sessions"
 *   "sessions with errors"
 *   "problem calls"
 *   "show errors"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProductionSessions } from '../../services/api/testMonitorApi';

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

function extractLimit(query: string): number {
  const m = query.match(/(?:last|top|limit)\s+(\d+)/i);
  return m ? Math.min(parseInt(m[1], 10), 50) : 25;
}

async function execute(query: string): Promise<SkillResult> {
  const limit = extractLimit(query);

  try {
    const response = await getProductionSessions({ limit });
    const errorSessions = (response.sessions || []).filter(s => s.errorCount > 0);

    if (errorSessions.length === 0) {
      return {
        success: true,
        markdown: `## Error Sessions\n\nNo sessions with errors found in the last ${limit} sessions.`,
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## Error Sessions (${errorSessions.length} found)\n`);

    for (const s of errorSessions) {
      const flags: string[] = [];
      if (s.hasSuccessfulBooking) flags.push('booked');
      if (s.hasTransfer) flags.push('transfer');
      if (s.hasOrder) flags.push('order');
      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';

      const preview = s.inputPreview ? truncText(s.inputPreview, 60) : '';
      const time = s.firstTraceAt ? new Date(s.firstTraceAt).toLocaleString() : '-';

      lines.push(`[**${truncId(s.sessionId)}**](/test-monitor/call-trace?sessionId=${s.sessionId}) — ${s.errorCount} error${s.errorCount > 1 ? 's' : ''}${flagStr}`);
      lines.push(`- Time: ${time} | Traces: ${s.traceCount} | Latency: ${formatMs(s.totalLatencyMs)}`);
      if (preview) lines.push(`- Input: _${preview}_`);
      lines.push('');
    }

    return { success: true, markdown: lines.join('\n'), data: errorSessions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Error Sessions Failed\n\nCould not fetch sessions: ${msg}`,
    };
  }
}

export const errorSessionsSkill: SkillEntry = {
  id: 'error-sessions',
  label: 'Error Sessions',
  triggers: [
    /error\s+sessions/i,
    /failed\s+(?:sessions|calls)/i,
    /sessions?\s+with\s+errors/i,
    /problem\s+(?:calls|sessions)/i,
    /(?:show|find|list)\s+(?:error|failed)\s+(?:sessions|calls)/i,
    /find\s+sessions?\s+with\s+errors/i,
  ],
  execute,
};
