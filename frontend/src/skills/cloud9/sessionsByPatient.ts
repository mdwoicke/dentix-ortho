/**
 * Sessions By Patient Skill
 *
 * Searches sessions by patient name (from the patientNames field).
 * Handles queries like:
 *   "calls for Smith"
 *   "sessions for patient John"
 *   "conversations with Canales"
 *   "find calls about Brown"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProductionSessions } from '../../services/api/testMonitorApi';
import { parseTimeframe } from './timeframeUtils';

function extractPatientName(query: string): string | null {
  // "calls for Smith" / "sessions for patient John" / "find calls about Brown"
  const patterns = [
    /(?:calls?|sessions?|conversations?)\s+(?:for|with|about|involving)\s+(?:patient\s+)?(\w+)/i,
    /find\s+(?:calls?|sessions?)\s+(?:for|about|with)\s+(\w+)/i,
    /(?:patient|caller)\s+(\w+)\s+(?:calls?|sessions?|conversations?)/i,
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m) return m[1];
  }
  return null;
}

function truncId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) + '...' : id;
}

async function execute(query: string): Promise<SkillResult> {
  const patientName = extractPatientName(query);
  if (!patientName) {
    return {
      success: false,
      markdown: '## Sessions by Patient\n\nCould not extract a patient name. Try: "calls for Smith"',
    };
  }

  const timeframe = parseTimeframe(query);

  try {
    const response = await getProductionSessions({
      limit: 100,
      ...(timeframe && { fromDate: timeframe.startDate, toDate: timeframe.endDate }),
    });

    const needle = patientName.toLowerCase();
    const matching = (response.sessions || []).filter(s =>
      s.patientNames && s.patientNames.toLowerCase().includes(needle)
    );

    if (matching.length === 0) {
      return {
        success: true,
        markdown: `## Sessions for "${patientName}"\n\nNo sessions found with that patient name.`,
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## Sessions for "${patientName}" (${matching.length} found)\n`);
    lines.push(`| # | Patient | Date | Outcome | Session |`);
    lines.push(`|---|---------|------|---------|---------|`);

    matching.forEach((s, i) => {
      // Build patient display from patientGuids or patientNames
      let patientDisplay = s.patientNames || '-';
      if (s.patientGuids && s.patientGuids.length > 0) {
        patientDisplay = s.patientGuids
          .map(pg => pg.guid ? `[${pg.name}](/patients/${pg.guid})` : pg.name)
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

      lines.push(`| ${i + 1} | ${patientDisplay} | ${date} | ${outcomeStr} | ${sessionLink} |`);
    });

    return { success: true, markdown: lines.join('\n'), data: matching };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Sessions by Patient Failed\n\nCould not fetch sessions: ${msg}`,
    };
  }
}

export const sessionsByPatientSkill: SkillEntry = {
  id: 'sessions-by-patient',
  label: 'Sessions by Patient',
  triggers: [
    /(?:calls?|sessions?|conversations?)\s+(?:for|with|about|involving)\s+(?:patient\s+)?\w+/i,
    /find\s+(?:calls?|sessions?)\s+(?:for|about|with)\s+\w+/i,
    /(?:patient|caller)\s+\w+\s+(?:calls?|sessions?|conversations?)/i,
  ],
  execute,
};
