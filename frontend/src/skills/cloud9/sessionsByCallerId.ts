/**
 * Sessions By Caller ID Skill
 *
 * Searches call sessions by caller phone number (stored in user_id).
 * Handles queries like:
 *   "show me appointments from 2677383941"
 *   "calls from 2677383941"
 *   "sessions from 555-123-4567"
 *   "caller 2677383941"
 *   "callerid 2677383941"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProductionSessions } from '../../services/api/testMonitorApi';

/** Extract a phone number (7-15 digits after stripping formatting) from the query. */
function extractPhone(query: string): string | null {
  // Remove trigger phrases to isolate the phone portion
  const stripped = query
    .replace(
      /^(?:find|search|look\s*up|show(?:\s+me)?|get|list)\s+(?:for\s+)?/i,
      '',
    )
    .replace(/^(?:all\s+)?(?:appointments?|appts?|calls?|sessions?|conversations?)\s+/i, '')
    .replace(/(?:from|for|by|with)\s+(?:caller(?:\s*id)?\s*)?/i, '')
    .replace(/^caller(?:\s*id)?\s*/i, '')
    .trim();

  const digits = stripped.replace(/\D/g, '');

  if (digits.length >= 7 && digits.length <= 15) {
    return digits;
  }

  return null;
}

/** Format a phone string for display. */
function formatPhone(digits: string): string {
  // Normalize to last 10 digits
  const d = digits.length > 10 ? digits.slice(-10) : digits;
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return digits;
}

async function execute(query: string): Promise<SkillResult> {
  const phone = extractPhone(query);

  if (!phone) {
    return {
      success: false,
      markdown:
        '## Sessions by Caller ID\n\nPlease provide a phone number. Example: `calls from 555-123-4567`',
    };
  }

  const display = formatPhone(phone);

  try {
    const response = await getProductionSessions({
      callerPhone: phone,
      limit: 20,
    });

    const sessions = response.sessions || [];

    if (sessions.length === 0) {
      return {
        success: true,
        markdown: `## Sessions from ${display}\n\nNo call sessions found for caller **${display}**.`,
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## Sessions from ${display} (${response.total} found)\n`);
    lines.push('| # | Date | Patient | Outcome | Session |');
    lines.push('|---|------|---------|---------|---------|');

    sessions.forEach((s, i) => {
      // Build patient display from patientGuids or patientNames
      let patientDisplay = s.patientNames || '-';
      if (s.patientGuids && s.patientGuids.length > 0) {
        patientDisplay = s.patientGuids
          .map((pg) => (pg.guid ? `[${pg.name}](/patients/${pg.guid})` : pg.name))
          .join(', ');
      }

      const date = s.firstTraceAt ? new Date(s.firstTraceAt).toLocaleString() : '-';

      const outcomes: string[] = [];
      if (s.hasSuccessfulBooking) outcomes.push('Booked');
      if (s.hasTransfer) outcomes.push('Transfer');
      if (s.errorCount > 0) outcomes.push(`${s.errorCount} err`);
      if (s.hasOrder) outcomes.push('Order');
      const outcomeStr = outcomes.length > 0 ? outcomes.join(', ') : '-';

      const sessionLink = `[View](/test-monitor/call-trace?sessionId=${s.sessionId})`;

      lines.push(`| ${i + 1} | ${date} | ${patientDisplay} | ${outcomeStr} | ${sessionLink} |`);
    });

    if (response.total > sessions.length) {
      lines.push(`\n*Showing ${sessions.length} of ${response.total} sessions.*`);
    }

    return { success: true, markdown: lines.join('\n'), data: sessions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Sessions by Caller ID Failed\n\nCould not fetch sessions for **${display}**: ${msg}`,
    };
  }
}

export const sessionsByCallerIdSkill: SkillEntry = {
  id: 'sessions-by-caller-id',
  label: 'Sessions by Caller ID',
  category: 'call',
  sampleQuery: 'Calls from 2675551234',
  triggers: [
    // "appointments from 2677383941" / "show me appointments from 555-123-4567"
    /(?:appointments?|appts?)\s+from\s+[\d(]/i,
    // "calls from 2677383941" / "sessions from 555..."
    /(?:calls?|sessions?|conversations?)\s+from\s+[\d(]/i,
    // "caller 2677383941" / "callerid 2677383941"
    /caller(?:\s*id)?\s+[\d(]/i,
    // "show me calls from 555..." / "find sessions from 555..."
    /(?:find|search|show(?:\s+me)?|get|list)\s+(?:all\s+)?(?:calls?|sessions?|appointments?|appts?)\s+from\s+[\d(]/i,
  ],
  execute,
};
