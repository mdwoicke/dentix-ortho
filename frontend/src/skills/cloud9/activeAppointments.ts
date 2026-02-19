/**
 * Active Appointments Skill
 *
 * Lists active (uncancelled) test appointments from the prod tracker.
 * Handles queries like:
 *   "active test appointments"
 *   "uncancelled appointments"
 *   "active tracker appointments"
 *   "pending test bookings"
 *   "active bookings tracker"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProdTestRecords } from '../../services/api/testMonitorApi';

async function execute(_query: string): Promise<SkillResult> {
  try {
    const { records } = await getProdTestRecords({
      recordType: 'appointment',
      status: 'active',
      sortBy: 'cloud9_created_at',
      sortOrder: 'desc',
      limit: 20,
    });

    if (records.length === 0) {
      return {
        success: true,
        markdown: '## Active Test Appointments\n\nNo active test appointments found.',
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## Active Test Appointments (${records.length})\n`);
    lines.push(`| Name | Date/Time | Type | Location | Provider | Status |`);
    lines.push(`|------|-----------|------|----------|----------|--------|`);

    for (const r of records) {
      const name = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '-';
      const dt = r.appointment_datetime
        ? new Date(r.appointment_datetime).toLocaleString()
        : '-';
      const type = r.appointment_type || '-';
      const location = r.location_name || '-';
      const provider = r.provider_name || '-';

      const nameCell = r.patient_guid ? `[${name}](/patients/${r.patient_guid})` : name;
      lines.push(`| ${nameCell} | ${dt} | ${type} | ${location} | ${provider} | ${r.status} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: records };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Active Appointments Failed\n\nCould not fetch appointments: ${msg}`,
    };
  }
}

export const activeAppointmentsSkill: SkillEntry = {
  id: 'active-appointments',
  label: 'Active Appointments',
  triggers: [
    /active\s+(?:test\s+)?(?:appointments|bookings)/i,
    /uncancelled\s+(?:appointments|bookings)/i,
    /active\s+(?:tracker|bookings?\s+tracker)\s+appointments/i,
    /pending\s+test\s+(?:bookings|appointments)/i,
  ],
  execute,
};
