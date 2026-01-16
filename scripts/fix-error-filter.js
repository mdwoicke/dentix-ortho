const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'src', 'services', 'langfuseTraceService.ts');

let content = fs.readFileSync(filePath, 'utf8');

// Old filter pattern (for both getTraces and getSessions)
const oldFilter = `         AND (
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
        ) as error_count`;

// New filter - match actual tool names
const newFilter = `         AND (
           -- Filter: Only count errors from actual tool calls
           pto.name IN ('chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time', 'chord_handleEscalation')
         )
        ) as error_count`;

// Count occurrences
const count = (content.match(new RegExp(oldFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log(`Found ${count} occurrences of old filter`);

// Replace all occurrences
const newContent = content.split(oldFilter).join(newFilter);

fs.writeFileSync(filePath, newContent, 'utf8');

console.log(`Replaced ${count} occurrences`);
