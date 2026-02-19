/**
 * Cancelled Records Skill
 *
 * Shows cancelled, deleted, or cleanup-failed test records from the prod tracker.
 * Handles queries like:
 *   "show cancelled appointments"
 *   "cancelled records"
 *   "deleted test records"
 *   "cleanup failures"
 *   "failed cleanups"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProdTestRecords } from '../../services/api/testMonitorApi';

function detectStatus(query: string): 'cancelled' | 'deleted' | 'cleanup_failed' {
  if (/deleted/.test(query)) return 'deleted';
  if (/cleanup|failed\s+cleanup/.test(query)) return 'cleanup_failed';
  return 'cancelled';
}

function formatDate(dt: string | null): string {
  if (!dt) return '-';
  return new Date(dt).toLocaleDateString();
}

function formatDateTime(dt: string | null): string {
  if (!dt) return '-';
  const d = new Date(dt);
  return `${d.toLocaleDateString()} @ ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

async function execute(query: string): Promise<SkillResult> {
  const status = detectStatus(query.toLowerCase());
  const statusLabel = status === 'cleanup_failed' ? 'Cleanup Failed' : status.charAt(0).toUpperCase() + status.slice(1);

  try {
    const { records, total } = await getProdTestRecords({
      status,
      sortBy: status === 'cancelled' ? 'cancelled_at' : 'updated_at',
      sortOrder: 'desc',
      limit: 20,
    });

    if (records.length === 0) {
      return {
        success: true,
        markdown: `## ${statusLabel} Records\n\nNo ${status.replace('_', ' ')} records found.`,
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## ${statusLabel} Records (${records.length} of ${total})\n`);
    lines.push(`| # | Patient | Appointment | Location | ${statusLabel} |`);
    lines.push(`|---|---------|-------------|----------|${'-'.repeat(statusLabel.length + 2)}|`);

    records.forEach((r, i) => {
      const name = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '-';
      const nameCell = r.patient_guid ? `[${name}](/patients/${r.patient_guid})` : name;
      const appt = r.appointment_datetime
        ? `${formatDateTime(r.appointment_datetime)} - ${r.appointment_type || 'N/A'}`
        : r.record_type === 'patient' ? '(patient only)' : '-';
      const location = r.location_name || '-';
      const dateCol = status === 'cancelled'
        ? formatDate(r.cancelled_at)
        : formatDate(r.deleted_at || r.updated_at);

      lines.push(`| ${i + 1} | ${nameCell} | ${appt} | ${location} | ${dateCol} |`);
    });

    return { success: true, markdown: lines.join('\n'), data: records };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## ${statusLabel} Records Failed\n\nCould not fetch records: ${msg}`,
    };
  }
}

export const cancelledRecordsSkill: SkillEntry = {
  id: 'cancelled-records',
  label: 'Cancelled Records',
  triggers: [
    /(?:show|list|get)\s+(?:me\s+)?(?:the\s+)?cancelled\s+(?:appointments?|records?|patients?)/i,
    /cancelled\s+(?:appointments?|records?|test\s+records?)/i,
    /deleted\s+(?:records?|test\s+records?|appointments?|patients?)/i,
    /cleanup\s+(?:failures?|failed|errors?)/i,
    /failed\s+cleanups?/i,
  ],
  execute,
};
