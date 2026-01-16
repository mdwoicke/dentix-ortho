#!/usr/bin/env node
/**
 * Deploy v54 scheduling tool to Sandbox B Flowise chatflow
 *
 * v54 FIX: SLIDING WINDOW SEARCH - Cloud9 API returns 0 slots for ranges > 14 days
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SANDBOX_B_CHATFLOW_ID = '2b60cf7c-73a1-4fe0-8e0f-4469bfde2b22';
const FLOWISE_URL = 'https://flowiseai-helnl-u15194.vm.elestio.app';

async function getFlowiseApiKey() {
    // Try to get API key from database
    try {
        const BetterSqlite3 = require('better-sqlite3');
        const dbPath = path.join(__dirname, '..', 'data', 'test-results.db');
        const db = new BetterSqlite3(dbPath, { readonly: true });
        const config = db.prepare("SELECT api_key FROM flowise_configs WHERE name LIKE '%Sandbox B%'").get();
        db.close();
        if (config && config.api_key) return config.api_key;
    } catch (e) {
        console.log('Could not get API key from DB:', e.message);
    }
    return process.env.FLOWISE_API_KEY || null;
}

async function getChatflowTools(apiKey) {
    const url = `${FLOWISE_URL}/api/v1/chatflows/${SANDBOX_B_CHATFLOW_ID}`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
        throw new Error(`Failed to get chatflow: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function updateTool(toolId, funcContent, apiKey) {
    const url = `${FLOWISE_URL}/api/v1/tools/${toolId}`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ func: funcContent })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to update tool: ${response.status} ${text}`);
    }
    return response.json();
}

async function main() {
    console.log('='.repeat(70));
    console.log('DEPLOY v54 SCHEDULING TOOL TO SANDBOX B');
    console.log('='.repeat(70));

    // Read the v54 escaped func
    const escapedPath = path.join(__dirname, '..', '..', 'docs', 'v1', 'scheduling_tool_func_escaped.js');
    if (!fs.existsSync(escapedPath)) {
        console.error('ERROR: Escaped func file not found:', escapedPath);
        process.exit(1);
    }

    const escapedFunc = fs.readFileSync(escapedPath, 'utf-8');
    const versionMatch = escapedFunc.match(/TOOL_VERSION = '([^']+)'/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    console.log('\n=== SOURCE FILE ===');
    console.log('Path:', escapedPath);
    console.log('Version:', version);
    console.log('Length:', escapedFunc.length, 'chars');

    console.log('\n=== TARGET ===');
    console.log('Flowise URL:', FLOWISE_URL);
    console.log('Chatflow ID:', SANDBOX_B_CHATFLOW_ID);
    console.log('Canvas URL:', `${FLOWISE_URL}/canvas/${SANDBOX_B_CHATFLOW_ID}`);

    const apiKey = await getFlowiseApiKey();

    if (!apiKey) {
        console.log('\n=== MANUAL DEPLOYMENT REQUIRED ===');
        console.log('No API key found. Please update manually:');
        console.log('1. Open:', `${FLOWISE_URL}/canvas/${SANDBOX_B_CHATFLOW_ID}`);
        console.log('2. Find the "schedule_appointment_ortho" or similar tool');
        console.log('3. Replace the "func" field with content from:');
        console.log('   ', escapedPath);
        console.log('4. Save the chatflow');

        // Save func to a text file for easy copy
        const outputPath = path.join(__dirname, 'v54-func-for-sandbox-b.txt');
        fs.writeFileSync(outputPath, escapedFunc);
        console.log('\n5. Or copy from:', outputPath);
        return;
    }

    console.log('\n=== API KEY FOUND - ATTEMPTING AUTO-DEPLOY ===');

    try {
        // Get chatflow to find the tool ID
        console.log('Fetching chatflow...');
        const chatflow = await getChatflowTools(apiKey);
        console.log('Chatflow name:', chatflow.name);

        // Parse the flowData to find the scheduling tool
        const flowData = JSON.parse(chatflow.flowData);
        let schedulingToolNode = null;

        for (const node of flowData.nodes) {
            if (node.data && node.data.name &&
                (node.data.name.includes('schedule') || node.data.name.includes('scheduling'))) {
                schedulingToolNode = node;
                break;
            }
        }

        if (!schedulingToolNode) {
            console.log('Could not find scheduling tool node. Manual update required.');
            console.log('Open:', `${FLOWISE_URL}/canvas/${SANDBOX_B_CHATFLOW_ID}`);
            return;
        }

        console.log('Found scheduling tool node:', schedulingToolNode.data.name);
        console.log('Node ID:', schedulingToolNode.id);

        // The tool ID might be in the node data
        const toolId = schedulingToolNode.data.id || schedulingToolNode.id;
        console.log('Tool ID:', toolId);

        // Try to update
        console.log('Updating tool...');
        const result = await updateTool(toolId, escapedFunc, apiKey);
        console.log('Update result:', JSON.stringify(result, null, 2));
        console.log('\n✓ Successfully deployed v54 to Sandbox B!');

    } catch (error) {
        console.error('\nAuto-deploy failed:', error.message);
        console.log('\nFalling back to manual instructions:');
        console.log('1. Open:', `${FLOWISE_URL}/canvas/${SANDBOX_B_CHATFLOW_ID}`);
        console.log('2. Find and update the scheduling tool');
        console.log('3. Replace func with content from:', escapedPath);
    }
}

main().catch(console.error);
