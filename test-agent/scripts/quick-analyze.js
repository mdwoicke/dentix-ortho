#!/usr/bin/env node
/**
 * Quick Failure Analysis Script
 *
 * One-command analysis of recent test failures.
 * Shows failed goals, API errors, and last conversation turns.
 *
 * Usage:
 *   node scripts/quick-analyze.js           # Analyze last 5 failures
 *   node scripts/quick-analyze.js GOAL-HAPPY-002  # Analyze specific test
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/test-results.db');
const db = new Database(dbPath, { readonly: true });

const testIdFilter = process.argv[2];

// Get latest failed test(s)
let query = `
  SELECT r.test_id, r.run_id, r.passed, r.turn_count, r.duration_ms,
         r.goal_results_json, r.summary_text,
         t.transcript_json
  FROM goal_test_results r
  LEFT JOIN transcripts t ON r.run_id = t.run_id
  WHERE r.passed = 0
`;

if (testIdFilter) {
  query += ` AND r.test_id = ?`;
}

query += ` ORDER BY r.id DESC LIMIT 5`;

const failures = testIdFilter
  ? db.prepare(query).all(testIdFilter)
  : db.prepare(query).all();

if (failures.length === 0) {
  console.log('No failures found' + (testIdFilter ? ` for ${testIdFilter}` : ''));
  process.exit(0);
}

// Prepare API calls query
const apiCallsQuery = db.prepare(`
  SELECT tool_name, request_payload, response_payload, status
  FROM api_calls
  WHERE run_id = ?
  ORDER BY id
`);

// Prepare API errors query
const apiErrorsQuery = db.prepare(`
  SELECT tool_name, request_payload, response_payload
  FROM api_calls
  WHERE run_id = ? AND (
    response_payload LIKE '%error%' OR
    response_payload LIKE '%success":false%'
  )
`);

console.log('=' .repeat(70));
console.log('QUICK FAILURE ANALYSIS');
console.log('=' .repeat(70));

for (const f of failures) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${f.test_id}`);
  console.log(`Run: ${f.run_id} | Turns: ${f.turn_count} | Duration: ${(f.duration_ms/1000).toFixed(1)}s`);
  console.log('-'.repeat(70));

  // Parse and show failed goals
  if (f.goal_results_json) {
    try {
      const goals = JSON.parse(f.goal_results_json);
      const failedGoals = goals.filter(g => !g.passed);
      const passedGoals = goals.filter(g => g.passed);

      console.log(`\nGOALS: ${passedGoals.length} passed, ${failedGoals.length} failed`);
      if (failedGoals.length > 0) {
        console.log('Failed:');
        failedGoals.forEach(g => {
          console.log(`  - ${g.goalId}: ${g.reason || 'No reason provided'}`);
        });
      }
    } catch (e) {
      console.log('Could not parse goal results');
    }
  }

  // Show summary if available
  if (f.summary_text) {
    console.log(`\nSUMMARY: ${f.summary_text}`);
  }

  // Show API errors
  const errors = apiErrorsQuery.all(f.run_id);
  if (errors.length > 0) {
    console.log('\nAPI ERRORS:');
    errors.forEach(e => {
      try {
        const res = JSON.parse(e.response_payload);
        const debugError = res._debug_error;
        const errorType = res.llm_guidance?.error_type;
        const toolVersion = res._toolVersion;

        console.log(`  - ${e.tool_name}${toolVersion ? ` (${toolVersion})` : ''}`);
        if (debugError) console.log(`    Debug: ${debugError}`);
        if (errorType) console.log(`    Type: ${errorType}`);

        // Show request params
        if (e.request_payload) {
          const req = JSON.parse(e.request_payload);
          console.log(`    Request: action=${req.action}, dates=${req.startDate}-${req.endDate}`);
        }
      } catch (err) {
        console.log(`  - ${e.tool_name}: ${e.response_payload?.substring(0, 100)}`);
      }
    });
  }

  // Show all tool calls summary
  const allCalls = apiCallsQuery.all(f.run_id);
  if (allCalls.length > 0) {
    console.log('\nTOOL CALLS:');
    allCalls.forEach(c => {
      if (c.tool_name === 'schedule_appointment_ortho') {
        try {
          const req = JSON.parse(c.request_payload);
          const res = JSON.parse(c.response_payload);
          const success = res.success !== false;
          const status = success ? 'OK' : 'FAIL';
          console.log(`  [${status}] ${c.tool_name} action=${req.action}`);
        } catch {
          console.log(`  [?] ${c.tool_name}`);
        }
      }
    });
  }

  // Show last 8 turns of transcript
  if (f.transcript_json) {
    try {
      const transcript = JSON.parse(f.transcript_json);
      const lastTurns = transcript.slice(-8);

      console.log('\nLAST CONVERSATION TURNS:');
      lastTurns.forEach((t, i) => {
        const turnNum = transcript.length - lastTurns.length + i + 1;
        const role = t.role === 'assistant' ? 'BOT' : 'USR';

        // For assistant, show content before PAYLOAD
        let content = t.content;
        if (t.role === 'assistant') {
          content = content.split('PAYLOAD')[0].trim();
        }

        // Truncate long content
        if (content.length > 150) {
          content = content.substring(0, 147) + '...';
        }

        console.log(`  ${turnNum}. [${role}] ${content}`);
      });

      // Check terminal state from last assistant turn
      const lastAssistant = [...transcript].reverse().find(t => t.role === 'assistant');
      if (lastAssistant) {
        const payloadMatch = lastAssistant.content.match(/PAYLOAD:\s*(\{[\s\S]*\})/);
        if (payloadMatch) {
          try {
            const payload = JSON.parse(payloadMatch[1]);
            console.log('\nFINAL STATE:');
            console.log(`  State: ${payload.state}`);
            if (payload.callSummary) {
              console.log(`  Disposition: ${payload.callSummary.disposition}`);
              console.log(`  Booked: ${payload.callSummary.booked}`);
              if (payload.callSummary.transferReason) {
                console.log(`  Transfer Reason: ${payload.callSummary.transferReason}`);
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      console.log('Could not parse transcript');
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log('QUICK FIX REFERENCE:');
console.log('-'.repeat(70));
console.log('api_error          -> Check scheduling_tool_func.js or Node Red');
console.log('transfer_initiated -> Check system prompt or tool error handling');
console.log('booking-confirmed  -> Check category-classifier.ts (bookingConfirmedThisTurn)');
console.log('Wrong data         -> Check response-strategy-engine.ts');
console.log('Date issues        -> Check SANDBOX_MIN_DATE (01/13/2026) in tool');
console.log('='.repeat(70));

db.close();
