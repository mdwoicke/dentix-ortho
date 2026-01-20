/**
 * Backfill appointment notes from Call_Summary
 *
 * This script:
 * 1. Finds prod_test_records with null trace_id and links them to goal_test_results
 * 2. Imports the traces to production_traces if not already present
 * 3. Updates the notes using the Call_Summary data
 */

const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const axios = require('axios');

const DB_PATH = path.resolve(__dirname, '../data/test-results.db');

// Langfuse configuration - loaded from database
let LANGFUSE_HOST = '';
let LANGFUSE_PUBLIC_KEY = '';
let LANGFUSE_SECRET_KEY = '';

function loadLangfuseConfig(db) {
  const config = db.prepare('SELECT public_key, secret_key, host FROM langfuse_configs WHERE id = 1').get();
  if (config) {
    LANGFUSE_HOST = config.host;
    LANGFUSE_PUBLIC_KEY = config.public_key;
    LANGFUSE_SECRET_KEY = config.secret_key;
    console.log(`Loaded Langfuse config from database: ${LANGFUSE_HOST}`);
  } else {
    throw new Error('No Langfuse config found in database');
  }
}

async function fetchTraceFromLangfuse(traceId) {
  try {
    const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64');
    const response = await axios.get(`${LANGFUSE_HOST}/api/public/traces/${traceId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });
    console.log(`  Trace response keys: ${Object.keys(response.data || {}).join(', ')}`);
    console.log(`  Output value: ${JSON.stringify(response.data?.output)?.substring(0, 200)}`);
    // Check observations for schedule_appointment_ortho tool call with input containing appointment GUID
    // We'll return the observations for further processing
    response.data._appointmentObs = response.data.observations || [];

    // Also look for the last flowise-prediction observation's output which contains PAYLOAD
    const flowisePredictions = (response.data.observations || [])
      .filter(o => o.name === 'flowise-prediction' && o.output)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    for (const pred of flowisePredictions) {
      const outputStr = typeof pred.output === 'string' ? pred.output : JSON.stringify(pred.output);
      if (outputStr.includes('PAYLOAD')) {
        console.log(`  Found PAYLOAD in flowise-prediction from ${pred.startTime}`);
        response.data.output = outputStr;
        break;
      }
    }
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch trace ${traceId}:`, error.message);
    if (error.response) {
      console.error(`  Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

function extractChildInfoFromPayload(output, appointmentGuid) {
  try {
    // Extract PAYLOAD from output
    const payloadMatch = output.match(/PAYLOAD:\s*(\{[\s\S]*\})/);
    if (!payloadMatch) return null;

    let payload;
    try {
      payload = JSON.parse(payloadMatch[1]);
    } catch (e) {
      // Try parsing with escaped quotes removed
      try {
        const cleaned = payloadMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
        payload = JSON.parse(cleaned);
      } catch (e2) {
        return null;
      }
    }

    const callSummary = payload?.Call_Summary;
    if (!callSummary) return null;

    const upperApptGuid = appointmentGuid.toUpperCase();

    // Check Child1, Child2, Child3, etc.
    for (let i = 1; i <= 5; i++) {
      const childApptGuid = callSummary[`Child${i}_appointmentGUID`] || callSummary[`Child${i}_appointmentId`];
      if (childApptGuid && childApptGuid.toUpperCase() === upperApptGuid) {
        const firstName = callSummary[`Child${i}_FirstName`];
        const lastName = callSummary[`Child${i}_LastName`];
        const dob = callSummary[`Child${i}_DOB`];

        if (firstName) {
          console.log(`Found child info in Call_Summary: Child${i} = ${firstName} ${lastName || ''}`);
          return {
            childName: lastName ? `${firstName} ${lastName}` : firstName,
            childDOB: dob || null,
            insuranceProvider: callSummary.insurance_provider || callSummary.insuranceProvider || null,
            groupID: callSummary.insurance_group || callSummary.groupID || null,
            memberID: callSummary.insurance_member_id || callSummary.memberID || null,
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.error(`Error extracting child info:`, err.message);
    return null;
  }
}

async function main() {
  const db = new BetterSqlite3(DB_PATH);
  let updated = 0;

  try {
    // Load Langfuse config from database
    loadLangfuseConfig(db);

    // Step 1: Find records that need trace_id backfill
    console.log('\n=== Step 1: Finding records that need trace_id backfill ===');

    const recordsNeedingLink = db.prepare(`
      SELECT
        p.id,
        p.appointment_guid,
        p.cleanup_notes,
        p.note,
        p.trace_id
      FROM prod_test_records p
      WHERE p.record_type = 'appointment'
        AND p.cleanup_notes LIKE 'Goal Test:%'
        AND (p.note IS NULL OR p.note = '')
    `).all();

    console.log(`Found ${recordsNeedingLink.length} records needing trace_id and note`);

    for (const record of recordsNeedingLink) {
      console.log(`\nProcessing appointment ${record.appointment_guid}`);

      // Extract run_id from cleanup_notes (format: "Goal Test: GOAL-HAPPY-002 (Run: run-2026-01-20-ce329371)")
      const runIdMatch = record.cleanup_notes.match(/Run:\s*([^)]+)/);
      if (!runIdMatch) {
        console.log(`  Could not extract run_id from: ${record.cleanup_notes}`);
        continue;
      }

      const runId = runIdMatch[1].trim();
      console.log(`  Run ID: ${runId}`);

      // Find the goal test result with this run_id
      const goalResult = db.prepare(`
        SELECT langfuse_trace_id, flowise_session_id, resolved_persona_json
        FROM goal_test_results
        WHERE run_id = ?
      `).get(runId);

      if (!goalResult) {
        console.log(`  No goal_test_result found for run_id: ${runId}`);
        continue;
      }

      let traceId = record.trace_id || goalResult.langfuse_trace_id;
      let sessionId = goalResult.flowise_session_id;

      // Try to extract child info from resolved persona first
      let childInfo = null;
      if (goalResult.resolved_persona_json) {
        try {
          const persona = JSON.parse(goalResult.resolved_persona_json);
          const children = persona.inventory?.children || [];
          console.log(`  Found ${children.length} children in persona`);

          // Get all appointments for this run to determine child order
          const runAppts = db.prepare(`
            SELECT id, appointment_guid, appointment_datetime
            FROM prod_test_records
            WHERE cleanup_notes LIKE ? AND record_type = 'appointment'
            ORDER BY appointment_datetime ASC
          `).all('%' + runId + '%');

          // Find the index of this appointment in the run
          const apptIndex = runAppts.findIndex(a => a.appointment_guid === record.appointment_guid);
          console.log(`  This appointment is #${apptIndex + 1} of ${runAppts.length} in the run`);

          // Match child by index (assumes appointments are created in same order as children)
          if (apptIndex >= 0 && apptIndex < children.length) {
            const child = children[apptIndex];
            childInfo = {
              childName: child.firstName + ' ' + child.lastName,
              childDOB: child.dateOfBirth,
              insuranceProvider: persona.inventory?.insuranceProvider,
            };
            console.log(`  Matched to child: ${childInfo.childName}`);
          }
        } catch (e) {
          console.log(`  Error parsing persona: ${e.message}`);
        }
      }

      // If we have child info from persona, update the record
      if (childInfo && childInfo.childName) {
        const parts = [`Child: ${childInfo.childName}`];
        if (childInfo.childDOB) parts.push(`DOB: ${childInfo.childDOB}`);
        if (childInfo.insuranceProvider) parts.push(`Insurance: ${childInfo.insuranceProvider}`);
        const note = parts.join(' | ');

        // Update the record
        db.prepare(`
          UPDATE prod_test_records
          SET note = ?, trace_id = ?, session_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(note, traceId, sessionId, record.id);

        console.log(`  Updated note: ${note}`);
        updated++;
      } else {
        // Only update trace_id if it wasn't already set
        if (!record.trace_id && traceId) {
          db.prepare(`
            UPDATE prod_test_records
            SET trace_id = ?, session_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(traceId, sessionId, record.id);
        }
        console.log(`  No child info found`);
      }
    }

    console.log(`\n=== Done ===`);
    console.log(`Updated ${updated} records with notes`);
  } finally {
    db.close();
  }
}

main().catch(console.error);
