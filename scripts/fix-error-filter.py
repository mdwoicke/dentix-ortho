import re

file_path = r'C:\Users\mwoic\PycharmProjects\PythonProject\dentix-ortho\backend\src\services\langfuseTraceService.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Old filter pattern (for both getTraces and getSessions)
old_filter = '''         AND (
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
        ) as error_count'''

# New filter - match actual tool names
new_filter = '''         AND (
           -- Filter: Only count errors from actual tool calls
           pto.name IN ('chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time', 'chord_handleEscalation')
         )
        ) as error_count'''

# Count occurrences
count = content.count(old_filter)
print(f"Found {count} occurrences of old filter")

# Replace
new_content = content.replace(old_filter, new_filter)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Replaced {count} occurrences")
