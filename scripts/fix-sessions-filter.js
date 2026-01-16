const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'src', 'services', 'langfuseTraceService.ts');

let content = fs.readFileSync(filePath, 'utf8');

// Old filter pattern for sessions (has extra indentation)
const oldFilter = `           AND (
             -- Filter: Only include observations that would appear in the detail view
             -- Must be GENERATION, SPAN, or have 'tool'/'api' in the name
             FALSE
             OR LOWER(pto.name) LIKE '%tool%'
             OR LOWER(pto.name) LIKE '%api%'
           )
           AND (
             -- Exclude internal Langchain traces that are filtered out in transformToApiCalls
             pto.name IS NULL
             OR (
               pto.name NOT LIKE '%RunnableMap%'
               AND pto.name NOT LIKE '%RunnableLambda%'
               AND pto.name NOT LIKE '%RunnableSequence%'
               AND pto.name NOT LIKE '%RunnableParallel%'
               AND pto.name NOT LIKE '%RunnableBranch%'
               AND pto.name NOT LIKE '%RunnablePassthrough%'
             )
           )
        ) as error_count,`;

// New filter - match actual tool names
const newFilter = `           AND (
             -- Filter: Only count errors from actual tool calls
             pto.name IN ('chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time', 'chord_handleEscalation')
           )
        ) as error_count,`;

// Check if old filter exists
const hasOld = content.includes(oldFilter);
console.log(`Old filter found: ${hasOld}`);

if (hasOld) {
    const newContent = content.replace(oldFilter, newFilter);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Replaced sessions filter');
} else {
    console.log('Old filter not found - checking what we have...');
    // Print lines 652-671 to see current state
    const lines = content.split('\n');
    console.log('Lines 652-671:');
    for (let i = 651; i < 671 && i < lines.length; i++) {
        console.log(`${i+1}: ${lines[i]}`);
    }
}
