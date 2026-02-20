/**
 * Patient Search Skill
 *
 * Searches Cloud9 patients by name or ID.
 * Handles queries like:
 *   "find patient Smith"
 *   "search for Canales"
 *   "look up patient 12345"
 *   "patient lookup Rodriguez"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { searchPatients } from '../../services/api/patientApi';

/** Strip noise words to extract the actual search term. */
function extractSearchTerm(query: string): string {
  return query
    .replace(/^(find|search|look\s*up|show|get|list)\s+(for\s+)?/i, '')
    .replace(/^(patient|patients)\s*/i, '')
    .replace(/\b(named|with\s+last\s+name|called|by\s+name)\b/gi, '')
    .trim();
}

async function execute(query: string): Promise<SkillResult> {
  const term = extractSearchTerm(query);

  if (!term) {
    return {
      success: false,
      markdown: '## Patient Search\n\nPlease provide a patient name or ID to search for.',
    };
  }

  try {
    const response = await searchPatients({ query: term });
    const patients = response.data || [];

    if (patients.length === 0) {
      return {
        success: true,
        markdown: `## Patient Search: "${term}"\n\nNo patients found matching **${term}**.`,
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push(`## Patient Search: "${term}"`);
    lines.push(`**${patients.length} patient${patients.length !== 1 ? 's' : ''} found**\n`);
    lines.push('| Name | Patient ID | DOB | Phone | Email |');
    lines.push('|------|-----------|-----|-------|-------|');

    for (const p of patients) {
      const name = `${p.last_name}, ${p.first_name}`;
      const id = p.patient_id || '-';
      const dob = p.birthdate || '-';
      const phone = p.phone || '-';
      const email = p.email || '-';
      const nameCell = p.patient_guid ? `[${name}](/patients/${p.patient_guid})` : name;
      lines.push(`| ${nameCell} | ${id} | ${dob} | ${phone} | ${email} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: patients };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Patient Search Failed\n\nCould not search for **${term}**: ${msg}`,
    };
  }
}

export const patientSearchSkill: SkillEntry = {
  id: 'patient-search',
  label: 'Patient Search',
  category: 'cloud9',
  sampleQuery: 'Find patient Canales',
  triggers: [
    /(?:find|search|look\s*up)\s+(?:for\s+)?patient/i,
    /patient\s+(?:search|lookup|look\s*up)/i,
    /(?:find|search|look\s*up)\s+(?:for\s+)?(?!(?:session|call|error|failed|test|record|location|appointment|provider|tracker|cache|queue|prompt|insight|family|recent|active|cancelled)\w*\b)\w+/i,
    /(?:search|find)\s+(?:for\s+)?(?:patients?\s+)?(?:named|called|with\s+last\s+name)/i,
  ],
  execute,
};
