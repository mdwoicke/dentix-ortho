#!/usr/bin/env node
/**
 * Deploy v56 scheduling tool to Sandbox B Flowise chatflow
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const FLOWISE_URL = 'https://flowiseai-helnl-u15194.vm.elestio.app';
const CHATFLOW_ID = '2b60cf7c-73a1-4fe0-8e0f-4469bfde2b22';

async function main() {
    console.log('=== DEPLOY v56 TO SANDBOX B ===\n');

    // Read the v56 escaped func
    const escapedPath = path.join(__dirname, '..', '..', 'docs', 'v1', 'scheduling_tool_func_escaped.js');
    const escapedFunc = fs.readFileSync(escapedPath, 'utf-8');
    const versionMatch = escapedFunc.match(/TOOL_VERSION = '([^']+)'/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    console.log('Source version:', version);
    console.log('Source length:', escapedFunc.length, 'chars\n');

    // Get chatflow
    console.log('Fetching chatflow...');
    const response = await fetch(`${FLOWISE_URL}/api/v1/chatflows/${CHATFLOW_ID}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        console.log('Error fetching chatflow:', response.status, response.statusText);
        return;
    }

    const chatflow = await response.json();
    console.log('Chatflow:', chatflow.name);

    const flowData = JSON.parse(chatflow.flowData);
    console.log('Nodes:', flowData.nodes.length);

    // Find scheduling tool node
    let schedulingNode = null;
    for (const node of flowData.nodes) {
        if (node.data && node.data.name && node.data.name.includes('schedule')) {
            schedulingNode = node;
            break;
        }
    }

    if (!schedulingNode) {
        console.log('ERROR: Could not find scheduling tool node');
        return;
    }

    console.log('\nFound scheduling tool:');
    console.log('  Node ID:', schedulingNode.id);
    console.log('  Name:', schedulingNode.data.name);

    const currentFunc = schedulingNode.data.inputs?.func || '';
    const currentVersionMatch = currentFunc.match(/TOOL_VERSION = '([^']+)'/);
    console.log('  Current version:', currentVersionMatch ? currentVersionMatch[1] : 'unknown');

    // Update the func in the node
    console.log('\nUpdating to', version, '...');
    schedulingNode.data.inputs.func = escapedFunc;

    // Save updated chatflow
    const updateResponse = await fetch(`${FLOWISE_URL}/api/v1/chatflows/${CHATFLOW_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            flowData: JSON.stringify(flowData)
        })
    });

    if (!updateResponse.ok) {
        const text = await updateResponse.text();
        console.log('ERROR updating chatflow:', updateResponse.status, text);
        return;
    }

    console.log('\n✓ Successfully deployed', version, 'to Sandbox B!');
    console.log('Canvas URL:', `${FLOWISE_URL}/canvas/${CHATFLOW_ID}`);
}

main().catch(e => console.error('Error:', e.message));
