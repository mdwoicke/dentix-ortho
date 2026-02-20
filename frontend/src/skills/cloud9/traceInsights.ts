/**
 * Trace Insights Skill
 *
 * Shows call analytics / trace insights summary.
 * Handles queries like:
 *   "show insights"
 *   "call analytics"
 *   "booking success rate"
 *   "error rate"
 *   "trace insights"
 *   "insights last 7 days"
 *   "insights config 2"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getTraceInsights } from '../../services/api/testMonitorApi';
import { getActiveLangfuseConfig } from '../../services/api/appSettingsApi';
import { parseTimeframe } from './timeframeUtils';

function extractDays(query: string): number {
  const m = query.match(/last\s+(\d+)\s*days?/i);
  return m ? parseInt(m[1], 10) : 7;
}

function extractConfigId(query: string): number | null {
  const m = query.match(/config\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

async function execute(query: string): Promise<SkillResult> {
  // Use explicit config if specified, otherwise fetch the active default
  let configId = extractConfigId(query);
  if (configId == null) {
    try {
      const active = await getActiveLangfuseConfig();
      configId = active?.id ?? 1;
    } catch {
      configId = 1;
    }
  }
  const timeframe = parseTimeframe(query);

  // Use explicit date range if timeframe detected, otherwise fall back to lastDays
  const opts = timeframe
    ? { configId, fromDate: timeframe.startDate, toDate: timeframe.endDate }
    : { configId, lastDays: extractDays(query) };

  try {
    const data = await getTraceInsights(opts);
    const o = data.overview;
    const d = data.sessionLengthDistribution;

    const convRate = o.patientToBookingConversion != null
      ? `${(o.patientToBookingConversion * 100).toFixed(1)}%`
      : '-';

    // Compute link dates for clickable counts
    let linkFrom: string, linkTo: string;
    if (timeframe) {
      linkFrom = timeframe.startDate;
      linkTo = timeframe.endDate;
    } else {
      const days = extractDays(query);
      const now = new Date();
      const start = new Date(now); start.setDate(start.getDate() - days);
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      linkFrom = fmt(start); linkTo = fmt(now);
    }
    const base = `/test-monitor/call-trace?fromDate=${linkFrom}&toDate=${linkTo}`;

    const lines: string[] = [];
    const headerLabel = timeframe ? timeframe.label : `Last ${data.timeframe.daysCount} days`;
    lines.push(`## Trace Insights (${headerLabel})\n`);

    // Overview table
    lines.push(`### Overview\n`);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| **Total Sessions** | [${o.totalSessions}](${base}) |`);
    lines.push(`| **Successful Bookings** | ${o.successfulBookings > 0 ? `[${o.successfulBookings}](${base}&disposition=bookings)` : '0'} |`);
    lines.push(`| **Patients Created** | ${o.patientsCreated} |`);
    lines.push(`| **Conversion Rate** | ${convRate} |`);
    lines.push('');

    // Issues summary
    const issues = data.issues;
    const issueItems: [string, number][] = [
      ['Empty Patient GUID', issues.emptyPatientGuid.count],
      ['API Errors', issues.apiErrors.count],
      ['Slot Fetch Failures', issues.slotFetchFailures.count],
      ['Missing Slot Data', issues.missingSlotData.count],
      ['Session Abandonment', issues.sessionAbandonment.count],
      ['Excessive Confirmations', issues.excessiveConfirmations.count],
      ['Long Sessions', issues.longSessions.count],
    ];
    const hasIssues = issueItems.some(([, c]) => c > 0);

    if (hasIssues) {
      lines.push(`### Issues\n`);
      lines.push(`| Issue | Count |`);
      lines.push(`|-------|-------|`);
      for (const [label, count] of issueItems) {
        if (count > 0) {
          lines.push(`| ${label} | ${count} |`);
        }
      }
      lines.push('');
    }

    // Session distribution
    lines.push(`### Session Distribution\n`);
    lines.push(`| Category | Count | Range |`);
    lines.push(`|----------|-------|-------|`);
    lines.push(`| Abandoned | ${d.abandoned.count} | ${d.abandoned.range} |`);
    lines.push(`| Partial | ${d.partial.count} | ${d.partial.range} |`);
    lines.push(`| Complete | ${d.complete.count} | ${d.complete.range} |`);
    lines.push(`| Long | ${d.long.count} | ${d.long.range} |`);

    return { success: true, markdown: lines.join('\n'), data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Trace Insights Failed\n\nCould not fetch insights: ${msg}`,
    };
  }
}

export const traceInsightsSkill: SkillEntry = {
  id: 'trace-insights',
  label: 'Trace Insights',
  category: 'call',
  sampleQuery: 'Show trace insights',
  triggers: [
    /(?:show|get)\s+(?:trace\s+)?insights/i,
    /trace\s+insights/i,
    /call\s+analytics/i,
    /booking\s+success\s+rate/i,
    /(?:error|failure)\s+rate/i,
    /insights\s+(?:last|config)/i,
    /insights?\s+(?:today|yesterday|this\s+\w+|last\s+\w+)/i,
  ],
  execute,
};
