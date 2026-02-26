/**
 * Chord Call Lookup Skill
 *
 * Searches Langfuse for a Chord call by any ID (location_config_id, trace ID,
 * session ID, phone number, appointment ID, etc.) and returns the formatted
 * session ID, booking details, and related trace info.
 *
 * Handles queries like:
 *   "lookup 478fd856-56a0-459f-b208-cb8212842e59"
 *   "find call 478fd856-56a0-459f-b208-cb8212842e59"
 *   "call lookup +16095162240"
 *   "search langfuse 47b5ce2d-..."
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { callLookup } from '../../services/api/testMonitorApi';
import type { CallLookupResult } from '../../services/api/testMonitorApi';

function extractId(query: string): string | null {
  const patterns = [
    // "lookup <id>", "find call <id>", "call lookup <id>", "search langfuse <id>"
    /(?:look\s*up|find\s+call|call\s+look\s*up|search\s+langfuse|search\s+for|look\s*up\s+call)\s+(\S+)/i,
    // UUID pattern
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    // Phone number pattern
    /(\+1\d{10})/,
    // conv_ session ID
    /(conv_\d+_[+\d]+_\d+)/,
    // Numeric appointment ID (at least 8 digits)
    /(?:appointment|appt)\s+(?:id\s+)?(\d{8,})/i,
  ];

  for (const pat of patterns) {
    const m = query.match(pat);
    if (m) return m[1];
  }
  return null;
}

function formatCallSummary(cs: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');

  if (cs.Caller_Name) lines.push(`| **Caller** | ${cs.Caller_Name} |`);
  if (cs.Caller_Intent) lines.push(`| **Intent** | ${cs.Caller_Intent} |`);
  if (cs.Call_Final_Disposition) lines.push(`| **Disposition** | ${cs.Call_Final_Disposition} |`);
  if (cs.Interaction_Summary) lines.push(`| **Summary** | ${cs.Interaction_Summary} |`);
  if (cs.location_name) lines.push(`| **Location** | ${cs.location_name} (ID: ${cs.locationId || 'N/A'}) |`);
  if (cs.Call_Location) lines.push(`| **Address** | ${cs.Call_Location} |`);
  if (cs.locationSpecialty) lines.push(`| **Specialty** | ${cs.locationSpecialty} |`);
  if (cs.location_config_id) lines.push(`| **Location Config ID** | \`${cs.location_config_id}\` |`);
  if (cs.business_hours) lines.push(`| **Business Hours** | ${cs.business_hours} |`);
  if (cs.Patient_Count) lines.push(`| **Patient Count** | ${cs.Patient_Count} |`);

  // Child/patient details
  if (cs.Child1_FirstName) {
    lines.push(`| **Patient** | ${cs.Child1_FirstName} ${cs.Child1_LastName || ''} |`);
    if (cs.Child1_DOB) lines.push(`| **DOB / Age** | ${cs.Child1_DOB} (age ${cs.Child1_Age || '?'}) |`);
    if (cs.Child1_patientId) lines.push(`| **Patient ID** | ${cs.Child1_patientId} |`);
    const apptDetails = cs.Child1_Appointment_Details as Record<string, string> | undefined;
    if (apptDetails) {
      lines.push(`| **Appointment** | ${apptDetails.day_of_week}, ${apptDetails.date} at ${apptDetails.time} |`);
    }
    if (cs.Child1_appointmentId) lines.push(`| **Appointment ID** | ${cs.Child1_appointmentId} |`);
    if (cs.Child1_operatory_id) lines.push(`| **Operatory ID** | ${cs.Child1_operatory_id} |`);
  }
  if (cs.Parent_patientId) lines.push(`| **Parent Patient ID** | ${cs.Parent_patientId} |`);
  if (cs.guarantor_firstName) lines.push(`| **Guarantor** | ${cs.guarantor_firstName} ${cs.guarantor_lastName || ''} |`);

  return lines.join('\n');
}

function formatBooking(booking: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| **Appointment ID** | ${booking.appointmentId} |`);
  lines.push(`| **Patient ID** | ${booking.patientId} |`);
  lines.push(`| **Provider ID** | ${booking.providerId} |`);
  lines.push(`| **Provider Name** | ${booking.providerName} |`);
  lines.push(`| **Start Time** | ${booking.startTime} |`);
  lines.push(`| **End Time** | ${booking.endTime} |`);
  if (booking.dayOfWeek) lines.push(`| **Day of Week** | ${booking.dayOfWeek} |`);
  lines.push(`| **Operatory ID** | ${booking.operatoryId} |`);
  lines.push(`| **Location ID** | ${booking.locationId} |`);
  lines.push(`| **Timezone** | ${booking.timezone} |`);
  lines.push(`| **Confirmed** | ${booking.confirmed} |`);
  if (booking.note) lines.push(`| **Note** | ${booking.note} |`);
  if (booking.createdAt) lines.push(`| **Created At** | ${booking.createdAt} |`);
  return lines.join('\n');
}

function formatToolCalls(toolCalls: Array<Record<string, unknown>>): string {
  const lines: string[] = [];
  lines.push('| # | Tool | Input | Latency |');
  lines.push('|---|------|-------|---------|');

  toolCalls.forEach((tc, i) => {
    const input = tc.input ? JSON.stringify(tc.input) : '';
    const inputDisplay = input.length > 80 ? input.substring(0, 77) + '...' : input;
    lines.push(`| ${i + 1} | \`${tc.tool}\` | ${inputDisplay} | ${tc.latencyMs || '?'}ms |`);
  });

  return lines.join('\n');
}

function formatResult(result: CallLookupResult): string {
  const lines: string[] = [];

  lines.push(`## Call Lookup: ${result.idType || 'Found'}\n`);

  // Session IDs section
  lines.push('### Identifiers\n');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| **Search ID** | \`${result.searchId}\` |`);
  lines.push(`| **ID Type** | ${result.idType} |`);
  lines.push(`| **Langfuse Config** | ${result.configId} (${result.configName}) |`);

  const reportLink = result.formattedSessionId
    ? `[\`${result.formattedSessionId}\`](/test-monitor/detailed-report?sessionId=${encodeURIComponent(result.formattedSessionId)})`
    : 'NOT IMPORTED';
  lines.push(`| **Session ID** | ${reportLink} |`);
  lines.push(`| **Langfuse Session** | \`${result.langfuseSessionId}\` |`);
  lines.push(`| **Trace ID** | \`${result.traceId}\` |`);
  lines.push(`| **Timestamp** | ${result.timestamp ? new Date(result.timestamp).toLocaleString() : 'N/A'} |`);
  lines.push(`| **Phone** | ${result.phone} |`);
  lines.push('');

  // Call Summary
  if (result.callSummary) {
    lines.push('### Call Summary\n');
    lines.push(formatCallSummary(result.callSummary));
    lines.push('');
  }

  // Booking
  if (result.booking) {
    lines.push('### Booking Confirmation\n');
    lines.push(formatBooking(result.booking));
    lines.push('');
  }

  // Tool Calls
  if (result.toolCalls.length > 0) {
    lines.push(`### Tool Calls (${result.toolCalls.length})\n`);
    lines.push(formatToolCalls(result.toolCalls));
    lines.push('');
  }

  // Session Stats
  if (result.sessionStats) {
    const ss = result.sessionStats;
    lines.push('### Session Stats\n');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| **Traces** | ${ss.traceCount} |`);
    lines.push(`| **Total Cost** | $${typeof ss.totalCost === 'number' ? ss.totalCost.toFixed(4) : '0'} |`);
    lines.push(`| **Total Latency** | ${ss.totalLatencyMs}ms |`);
    lines.push(`| **Has Booking** | ${ss.hasBooking ? 'Yes' : 'No'} |`);
    lines.push(`| **Has Transfer** | ${ss.hasTransfer ? 'Yes' : 'No'} |`);
    lines.push(`| **Errors** | ${ss.errorCount} |`);
    lines.push('');
  }

  return lines.join('\n');
}

async function execute(query: string): Promise<SkillResult> {
  const id = extractId(query);
  if (!id) {
    return {
      success: false,
      markdown: '## Call Lookup\n\nCould not extract an ID from your query. Try:\n- "lookup 478fd856-56a0-459f-b208-cb8212842e59"\n- "find call +16095162240"\n- "call lookup conv_8_+16095162240_1772034861373"',
    };
  }

  try {
    const result = await callLookup(id, { configs: '8,9', days: 30 });

    if (!result.found) {
      return {
        success: false,
        markdown: `## Call Lookup\n\nID \`${id}\` not found in Chord Langfuse configs (searched 30 days back).`,
      };
    }

    return { success: true, markdown: formatResult(result), data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Call Lookup Failed\n\nCould not look up \`${id}\`: ${msg}`,
    };
  }
}

export const callLookupSkill: SkillEntry = {
  id: 'call-lookup',
  label: 'Call Lookup',
  category: 'call',
  sampleQuery: 'lookup 478fd856-56a0-459f-b208-cb8212842e59',
  triggers: [
    /(?:look\s*up|find)\s+(?:call|trace|session)\b/i,
    /call\s+look\s*up/i,
    /search\s+langfuse/i,
    /look\s*up\s+[0-9a-f]{8}-/i,
    /find\s+[0-9a-f]{8}-[0-9a-f]{4}/i,
  ],
  execute,
};
