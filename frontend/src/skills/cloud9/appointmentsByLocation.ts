/**
 * Appointments By Location Skill
 *
 * Shows test appointment distribution by location, or filters by a specific location.
 * Handles queries like:
 *   "appointments by location"
 *   "bookings at Philadelphia"
 *   "which locations have appointments"
 *   "appointment breakdown by office"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProdTestRecords } from '../../services/api/testMonitorApi';

function extractLocationName(query: string): string | null {
  // "appointments at Philadelphia" / "bookings in West Chester" / "appointments for Main"
  const m = query.match(/(?:bookings?|appointments?)\s+(?:at|for|in)\s+(.+)/i);
  if (!m) return null;
  const candidate = m[1].trim();
  // Filter out generic words that indicate overview mode
  if (/^(?:location|office|each|every|all)s?$/i.test(candidate)) return null;
  return candidate;
}

function formatDateTime(dt: string | null): string {
  if (!dt) return '-';
  const d = new Date(dt);
  return `${d.toLocaleDateString()} @ ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

async function execute(query: string): Promise<SkillResult> {
  const locationFilter = extractLocationName(query);

  try {
    // Fetch all appointment records (active + cancelled) to show full picture
    const [activeRes, cancelledRes] = await Promise.all([
      getProdTestRecords({ recordType: 'appointment', status: 'active', limit: 100 }),
      getProdTestRecords({ recordType: 'appointment', status: 'cancelled', limit: 100 }),
    ]);

    const allRecords = [...activeRes.records, ...cancelledRes.records];

    if (locationFilter) {
      // --- Filtered mode: show appointments at a specific location ---
      const needle = locationFilter.toLowerCase();
      const filtered = allRecords.filter(r =>
        r.location_name && r.location_name.toLowerCase().includes(needle)
      );

      const active = filtered.filter(r => r.status === 'active');

      if (filtered.length === 0) {
        return {
          success: true,
          markdown: `## Appointments at "${locationFilter}"\n\nNo appointments found matching that location.`,
          data: [],
        };
      }

      const lines: string[] = [];
      lines.push(`## Appointments at "${locationFilter}" (${active.length} active, ${filtered.length - active.length} cancelled)\n`);
      lines.push(`| # | Patient | Date/Time | Type | Provider | Status |`);
      lines.push(`|---|---------|-----------|------|----------|--------|`);

      filtered.forEach((r, i) => {
        const name = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '-';
        const nameCell = r.patient_guid ? `[${name}](/patients/${r.patient_guid})` : name;
        const dt = formatDateTime(r.appointment_datetime);
        const type = r.appointment_type || '-';
        const provider = r.provider_name || '-';

        lines.push(`| ${i + 1} | ${nameCell} | ${dt} | ${type} | ${provider} | ${r.status} |`);
      });

      return { success: true, markdown: lines.join('\n'), data: filtered };
    }

    // --- Overview mode: group by location ---
    const byLocation = new Map<string, { active: number; cancelled: number; total: number }>();
    for (const r of allRecords) {
      const loc = r.location_name || 'Unknown';
      const entry = byLocation.get(loc) || { active: 0, cancelled: 0, total: 0 };
      entry.total++;
      if (r.status === 'active') entry.active++;
      else entry.cancelled++;
      byLocation.set(loc, entry);
    }

    if (byLocation.size === 0) {
      return {
        success: true,
        markdown: '## Appointments by Location\n\nNo appointment records found.',
        data: [],
      };
    }

    const sorted = [...byLocation.entries()].sort((a, b) => b[1].total - a[1].total);

    const lines: string[] = [];
    lines.push(`## Appointments by Location\n`);
    lines.push(`| Location | Active | Cancelled | Total |`);
    lines.push(`|----------|--------|-----------|-------|`);

    for (const [loc, counts] of sorted) {
      lines.push(`| ${loc} | ${counts.active} | ${counts.cancelled} | ${counts.total} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: Object.fromEntries(byLocation) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Appointments by Location Failed\n\nCould not fetch records: ${msg}`,
    };
  }
}

export const appointmentsByLocationSkill: SkillEntry = {
  id: 'appointments-by-location',
  label: 'Appointments by Location',
  category: 'cloud9',
  sampleQuery: 'Appointments at Philly',
  triggers: [
    /appointments?\s+(?:by|per|at|for|in)\s+(?:location|office)/i,
    /(?:bookings?|appointments?)\s+(?:at|for|in)\s+\w+/i,
    /(?:location|office)\s+(?:breakdown|distribution|summary)/i,
    /which\s+(?:locations?|offices?)\s+have\s+(?:appointments?|bookings?)/i,
  ],
  execute,
};
