/**
 * Chord UUI Lookup Skill
 *
 * Extracts the UUI (User-to-User Information) pipe-delimited string from a
 * Chord session's system prompt available_variables block. Shows parsed
 * segments, caller ID, conversation ID, and call summary.
 *
 * Accepts either format — auto-detects:
 *   Session ID: "conv_9_+12132791621_1772224829364"
 *   Search ID:  "12574d4f-5d82-483f-bd09-208fcb414ee0" (UUID/trace ID)
 *
 * Handles queries like:
 *   "uui lookup conv_9_+12132791621_1772224829364"
 *   "uui lookup 12574d4f-5d82-483f-bd09-208fcb414ee0"
 *   "extract uui conv_9_+12132791621_1772224829364"
 *   "show uui for conv_9_..."
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { uuiLookup } from '../../services/api/testMonitorApi';
import type { UuiLookupResult } from '../../services/api/testMonitorApi';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractId(query: string): string | null {
  // Match conv_ session ID pattern
  const convMatch = query.match(/(conv_\d+_[+\d]+_\d+)/);
  if (convMatch) return convMatch[1];

  // Match UUID / GUID pattern (search ID / trace ID)
  const uuidMatch = query.match(UUID_RE);
  if (uuidMatch) return uuidMatch[0];

  // Fallback: last whitespace-delimited token that starts with conv_
  const tokens = query.trim().split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].startsWith('conv_')) return tokens[i];
  }
  return null;
}

function formatResult(result: UuiLookupResult): string {
  const lines: string[] = [];

  lines.push(`## UUI Lookup\n`);

  const reportLink = `[\`${result.sessionId}\`](/test-monitor/detailed-report?sessionId=${encodeURIComponent(result.sessionId)})`;
  lines.push(`**Session:** ${reportLink}`);
  if (result.inputId && result.inputId !== result.sessionId) {
    lines.push(`**Resolved from:** \`${result.inputId}\` (${result.resolvedFrom || 'auto'})`);
  }
  lines.push('');

  if (!result.found) {
    lines.push('No `<available_variables>` block found in this session\'s system prompt.');
    return lines.join('\n');
  }

  // UUI segments table
  if (result.uuiRaw) {
    lines.push('### UUI String\n');
    lines.push('```');
    lines.push(result.uuiRaw);
    lines.push('```\n');

    lines.push('### Parsed Segments\n');
    lines.push('| # | Segment |');
    lines.push('|---|---------|');
    result.uuiSegments.forEach((seg, i) => {
      lines.push(`| ${i + 1} | \`${seg}\` |`);
    });
    lines.push('');
  } else {
    lines.push('*No pipe-delimited UUI string found in available_variables.*\n');
  }

  // Variables table
  lines.push('### Session Variables\n');
  lines.push('| Variable | Value |');
  lines.push('|----------|-------|');
  if (result.callerIdNumber) {
    lines.push(`| **Caller ID** | \`${result.callerIdNumber}\` |`);
  }
  if (result.conversationId) {
    lines.push(`| **Conversation ID** | \`${result.conversationId}\` |`);
  }
  if (result.locationConfigJson) {
    // Try to extract location name from JSON
    try {
      const lc = JSON.parse(result.locationConfigJson);
      if (lc.location_name) lines.push(`| **Location** | ${lc.location_name} |`);
      if (lc.location_id) lines.push(`| **Location ID** | \`${lc.location_id}\` |`);
      if (lc.specialty) lines.push(`| **Specialty** | ${lc.specialty} |`);
    } catch {
      lines.push(`| **Location Config** | *(JSON present, ${result.locationConfigJson.length} chars)* |`);
    }
  }
  lines.push('');

  // Call summary
  if (result.callSummary) {
    lines.push('### Call Summary\n');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    const cs = result.callSummary;
    if (cs.Caller_Name) lines.push(`| **Caller** | ${cs.Caller_Name} |`);
    if (cs.Caller_Intent) lines.push(`| **Intent** | ${cs.Caller_Intent} |`);
    if (cs.Call_Final_Disposition) lines.push(`| **Disposition** | ${cs.Call_Final_Disposition} |`);
    if (cs.Interaction_Summary) lines.push(`| **Summary** | ${cs.Interaction_Summary} |`);
    if (cs.location_name) lines.push(`| **Location** | ${cs.location_name} |`);
    lines.push('');
  }

  return lines.join('\n');
}

async function execute(query: string): Promise<SkillResult> {
  const id = extractId(query);
  if (!id) {
    return {
      success: false,
      markdown: '## UUI Lookup\n\nCould not extract an ID from your query. Try:\n- "uui lookup conv_9_+12132791621_1772224829364"\n- "uui lookup 12574d4f-5d82-483f-bd09-208fcb414ee0"\n- "extract uui conv_9_..."',
    };
  }

  try {
    const result = await uuiLookup(id);

    return { success: true, markdown: formatResult(result), data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error
      ? err.message
      : (err && typeof err === 'object' && 'message' in err)
        ? String((err as { message: unknown }).message)
        : String(err);
    return {
      success: false,
      markdown: `## UUI Lookup Failed\n\nCould not look up UUI for \`${id}\`: ${msg}`,
    };
  }
}

export const uuiLookupSkill: SkillEntry = {
  id: 'uui-lookup',
  label: 'UUI Lookup',
  category: 'call',
  sampleQuery: 'uui lookup conv_9_+12132791621_1772224829364',
  triggers: [
    /uui\s+(?:lookup|extract|show)/i,
    /(?:lookup|extract|show)\s+uui/i,
    /uui\s+conv_/i,
    /uui\s+[0-9a-f]{8}-/i,
  ],
  inputConfig: {
    paramName: 'sessionId',
    paramLabel: 'Session ID or Search ID (UUID)',
    placeholder: 'conv_9_+12132791621_1772224829364 or UUID',
    validation: /^(?:conv_\d|[0-9a-f]{8}-)/i,
  },
  execute,
};
