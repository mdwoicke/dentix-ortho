/**
 * Appointments By Provider Skill
 *
 * Shows test appointment distribution by provider, or filters by a specific provider.
 * Handles queries like:
 *   "appointments by provider"
 *   "appointments with Dr. Smith"
 *   "provider breakdown"
 *   "which providers have appointments"
 *   "who has the most bookings"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getProdTestRecords } from '../../services/api/testMonitorApi';

function extractProviderName(query: string): string | null {
  // "appointments with Dr. Smith" / "bookings for Dr Johnson"
  const m = query.match(/(?:bookings?|appointments?)\s+(?:with|for)\s+(?:Dr\.?\s+)?(\w+)/i);
  if (!m) return null;
  const candidate = m[1].trim();
  // Filter out generic words
  if (/^(?:provider|doctor|each|every|all)s?$/i.test(candidate)) return null;
  return candidate;
}

function formatDateTime(dt: string | null): string {
  if (!dt) return '-';
  const d = new Date(dt);
  return `${d.toLocaleDateString()} @ ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

async function execute(query: string): Promise<SkillResult> {
  const providerFilter = extractProviderName(query);

  try {
    const [activeRes, cancelledRes] = await Promise.all([
      getProdTestRecords({ recordType: 'appointment', status: 'active', limit: 100 }),
      getProdTestRecords({ recordType: 'appointment', status: 'cancelled', limit: 100 }),
    ]);

    const allRecords = [...activeRes.records, ...cancelledRes.records];

    if (providerFilter) {
      // --- Filtered mode: show appointments for a specific provider ---
      const needle = providerFilter.toLowerCase();
      const filtered = allRecords.filter(r =>
        r.provider_name && r.provider_name.toLowerCase().includes(needle)
      );

      const active = filtered.filter(r => r.status === 'active');

      if (filtered.length === 0) {
        return {
          success: true,
          markdown: `## Appointments with "${providerFilter}"\n\nNo appointments found for that provider.`,
          data: [],
        };
      }

      const lines: string[] = [];
      lines.push(`## Appointments with "${providerFilter}" (${active.length} active)\n`);
      lines.push(`| # | Patient | Date/Time | Type | Location | Status |`);
      lines.push(`|---|---------|-----------|------|----------|--------|`);

      filtered.forEach((r, i) => {
        const name = [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || '-';
        const nameCell = r.patient_guid ? `[${name}](/patients/${r.patient_guid})` : name;
        const dt = formatDateTime(r.appointment_datetime);
        const type = r.appointment_type || '-';
        const location = r.location_name || '-';

        lines.push(`| ${i + 1} | ${nameCell} | ${dt} | ${type} | ${location} | ${r.status} |`);
      });

      return { success: true, markdown: lines.join('\n'), data: filtered };
    }

    // --- Overview mode: group by provider ---
    const byProvider = new Map<string, { active: number; cancelled: number; total: number }>();
    for (const r of allRecords) {
      const prov = r.provider_name || 'Unknown';
      const entry = byProvider.get(prov) || { active: 0, cancelled: 0, total: 0 };
      entry.total++;
      if (r.status === 'active') entry.active++;
      else entry.cancelled++;
      byProvider.set(prov, entry);
    }

    if (byProvider.size === 0) {
      return {
        success: true,
        markdown: '## Appointments by Provider\n\nNo appointment records found.',
        data: [],
      };
    }

    const sorted = [...byProvider.entries()].sort((a, b) => b[1].total - a[1].total);

    const lines: string[] = [];
    lines.push(`## Appointments by Provider\n`);
    lines.push(`| Provider | Active | Cancelled | Total |`);
    lines.push(`|----------|--------|-----------|-------|`);

    for (const [prov, counts] of sorted) {
      lines.push(`| ${prov} | ${counts.active} | ${counts.cancelled} | ${counts.total} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: Object.fromEntries(byProvider) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Appointments by Provider Failed\n\nCould not fetch records: ${msg}`,
    };
  }
}

export const appointmentsByProviderSkill: SkillEntry = {
  id: 'appointments-by-provider',
  label: 'Appointments by Provider',
  category: 'cloud9',
  sampleQuery: 'Appointments with Dr. Lee',
  triggers: [
    /appointments?\s+(?:by|per|with|for)\s+(?:provider|doctor|dr\.?)/i,
    /(?:bookings?|appointments?)\s+(?:with|for)\s+(?:Dr\.?\s+)?\w+/i,
    /provider\s+(?:breakdown|distribution|summary|stats)/i,
    /which\s+(?:providers?|doctors?)\s+have/i,
    /who\s+has\s+(?:the\s+)?most\s+(?:bookings?|appointments?)/i,
  ],
  execute,
};
