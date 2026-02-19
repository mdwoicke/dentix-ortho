/**
 * Call Stats Skill
 *
 * Provides call/session summaries and filtered detail lists.
 * Handles queries like:
 *   "how many calls today"       → count summary
 *   "calls this morning"         → count summary
 *   "show me the bookings"       → filtered session list
 *   "list errors yesterday"      → filtered session list
 *   "show transfers this week"   → filtered session list
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProductionSessions, getProdTestRecords } from '../../services/api/testMonitorApi';
import type { ProdTestRecord } from '../../services/api/testMonitorApi';
import { parseTimeframe } from './timeframeUtils';

type MetricFilter = 'bookings' | 'errors' | 'transfers' | null;

/** Detect if the user is asking for a specific metric's detail list */
function detectMetricFilter(query: string): MetricFilter {
  const q = query.toLowerCase();
  // "show/list/get ... bookings" or "show me the bookings"
  if (/(?:show|list|get|display)\b/.test(q)) {
    if (/\b(?:bookings?|appointments?)\b/.test(q)) return 'bookings';
    if (/\berrors?\b/.test(q)) return 'errors';
    if (/\btransfers?\b/.test(q)) return 'transfers';
  }
  return null;
}

function truncId(id: string): string {
  return id.length > 20 ? id.slice(0, 16) + '...' : id;
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function defaultTimeframe() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { startDate: `${y}-${m}-${d}`, endDate: `${y}-${m}-${d}`, label: 'Today' };
}

async function execute(query: string): Promise<SkillResult> {
  const timeframe = parseTimeframe(query) ?? defaultTimeframe();
  const metricFilter = detectMetricFilter(query);

  try {
    const response = await getProductionSessions({
      fromDate: timeframe.startDate,
      toDate: timeframe.endDate,
      limit: 200,
    });

    const sessions = response.sessions || [];

    // Detail list mode: show filtered sessions
    if (metricFilter) {
      const filtered = metricFilter === 'bookings'
        ? sessions.filter(s => s.hasSuccessfulBooking)
        : metricFilter === 'errors'
          ? sessions.filter(s => s.errorCount > 0)
          : sessions.filter(s => s.hasTransfer);

      const label = metricFilter === 'bookings' ? 'Bookings'
        : metricFilter === 'errors' ? 'Errors'
          : 'Transfers';

      const lines: string[] = [];
      lines.push(`## ${label} (${timeframe.label}) - ${filtered.length} found\n`);

      if (filtered.length === 0) {
        lines.push(`No ${metricFilter} found for this period.`);
        return { success: true, markdown: lines.join('\n'), data: filtered };
      }

      if (metricFilter === 'bookings') {
        // Fetch appointment records to cross-reference with sessions
        const apptBySession = new Map<string, ProdTestRecord[]>();
        try {
          const { records } = await getProdTestRecords({
            recordType: 'appointment',
            status: 'active',
            limit: 200,
          });
          for (const r of records) {
            if (!r.session_id) continue;
            const list = apptBySession.get(r.session_id) || [];
            list.push(r);
            apptBySession.set(r.session_id, list);
          }
        } catch {
          // If tracker fetch fails, we'll still show session-level info
        }

        // Check if any matched records have location/type data
        const allAppts = [...apptBySession.values()].flat();
        const hasLocation = allAppts.some(a => a.location_name);
        const hasType = allAppts.some(a => a.appointment_type);

        // Build header dynamically based on available data
        let header = '| # | Patient | Appointment |';
        let separator = '|---|---------|-------------|';
        if (hasLocation) { header += ' Location |'; separator += '----------|'; }
        if (hasType) { header += ' Type |'; separator += '------|'; }
        header += ' Session |';
        separator += '---------|';
        lines.push(header);
        lines.push(separator);

        for (let i = 0; i < filtered.length; i++) {
          const s = filtered[i];
          const appts = apptBySession.get(s.sessionId);
          const sessionLink = `[View](/test-monitor/call-trace?sessionId=${encodeURIComponent(s.sessionId)})`;

          if (appts && appts.length > 0) {
            for (const a of appts) {
              const name = [a.patient_first_name, a.patient_last_name].filter(Boolean).join(' ') || '-';
              const nameCell = a.patient_guid ? `[${name}](/patients/${a.patient_guid})` : name;
              const dt = a.appointment_datetime ? formatTime(a.appointment_datetime) : '-';
              let row = `| ${i + 1} | ${nameCell} | ${dt} |`;
              if (hasLocation) row += ` ${a.location_name || '-'} |`;
              if (hasType) row += ` ${a.appointment_type || '-'} |`;
              row += ` ${sessionLink} |`;
              lines.push(row);
            }
          } else {
            // Fallback: show patient info from session
            let patient = '-';
            if (s.patientGuids && s.patientGuids.length > 0) {
              patient = s.patientGuids
                .map(p => `[${p.name}](/patients/${p.guid})`)
                .join(', ');
            } else if (s.patientNames) {
              patient = s.patientNames;
            }
            const time = formatTime(s.firstTraceAt);
            let row = `| ${i + 1} | ${patient} | ${time} |`;
            if (hasLocation) row += ' - |';
            if (hasType) row += ' - |';
            row += ` ${sessionLink} |`;
            lines.push(row);
          }
        }
      } else {
        // Errors / Transfers: show session link, time, and outcome flags
        lines.push('| # | Session | Time | Outcome |');
        lines.push('|---|---------|------|---------|');

        for (let i = 0; i < filtered.length; i++) {
          const s = filtered[i];
          const id = `[${truncId(s.sessionId)}](/test-monitor/call-trace?sessionId=${encodeURIComponent(s.sessionId)})`;
          const time = formatTime(s.firstTraceAt);
          const flags: string[] = [];
          if (s.hasSuccessfulBooking) flags.push('booked');
          if (s.hasTransfer) flags.push('transfer');
          if (s.errorCount > 0) flags.push(`${s.errorCount} err`);
          if (s.hasOrder) flags.push('order');
          lines.push(`| ${i + 1} | ${id} | ${time} | ${flags.join(', ') || '-'} |`);
        }
      }

      return { success: true, markdown: lines.join('\n'), data: filtered };
    }

    // Count summary mode
    const total = sessions.length;
    const bookings = sessions.filter(s => s.hasSuccessfulBooking).length;
    const errors = sessions.filter(s => s.errorCount > 0).length;
    const transfers = sessions.filter(s => s.hasTransfer).length;

    const lines: string[] = [];
    lines.push(`## Call Summary (${timeframe.label})\n`);
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| **Total Calls** | ${total}${response.total > total ? ` (of ${response.total})` : ''} |`);
    lines.push(`| **Bookings** | ${bookings} |`);
    lines.push(`| **Errors** | ${errors} |`);
    lines.push(`| **Transfers** | ${transfers} |`);

    return { success: true, markdown: lines.join('\n'), data: { total, bookings, errors, transfers } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Call Stats Failed\n\nCould not fetch call stats: ${msg}`,
    };
  }
}

export const callStatsSkill: SkillEntry = {
  id: 'call-stats',
  label: 'Call Stats',
  triggers: [
    /how\s+many\s+(?:calls?|sessions?|conversations?|bookings?|appointments?|errors?|transfers?)/i,
    /(?:calls?|sessions?|bookings?|appointments?|errors?|transfers?)\s+(?:from\s+)?(?:today|yesterday|this\s+\w+|last\s+\w+|past\s+\w+)/i,
    /(?:today'?s?|yesterday'?s?)\s+(?:calls?|sessions?|bookings?|appointments?|errors?|transfers?)/i,
    /(?:show|list|get)\s+(?:me\s+)?(?:the\s+)?(?:calls?|sessions?|bookings?|appointments?|errors?|transfers?)/i,
    /call\s+(?:count|stats?|summary|volume)/i,
    /session\s+(?:count|stats?|summary|volume)/i,
  ],
  execute,
};
