/**
 * Check Sandbox B scheduling tool code for debugging
 */
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/test-results.db'));

const tool = db.prepare('SELECT content FROM ab_sandbox_files WHERE sandbox_id = ? AND file_key = ?').get('sandbox_b', 'scheduling_tool');

const content = tool.content;
const lines = content.split('\n');

console.log('=== BASE_URL LINE ===');
lines.forEach((line, i) => {
    if (line.includes('BASE_URL') && line.includes('=')) {
        console.log('L' + (i+1) + ': ' + line.trim());
    }
});

console.log('\n=== DATE EXPANSION SETTINGS ===');
lines.forEach((line, i) => {
    if (line.includes('dateExpansion') || line.includes('MAX_WEEKS') || line.includes('{ days:')) {
        console.log('L' + (i+1) + ': ' + line.trim());
    }
});

console.log('\n=== SLOTS CASE BUILD BODY (lines 100-130) ===');
lines.slice(99, 130).forEach((line, i) => {
    console.log('L' + (100+i) + ': ' + line);
});

console.log('\n=== DATE EXPANSION LOGIC ===');
lines.forEach((line, i) => {
    if (line.includes('expansion') || line.includes('MAX_') || line.includes('progressively')) {
        console.log('L' + (i+1) + ': ' + line.trim());
    }
});

console.log('\n=== LINES 280-350 (execution logic) ===');
lines.slice(279, 350).forEach((line, i) => {
    console.log('L' + (280+i) + ': ' + line);
});

db.close();
