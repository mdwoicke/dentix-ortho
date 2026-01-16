#!/usr/bin/env node
/**
 * Deploy v52 scheduling tool to Sandbox A Flowise chatflow
 *
 * This script extracts the v52 func code and provides instructions
 * for updating the Flowise tool.
 */

const fs = require('fs');
const path = require('path');

const SANDBOX_A_CHATFLOW_ID = '6fe5b0ca-b99a-4065-b881-a898df72a3a3';
const FLOWISE_URL = 'https://flowiseai-helnl-u15194.vm.elestio.app';

async function main() {
    console.log('='.repeat(70));
    console.log('DEPLOY v52 SCHEDULING TOOL TO SANDBOX A');
    console.log('='.repeat(70));

    // Read the current v52 tool
    const toolPath = path.join(__dirname, '..', '..', 'docs', 'v1', 'schedule_appointment_dso_Tool.json');
    const toolJson = JSON.parse(fs.readFileSync(toolPath, 'utf-8'));

    console.log('\n=== CURRENT TOOL FILE ===');
    console.log('Path:', toolPath);
    console.log('Name:', toolJson.name);

    // Extract version from func
    const versionMatch = toolJson.func.match(/TOOL_VERSION = '([^']+)'/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    console.log('Version:', version);

    // Read the escaped version (for Flowise)
    const escapedPath = path.join(__dirname, '..', '..', 'docs', 'v1', 'scheduling_tool_func_escaped.js');
    let escapedFunc = null;
    if (fs.existsSync(escapedPath)) {
        escapedFunc = fs.readFileSync(escapedPath, 'utf-8');
        console.log('\nEscaped func file exists:', escapedPath);
        console.log('Escaped func length:', escapedFunc.length, 'chars');
    } else {
        console.log('\nWARNING: Escaped func file not found. Creating it...');
        escapedFunc = toolJson.func.replace(/\{\{/g, '{{').replace(/\}\}/g, '}}');
        fs.writeFileSync(escapedPath, escapedFunc);
        console.log('Created:', escapedPath);
    }

    console.log('\n=== DEPLOYMENT INSTRUCTIONS ===\n');

    console.log('The v52 scheduling tool needs to be deployed to Sandbox A Flowise.');
    console.log('\nSandbox A Flowise Details:');
    console.log('  URL:', FLOWISE_URL);
    console.log('  Chatflow ID:', SANDBOX_A_CHATFLOW_ID);
    console.log('  Tool Name: schedule_appointment_ortho');

    console.log('\n--- OPTION 1: Manual Update via Flowise UI ---');
    console.log('1. Open Flowise:', `${FLOWISE_URL}/canvas/${SANDBOX_A_CHATFLOW_ID}`);
    console.log('2. Find the "schedule_appointment_ortho" custom tool');
    console.log('3. Replace the "func" field with content from:');
    console.log('   ', escapedPath);
    console.log('4. Save the chatflow');

    console.log('\n--- OPTION 2: API Update ---');
    console.log('Use the Flowise API to update the tool:');
    console.log(`
const response = await fetch('${FLOWISE_URL}/api/v1/tools/<TOOL_ID>', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <API_KEY>'
    },
    body: JSON.stringify({
        func: <escaped_func_content>
    })
});
`);

    console.log('\n=== KEY CHANGES IN v52 ===\n');
    console.log('1. SLOTS RESPONSE FORMAT:');
    console.log('   OLD (v49): { displayTime, bookingToken }');
    console.log('   NEW (v52): { displayTime, startTime, scheduleViewGUID, scheduleColumnGUID, appointmentTypeGUID, minutes }');

    console.log('\n2. BOOK_CHILD VALIDATION:');
    console.log('   OLD (v49): Requires bookingToken');
    console.log('   NEW (v52): Requires patientGUID, startTime, scheduleViewGUID');

    console.log('\n3. BOOK_CHILD BODY:');
    console.log('   OLD (v49): Decodes bookingToken to get slot details');
    console.log('   NEW (v52): Uses individual params directly');

    console.log('\n=== VERIFICATION ===\n');
    console.log('After deployment, run this test to verify:');
    console.log('  cd test-agent && node scripts/test-sandbox-a-tools.js');
    console.log('\nExpected results:');
    console.log('  - Slots should NOT have bookingToken');
    console.log('  - Slots should have individual GUIDs');
    console.log('  - Booking with individual GUIDs should work');

    // Output the func content for easy copy
    const outputPath = path.join(__dirname, 'v52-func-for-flowise.txt');
    fs.writeFileSync(outputPath, toolJson.func);
    console.log('\n=== FUNC CONTENT SAVED ===');
    console.log('Raw func saved to:', outputPath);
    console.log('(Use this content to update the Flowise tool)');

    console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
