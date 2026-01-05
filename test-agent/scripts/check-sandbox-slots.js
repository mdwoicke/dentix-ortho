// Check sandbox slot availability
const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db', { readonly: true });

// Get recent API calls for slot-related actions
const calls = db.prepare(`
  SELECT tool_name, request_payload, response_payload, timestamp
  FROM api_calls
  WHERE tool_name LIKE '%schedule%'
    AND (request_payload LIKE '%slots%' OR request_payload LIKE '%grouped_slots%')
  ORDER BY id DESC
  LIMIT 10
`).all();

console.log('=== Recent Slot API Calls ===\n');

for (const call of calls) {
  console.log('Time:', call.timestamp);
  console.log('Tool:', call.tool_name);

  try {
    const req = JSON.parse(call.request_payload);
    console.log('Action:', req.action);
    console.log('Date Range:', req.startDate, 'to', req.endDate);
  } catch (e) {}

  try {
    const res = JSON.parse(call.response_payload);
    if (res.totalSlots !== undefined) {
      console.log('Total Slots:', res.totalSlots);
    }
    if (res.totalGroups !== undefined) {
      console.log('Total Groups:', res.totalGroups);
    }
    if (res._debug_error) {
      console.log('Error:', res._debug_error);
    }
    if (res.llm_guidance?.error_type) {
      console.log('LLM Guidance Error:', res.llm_guidance.error_type);
    }
  } catch (e) {}

  console.log('---\n');
}

db.close();
