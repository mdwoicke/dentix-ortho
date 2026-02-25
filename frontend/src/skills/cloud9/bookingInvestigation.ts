/**
 * Booking Investigation Skill
 *
 * Investigates a session for false positive booking detection caused by
 * LLM hallucination of appointment IDs in PAYLOAD outputs.
 *
 * Handles queries like:
 *   "investigate session conv_9_+19546824812_1771965271483"
 *   "investigate booking conv_9_+19546824812_1771965271483"
 *   "check false positive conv_9_..."
 *   "booking investigation abc123"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { investigateSessionBooking } from '../../services/api/testMonitorApi';
import type { InvestigationResult, InvestigationToolCall, PayloadFinding } from '../../services/api/testMonitorApi';

const CLASSIFICATION_EMOJI: Record<string, string> = {
  CLEAN: '\u2705',
  LEGITIMATE: '\u2705',
  FALSE_POSITIVE: '\uD83D\uDEA8',
  FALSE_POSITIVE_WITH_TOOL: '\u26A0\uFE0F',
  INCONCLUSIVE: '\u2753',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  CLEAN: 'Clean (No PAYLOAD IDs)',
  LEGITIMATE: 'Legitimate Booking',
  FALSE_POSITIVE: 'FALSE POSITIVE - Hallucinated Booking',
  FALSE_POSITIVE_WITH_TOOL: 'Suspicious - Placeholder IDs with Tool Call',
  INCONCLUSIVE: 'Inconclusive - Manual Review Needed',
};

function extractSessionId(query: string): string | null {
  const patterns = [
    /(?:investigate|check|inspect|analyze)\s+(?:session|booking|false\s+positive)\s+(conv_\S+)/i,
    /(?:investigate|check|inspect|analyze)\s+(?:session|booking|false\s+positive)\s+([a-f0-9-]{8,})/i,
    /(?:booking\s+investigation|false\s+positive)\s+(conv_\S+)/i,
    /(?:booking\s+investigation|false\s+positive)\s+([a-f0-9-]{8,})/i,
    /(conv_\d+_[+\d]+_\d+)/i,
  ];

  for (const pat of patterns) {
    const m = query.match(pat);
    if (m) return m[1];
  }
  return null;
}

/** Get a concise detail string for a tool call table cell */
function getToolCallDetail(tc: InvestigationToolCall): string {
  if (tc.isError) {
    let detail = tc.statusMessage || 'ERROR';
    // Try to extract clean message from JSON error
    if (detail.startsWith('{') || detail.startsWith('Error:')) {
      try {
        const parsed = JSON.parse(detail.replace(/^Error:\s*/, ''));
        detail = parsed.message || parsed.error || detail;
      } catch { /* keep original */ }
    }
    if (detail.length > 50) detail = detail.substring(0, 47) + '...';
    return detail;
  }

  if (tc.name === 'CurrentDateTime') {
    return tc.output?.iso8601 || tc.output?.currentDateTime || `${tc.output?.date || ''}T${tc.output?.time || ''}Z` || 'time returned';
  }

  if (tc.action === 'lookup') {
    const names: string[] = [];
    if (Array.isArray(tc.output)) {
      tc.output.slice(0, 3).forEach((p: any) => { if (p.first_name) names.push(p.first_name); });
    } else if (tc.output?.patients) {
      tc.output.patients.slice(0, 3).forEach((p: any) => { if (p.firstName) names.push(p.firstName); });
    }
    return names.length > 0 ? `Found: ${names.join(', ')}` : 'lookup returned';
  }

  if (tc.action === 'clinic_info') {
    return tc.output?.locationBehaviors?.office_name || tc.output?.locationInfo?.name || tc.output?.locationName || tc.output?.name || 'location info';
  }

  if (tc.action === 'slots' || tc.action === 'grouped_slots') {
    const count = tc.output?.totalSlotsFound || tc.output?.slots?.length || (Array.isArray(tc.output) ? tc.output.length : '?');
    return `${count} slots returned`;
  }

  if (tc.action === 'book_child' || tc.action === 'book') {
    const id = tc.output?.appointmentId || tc.output?.appointmentGUID || tc.output?.id;
    return `success=${tc.output?.success}, id=${id || 'none'}`;
  }

  return JSON.stringify(tc.output).substring(0, 60);
}

function formatToolCallTable(toolCalls: InvestigationToolCall[]): string {
  const lines: string[] = [];
  lines.push('| # | Tool | Action | Level | Key Output |');
  lines.push('|---|------|--------|-------|------------|');

  for (const tc of toolCalls) {
    const actionDisplay = (tc.action === tc.name || tc.name === 'CurrentDateTime') ? '\u2014' : `\`${tc.action}\``;
    const levelStr = tc.isError ? '**ERROR**' : tc.level;
    const detail = getToolCallDetail(tc);
    lines.push(`| ${tc.index} | \`${tc.name}\` | ${actionDisplay} | ${levelStr} | ${detail} |`);
  }

  return lines.join('\n');
}

function formatPayloadFindings(findings: PayloadFinding[]): string {
  const lines: string[] = [];

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    lines.push(`**Finding #${i + 1}** (trace \`${f.traceId.substring(0, 8)}\`, ${f.timestamp || 'unknown'})`);
    lines.push('');

    if (f.payloadJson && typeof f.payloadJson === 'object') {
      lines.push('```json');
      lines.push(JSON.stringify(f.payloadJson, null, 2));
      lines.push('```');
    }

    const ids = [...f.apptIds, ...f.apptGuids];
    if (ids.length > 0) {
      lines.push('');
      lines.push('| Type | Value | Assessment |');
      lines.push('|------|-------|------------|');
      for (const id of f.apptIds) {
        const isFake = /^(APPT|TEST|FAKE|DEMO)\d+$/i.test(id) || ['123456789', '987654321', '1234567890', 'null'].includes(id);
        lines.push(`| Appt ID | \`${id}\` | ${isFake ? '**PLACEHOLDER** - system prompt example' : 'Verify against NexHealth'} |`);
      }
      for (const guid of f.apptGuids) {
        lines.push(`| Appt GUID | \`${guid}\` | Verify against Cloud9 |`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function execute(query: string): Promise<SkillResult> {
  const sessionId = extractSessionId(query);
  if (!sessionId) {
    return {
      success: false,
      markdown: '## Booking Investigation\n\nCould not extract a session ID. Try:\n- "investigate session conv_9_+19546824812_1771965271483"\n- "check false positive conv_9_..."',
    };
  }

  try {
    const result: InvestigationResult = await investigateSessionBooking(sessionId);
    const emoji = CLASSIFICATION_EMOJI[result.classification] || '?';
    const label = CLASSIFICATION_LABEL[result.classification] || result.classification;
    const reportUrl = `/test-monitor/detailed-report?sessionId=${encodeURIComponent(result.sessionId)}`;

    const lines: string[] = [];
    lines.push(`## ${emoji} Booking Investigation: ${label}\n`);

    // Link to full report
    lines.push(`> [View Full Detailed Report](${reportUrl}) \u2014 includes Mermaid diagrams, collapsible tool call details, and PDF export\n`);

    // Session overview
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push(`| **Session** | [\`${result.sessionId}\`](/test-monitor/call-trace?sessionId=${result.sessionId}) |`);
    lines.push(`| **Config** | ${result.session.configId} |`);
    lines.push(`| **Caller** | ${result.callerName || 'Unknown'} (${result.phone || 'N/A'}) |`);
    lines.push(`| **Children** | ${result.childNames.join(', ') || 'N/A'} |`);
    lines.push(`| **Time** | ${result.session.firstTraceAt ? new Date(result.session.firstTraceAt).toLocaleString() : '-'} |`);
    lines.push(`| **Traces** | ${result.session.traceCount} (${result.session.errorCount} errors) |`);
    lines.push(`| **DB Booking Flag** | ${result.session.hasSuccessfulBooking ? 'Yes' : 'No'} |`);
    lines.push(`| **DB Transfer** | ${result.session.hasTransfer ? 'Yes' : 'No'} |`);
    lines.push(`| **DB Order** | ${result.session.hasOrder ? 'Yes' : 'No'} |`);
    lines.push('');

    // Summary
    if (result.classification === 'FALSE_POSITIVE') {
      const ids = [...new Set(result.allExtractedIds)].map(id => `\`${id}\``).join(', ');
      lines.push(`> **This booking never happened.** The LLM skipped the booking tool and fabricated appointment ID(s) ${ids}. The PAYLOAD extraction fallback trusted the hallucinated output.\n`);
    } else if (result.classification === 'LEGITIMATE') {
      lines.push(`> This session has legitimate booking tool calls AND PAYLOAD appointment IDs. The booking appears genuine.\n`);
    } else if (result.classification === 'CLEAN') {
      lines.push(`> No PAYLOAD appointment IDs found. No false positive risk.\n`);
    }

    // Tool calls
    lines.push(`### Tool Calls (${result.toolCalls.length} total, ${result.bookingToolCallCount} booking)\n`);
    lines.push(formatToolCallTable(result.toolCalls));
    lines.push('');

    if (result.bookingToolCallCount === 0 && result.classification === 'FALSE_POSITIVE') {
      lines.push(`**No booking tool call exists.** The LLM never called \`book_child\` or \`book\`.\n`);
    }

    // PAYLOAD findings
    if (result.payloadFindings.length > 0) {
      lines.push(`### PAYLOAD Findings (${result.payloadFindings.length})\n`);
      lines.push(formatPayloadFindings(result.payloadFindings));
    }

    // Extracted IDs (deduplicated)
    const uniqueIds = [...new Set(result.allExtractedIds)];
    if (uniqueIds.length > 0) {
      lines.push('### Extracted Appointment IDs\n');
      lines.push('| ID | Format | Placeholder? |');
      lines.push('|----|--------|-------------|');
      for (const id of uniqueIds) {
        const isFake = result.placeholderIds.includes(id);
        const isUUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(id);
        const isInt = /^\d+$/.test(id);
        const format = isUUID ? 'Cloud9 UUID' : isInt ? 'NexHealth integer' : 'Placeholder pattern';
        lines.push(`| \`${id}\` | ${format} | ${isFake ? '**Yes** \u2014 classic hallucination' : 'No \u2014 verify against API'} |`);
      }
      lines.push('');
    }

    // Fix recommendation for false positives
    if (result.classification === 'FALSE_POSITIVE') {
      lines.push('### Recommended Fix\n');
      lines.push('Add `hasBookingToolCall` guard before PAYLOAD extraction in `buildCallReport()`:');
      lines.push('');
      lines.push('```typescript');
      lines.push('const hasBookingToolCall = filtered.some(o => {');
      lines.push('  const inp = /* parse input */;');
      lines.push("  return inp.action === 'book_child' || inp.action === 'book';");
      lines.push('});');
      lines.push('if (!report.bookingResults.some(br => br.booked) && hasBookingToolCall) {');
      lines.push('  // ... PAYLOAD extraction (now gated)');
      lines.push('}');
      lines.push('```');
    }

    return { success: true, markdown: lines.join('\n'), data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Booking Investigation Failed\n\nCould not investigate session \`${sessionId}\`: ${msg}`,
    };
  }
}

export const bookingInvestigationSkill: SkillEntry = {
  id: 'booking-investigation',
  label: 'Booking Investigation',
  category: 'call',
  sampleQuery: 'Investigate session conv_9_+19546824812_1771965271483',
  triggers: [
    /(?:investigate|inspect)\s+(?:session|booking)/i,
    /(?:check|detect)\s+false\s+positive/i,
    /booking\s+investigation/i,
    /false\s+positive\s+(?:check|scan|detect)/i,
    /investigate\s+conv_/i,
  ],
  execute,
};
