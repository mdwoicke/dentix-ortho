# Sibling-Per-Child Booking Approach (Archived)

## Date: 2026-01-18
## Status: DEPRECATED - Reverted to parent-as-patient model

## Approach Summary
Each child gets their own patient record with unique patientGUID.
- Parent info stored in patient `note` field
- Separate SetPatient call per child
- Family linkage via shared phone number

## Why It Failed
1. Cloud9 API rejects 2nd SetPatient call with same phone number
2. Response: empty error, ~100ms (immediate rejection)
3. No duplicate detection bypass available
4. Cannot create multiple patients with the same phone number

## Files Involved
- `patient_tool_func.js` v7 (children array detection)
- `scheduling_tool_func.js` v53 (sibling workflow guidance)
- Node-RED createPatient with SetPatientComment for sibling workflow

## E2E Test Results
- Child 1: Created successfully
- Child 2: Failed with empty message
- Same phone caused Cloud9 duplicate rejection

## Key Code Patterns (for reference)

### patient_tool v7 - Sibling Detection (now removed)
```javascript
// v7: Detect invalid sibling booking pattern - LLM passing children array
if (params.children && Array.isArray(params.children)) {
    throw new Error(
        "INVALID: Do NOT pass 'children' array. For SIBLINGS, call create ONCE for EACH child separately. " +
        "Use the CHILD's firstName, lastName, birthdayDateTime - NOT the parent's info."
    );
}
```

### patient_tool v7 - Sibling Workflow Reminder (now removed)
```javascript
sibling_workflow_reminder: "For MULTIPLE CHILDREN: After booking this child, repeat for EACH remaining child. Call chord_ortho_patient action=create with NEXT child's firstName, lastName, birthdayDateTime. Each child needs their OWN patientGUID. NEVER reuse patientGUID between siblings."
```

## How to Restore (if needed)
1. Copy archived files back to docs/v1/
2. Run version update scripts:
   - `node scripts/update-prompt-version.js patient_tool "Restore sibling-per-child"`
   - `node scripts/update-prompt-version.js scheduling_tool "Restore sibling-per-child"`
3. Deploy to Node-RED

## Alternative Approach (Implemented)
Parent-as-patient model:
- Create parent as the patient (once)
- Store child info in appointment note field
- Reuse same patientGUID for all siblings
- Format: `Child: [name] | DOB: [date] | Insurance: [provider] | GroupID: [id] | MemberID: [id]`
