const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/test-results.db');
const db = new Database(DB_PATH, { readonly: true });

// Get the patient_tool content for sandbox_a
const tool = db.prepare("SELECT content FROM ab_sandbox_files WHERE sandbox_id = 'sandbox_a' AND file_key = 'patient_tool'").get();
const content = tool.content;

// Parse if it's JSON to get the func
let funcContent = content;
if (content.startsWith('{')) {
    try {
        const parsed = JSON.parse(content);
        funcContent = parsed.func || content;
    } catch(e) {}
}

console.log('=== SEARCHING FOR URL PATTERNS IN SANDBOX A PATIENT TOOL ===\n');

// Look for any URL patterns
const urlPatterns = funcContent.match(/https?:\/\/[^\s"'`]+/g);
if (urlPatterns) {
    console.log('URLs found:');
    [...new Set(urlPatterns)].forEach(url => console.log('  ' + url));
} else {
    console.log('No URLs found in content!');
}

// Also check for BASE_URL constant
const baseMatch = funcContent.match(/BASE_URL\s*=\s*['"`]([^'"`]+)/);
console.log('\nBASE_URL constant:', baseMatch ? baseMatch[1] : 'NOT FOUND');

// Check if there's ortho-prd or ortho-test in the paths
console.log('\nEnvironment indicators:');
if (funcContent.includes('ortho-prd')) console.log('  Contains: ortho-prd (PRODUCTION routes)');
if (funcContent.includes('ortho-test')) console.log('  Contains: ortho-test (TEST routes)');
if (funcContent.includes('partnertest')) console.log('  Contains: partnertest (TEST Cloud9)');
if (funcContent.includes('us-ea1-partner.cloud9')) console.log('  Contains: us-ea1-partner (PROD Cloud9)');
if (funcContent.includes('c1-aicoe-nodered-lb.prod')) console.log('  Contains: c1-aicoe-nodered-lb.prod (PROD Node-RED)');

db.close();
