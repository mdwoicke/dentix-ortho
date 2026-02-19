/**
 * Order Logs Skill
 *
 * Fetches and formats recent Dominos order log entries.
 * Handles queries like:
 *   "list recent orders"
 *   "show order logs"
 *   "recent failures"
 *   "failed orders"
 *   "last 5 orders"
 *   "failed orders for store 4332"
 */

import type { SkillEntry, SkillResult } from './types';
import { getDashboardLogs } from '../../services/api/dominosApi';
import type { DominosOrderLog } from '../../types/dominos.types';

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function extractStatus(query: string): string | undefined {
  if (/\bfail(?:ed|ure|ing|s)?\b/i.test(query)) return 'failure';
  if (/\bsuccess(?:ful)?\b/i.test(query)) return 'success';
  return undefined;
}

function extractStoreId(query: string): string | undefined {
  const m = query.match(/store\s*(?:id\s*)?#?\s*(\d{3,5})/i);
  return m ? m[1] : undefined;
}

function extractLimit(query: string): number {
  const m = query.match(/(?:last|recent|top|show)\s+(\d{1,3})\b/i);
  if (m) return Math.min(parseInt(m[1], 10), 50);
  return 10;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
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

function statusIcon(log: DominosOrderLog): string {
  return log.success ? '✅' : '❌';
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function formatLogEntry(log: DominosOrderLog, index: number): string {
  const lines: string[] = [];
  lines.push(`**${index}.** ${statusIcon(log)} \`${log.endpoint || log.method}\` — ${formatTimestamp(log.timestamp)}`);

  const details: string[] = [];
  details.push(`HTTP ${log.status_code}`);
  details.push(`${log.response_time_ms}ms`);
  if (log.store_id) details.push(`Store ${log.store_id}`);
  if (log.session_id) details.push(`Session [\`${truncate(log.session_id, 8)}\`](/dominos/call-tracing?sessionId=${log.session_id})`);
  lines.push(details.join(' | '));

  if (log.error_message) {
    lines.push(`> ${truncate(log.error_message, 120)}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skill entry
// ---------------------------------------------------------------------------

async function execute(query: string): Promise<SkillResult> {
  const status = extractStatus(query);
  const storeId = extractStoreId(query);
  const limit = extractLimit(query);

  try {
    const { logs } = await getDashboardLogs({ limit, status, storeId });

    const lines: string[] = [];
    const filterParts: string[] = [];
    if (status) filterParts.push(status === 'failure' ? 'failed' : 'successful');
    if (storeId) filterParts.push(`store ${storeId}`);
    const filterLabel = filterParts.length > 0 ? ` (${filterParts.join(', ')})` : '';

    lines.push(`## Recent Order Logs${filterLabel}`);
    lines.push('');

    if (logs.length === 0) {
      lines.push(`No order logs found${filterLabel}.`);
      return { success: true, markdown: lines.join('\n'), data: { logs } };
    }

    for (let i = 0; i < logs.length; i++) {
      lines.push(formatLogEntry(logs[i], i + 1));
      if (i < logs.length - 1) lines.push('');
    }

    // Summary
    const successCount = logs.filter(l => l.success).length;
    const failCount = logs.length - successCount;
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`**Showing ${logs.length} logs** | ${successCount} successful, ${failCount} failed`);

    return { success: true, markdown: lines.join('\n'), data: { logs, status, storeId, limit } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Order Logs Failed\n\nCould not fetch order logs: ${msg}`,
    };
  }
}

export const orderLogsSkill: SkillEntry = {
  id: 'order-logs',
  label: 'Order Logs',
  triggers: [
    /(?:list|show|get|display)\s+(?:the\s+)?(?:recent\s+)?(?:order\s+)?logs/i,
    /(?:list|show|get)\s+(?:the\s+)?recent\s+(?:\w+\s+)?orders/i,
    /recent\s+(?:order\s+)?(?:failures|errors)/i,
    /(?:failed|successful)\s+orders/i,
    /last\s+\d+\s+(?:order|log)/i,
  ],
  execute,
};
