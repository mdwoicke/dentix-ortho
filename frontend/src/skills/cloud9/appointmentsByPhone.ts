/**
 * Appointments by Phone Skill
 *
 * Finds all appointments tied to a phone number by searching patients first,
 * then fetching appointments for each matching patient.
 * Handles queries like:
 *   "appointments for 555-123-4567"
 *   "find appointments by phone 5551234567"
 *   "appts for phone (555) 123-4567"
 *   "look up appointments for phone 555.123.4567"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { searchPatients } from '../../services/api/patientApi';
import { getPatientAppointments } from '../../services/api/appointmentApi';
import type { Appointment } from '../../types';

/** Extract a phone number (7-15 digits after stripping formatting) from the query. */
function extractPhone(query: string): string | null {
  // Remove trigger phrases to isolate the phone portion
  const stripped = query
    .replace(
      /^(?:find|search|look\s*up|show|get|list)\s+(?:for\s+)?/i,
      '',
    )
    .replace(/^(?:all\s+)?(?:appointments?|appts?)\s+/i, '')
    .replace(/(?:for|by|with|from)\s+(?:phone(?:\s+(?:number|#|no\.?))?\s*)/i, '')
    .replace(/(?:phone(?:\s+(?:number|#|no\.?))?\s*)/i, '')
    .trim();

  // Pull out digits
  const digits = stripped.replace(/\D/g, '');

  // Accept 7-15 digit phone numbers (US local or with country code)
  if (digits.length >= 7 && digits.length <= 15) {
    return digits;
  }

  return null;
}

/** Format a phone string for display. */
function formatPhone(digits: string): string {
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return digits;
}

/** Format appointment date/time for display. */
function formatDateTime(appt: Appointment): string {
  const raw = appt.appointment_date_time || appt.dateTime || appt.start_time;
  if (!raw) return '-';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return raw;
  }
}

async function execute(query: string): Promise<SkillResult> {
  const phone = extractPhone(query);

  if (!phone) {
    return {
      success: false,
      markdown:
        '## Appointments by Phone\n\nPlease provide a phone number to search. Example: `appointments for 555-123-4567`',
    };
  }

  const display = formatPhone(phone);

  try {
    // Step 1: Find patients matching this phone number
    const response = await searchPatients({ query: phone });
    const patients = response.data || [];

    if (patients.length === 0) {
      return {
        success: true,
        markdown: `## Appointments by Phone: ${display}\n\nNo patients found with phone number **${display}**.`,
        data: [],
      };
    }

    // Step 2: Fetch appointments for each patient in parallel
    const apptResults = await Promise.all(
      patients
        .filter((p) => p.patient_guid)
        .map(async (p) => {
          try {
            const appts = await getPatientAppointments(p.patient_guid!);
            return { patient: p, appointments: appts };
          } catch {
            return { patient: p, appointments: [] as Appointment[] };
          }
        }),
    );

    // Flatten and count
    const totalAppts = apptResults.reduce((sum, r) => sum + r.appointments.length, 0);

    if (totalAppts === 0) {
      const names = patients.map((p) => `${p.first_name} ${p.last_name}`).join(', ');
      return {
        success: true,
        markdown:
          `## Appointments by Phone: ${display}\n\n` +
          `Found **${patients.length}** patient${patients.length !== 1 ? 's' : ''} (${names}) ` +
          `but no appointments on file.`,
        data: { patients, appointments: [] },
      };
    }

    // Step 3: Build output
    const lines: string[] = [];
    lines.push(`## Appointments by Phone: ${display}`);
    lines.push(
      `**${totalAppts} appointment${totalAppts !== 1 ? 's' : ''}** across **${patients.length} patient${patients.length !== 1 ? 's' : ''}**\n`,
    );

    for (const { patient, appointments } of apptResults) {
      if (appointments.length === 0) continue;

      const pName = `${patient.first_name} ${patient.last_name}`;
      const nameLink = patient.patient_guid
        ? `[${pName}](/patients/${patient.patient_guid})`
        : pName;
      lines.push(`### ${nameLink} (ID: ${patient.patient_id || '-'})\n`);

      lines.push('| Date/Time | Type | Location | Provider | Status |');
      lines.push('|-----------|------|----------|----------|--------|');

      for (const a of appointments) {
        const dt = formatDateTime(a);
        const type = a.appointment_type_description || a.appointment_type_name || '-';
        const loc = a.location_name || a.locationName || '-';
        const prov = a.orthodontist_name || a.provider_name || a.providerName || '-';
        const status = a.status_description || a.status || '-';
        lines.push(`| ${dt} | ${type} | ${loc} | ${prov} | ${status} |`);
      }

      lines.push('');
    }

    return {
      success: true,
      markdown: lines.join('\n'),
      data: { patients, appointments: apptResults },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Appointments by Phone Failed\n\nCould not search for **${display}**: ${msg}`,
    };
  }
}

export const appointmentsByPhoneSkill: SkillEntry = {
  id: 'appointments-by-phone',
  label: 'Appointments by Phone',
  category: 'cloud9',
  sampleQuery: 'Appointments for 555-123-4567',
  triggers: [
    // "appointments for 555-123-4567" / "appts with (555) 123-4567"
    // Note: "from" is handled by sessionsByCallerIdSkill (caller ID lookup)
    /(?:appointments?|appts?)\s+(?:for|with)\s+(?:phone\s+)?[\d(]/i,
    // "find appointments by phone 5551234567"
    /(?:find|search|look\s*up|get|show)\s+(?:all\s+)?(?:appointments?|appts?)\s+(?:for|by|with)\s+(?:phone\s+)?[\d(]/i,
    // "appointments by phone number 555..."
    /(?:appointments?|appts?)\s+by\s+phone/i,
    // "phone 555-123-4567 appointments"
    /phone\s+[\d(][\d\s().\-]+\s*(?:appointments?|appts?)/i,
  ],
  execute,
};
