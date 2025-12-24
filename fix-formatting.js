const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'docs/Chord_Cloud9_SystemPrompt.md');
let content = fs.readFileSync(filePath, 'utf-8');

// Fix escaped underscores: \_ becomes _
content = content.replace(/\\_/g, '_');

// Fix double braces in JSON examples: {{ becomes { and }} becomes }
content = content.replace(/\{\{/g, '{');
content = content.replace(/\}\}/g, '}');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Fixed formatting in:', filePath);

// Verify
const newContent = fs.readFileSync(filePath, 'utf-8');
const remaining = (newContent.match(/\\_/g) || []).length;
console.log('Remaining escaped underscores:', remaining);
