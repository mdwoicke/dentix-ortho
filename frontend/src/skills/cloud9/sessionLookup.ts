/**
 * Session Lookup Skill
 *
 * Looks up a single production session by ID and displays
 * session overview + transcript preview.
 * Handles queries like:
 *   "show session abc12345"
 *   "look up session xyz"
 *   "session detail abc12345"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProductionSession } from '../../services/api/testMonitorApi';

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

function extractSessionId(query: string): string | null {
  const m = query.match(/session\s+(?:detail\s+)?([a-f0-9-]{6,})/i);
  return m ? m[1] : null;
}

async function execute(query: string): Promise<SkillResult> {
  const sessionId = extractSessionId(query);
  if (!sessionId) {
    return {
      success: false,
      markdown: '## Session Lookup\n\nCould not extract a session ID from your query. Try: "show session abc12345"',
    };
  }

  try {
    const detail = await getProductionSession(sessionId);
    const s = detail.session;

    const flags: string[] = [];
    if (s.hasSuccessfulBooking) flags.push('Booked');
    if (s.hasTransfer) flags.push('Transfer');
    if (s.errorCount > 0) flags.push(`${s.errorCount} errors`);
    if (s.hasOrder) flags.push('Order');

    const lines: string[] = [];
    lines.push(`## Session: ${truncId(s.sessionId)}\n`);
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| **ID** | [\`${s.sessionId}\`](/test-monitor/call-trace?sessionId=${s.sessionId}) |`);
    lines.push(`| **Config** | ${s.configName} |`);
    lines.push(`| **First Trace** | ${s.firstTraceAt ? new Date(s.firstTraceAt).toLocaleString() : '-'} |`);
    lines.push(`| **Last Trace** | ${s.lastTraceAt ? new Date(s.lastTraceAt).toLocaleString() : '-'} |`);
    lines.push(`| **Traces** | ${s.traceCount} |`);
    lines.push(`| **Cost** | ${s.totalCost != null ? `$${s.totalCost.toFixed(4)}` : '-'} |`);
    lines.push(`| **Latency** | ${formatMs(s.totalLatencyMs)} |`);
    lines.push(`| **Flags** | ${flags.length > 0 ? flags.join(', ') : 'None'} |`);
    lines.push('');

    // Transcript preview (first 4 turns)
    if (detail.transcript && detail.transcript.length > 0) {
      const previewTurns = detail.transcript.slice(0, 4);
      lines.push(`### Transcript Preview (${previewTurns.length} of ${detail.transcript.length} turns)\n`);
      for (const turn of previewTurns) {
        const role = turn.role === 'user' ? 'User' : 'Assistant';
        const text = truncText(turn.content, 120);
        lines.push(`**${role}:** ${text}\n`);
      }
      if (detail.transcript.length > 4) {
        lines.push(`_...${detail.transcript.length - 4} more turns_`);
      }
    }

    return { success: true, markdown: lines.join('\n'), data: detail };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Session Lookup Failed\n\nCould not fetch session \`${sessionId}\`: ${msg}`,
    };
  }
}

export const sessionLookupSkill: SkillEntry = {
  id: 'session-lookup',
  label: 'Session Lookup',
  triggers: [
    /(?:show|look\s+up|get|find)\s+session\s+(?:detail\s+)?[a-f0-9-]{6,}/i,
    /session\s+detail\s+[a-f0-9-]{6,}/i,
  ],
  execute,
};
