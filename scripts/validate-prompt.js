#!/usr/bin/env node
/**
 * Prompt Validation Script
 * Validates system prompts for Flowise compatibility
 * Checks for illegal characters, unbalanced braces, and malformed data
 */

const fs = require('fs');
const path = require('path');

const PROMPT_PATH = path.join(__dirname, '..', 'docs', 'Chord_Cloud9_SystemPrompt.md');

function validatePrompt(filePath) {
  console.log('=== FLOWISE PROMPT VALIDATION ===\n');

  if (!fs.existsSync(filePath)) {
    console.error('❌ CRITICAL: File not found:', filePath);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];
  const warnings = [];
  const info = [];

  console.log(`File: ${path.basename(filePath)}`);
  console.log(`Size: ${content.length} chars, ${lines.length} lines\n`);

  // 1. Check for unbalanced braces (CRITICAL for Flowise)
  const openBraces = (content.match(/{/g) || []).length;
  const closeBraces = (content.match(/}/g) || []).length;

  if (openBraces !== closeBraces) {
    issues.push(`Unbalanced braces - { count: ${openBraces}, } count: ${closeBraces}`);

    // Find lines with braces for debugging
    lines.forEach((line, idx) => {
      if (line.includes('{') || line.includes('}')) {
        const lineOpen = (line.match(/{/g) || []).length;
        const lineClose = (line.match(/}/g) || []).length;
        if (lineOpen !== lineClose) {
          issues.push(`  Line ${idx + 1}: "${line.substring(0, 60)}..." (open: ${lineOpen}, close: ${lineClose})`);
        }
      }
    });
  } else if (openBraces > 0) {
    warnings.push(`Found ${openBraces} brace pairs - these may be parsed as template variables`);
  } else {
    info.push('No literal braces found - safe for Flowise templates');
  }

  // 2. Check for Handlebars/Mustache template patterns
  const handlebarsPatterns = content.match(/\{\{[^}]*\}\}/g) || [];
  if (handlebarsPatterns.length > 0) {
    info.push(`Found ${handlebarsPatterns.length} Handlebars-style templates (double braces)`);
  }

  // 3. Check for single-brace template patterns (problematic in Flowise)
  const singleBracePatterns = content.match(/\{[^{}\n]+\}/g) || [];
  if (singleBracePatterns.length > 0) {
    warnings.push(`Found ${singleBracePatterns.length} single-brace patterns that Flowise may parse as templates:`);
    singleBracePatterns.slice(0, 5).forEach(p => {
      warnings.push(`  - "${p.substring(0, 50)}${p.length > 50 ? '...' : ''}"`);
    });
    if (singleBracePatterns.length > 5) {
      warnings.push(`  ... and ${singleBracePatterns.length - 5} more`);
    }
  }

  // 4. Check for $vars patterns (Voiceflow/telephony syntax)
  const dollarVarPatterns = content.match(/\{\$[^}]+\}/g) || [];
  if (dollarVarPatterns.length > 0) {
    issues.push(`Found ${dollarVarPatterns.length} {$vars...} patterns - these cause Flowise template errors:`);
    dollarVarPatterns.forEach(p => {
      issues.push(`  - "${p}"`);
    });
  }

  // 5. Check for JSON-like structures outside code blocks
  const jsonObjectPattern = /^\s*\{[\s\S]*?\}\s*$/gm;
  const jsonMatches = content.match(jsonObjectPattern) || [];
  if (jsonMatches.length > 0) {
    warnings.push(`Found ${jsonMatches.length} JSON-like object structures - ensure these are in code blocks or converted to lists`);
  }

  // 6. Check for unclosed XML-like tags
  const tagNames = new Set();
  const openTagMatches = content.match(/<([a-z_][a-z0-9_]*)>/gi) || [];
  const closeTagMatches = content.match(/<\/([a-z_][a-z0-9_]*)>/gi) || [];

  openTagMatches.forEach(tag => {
    const name = tag.match(/<([a-z_][a-z0-9_]*)>/i)[1].toLowerCase();
    tagNames.add(name);
  });

  tagNames.forEach(name => {
    const openCount = (content.match(new RegExp(`<${name}>`, 'gi')) || []).length;
    const closeCount = (content.match(new RegExp(`</${name}>`, 'gi')) || []).length;
    if (openCount !== closeCount) {
      warnings.push(`Unclosed XML tag <${name}>: ${openCount} open, ${closeCount} close`);
    }
  });

  // 7. Check for non-UTF8 or problematic characters
  const problematicChars = content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || [];
  if (problematicChars.length > 0) {
    issues.push(`Found ${problematicChars.length} control characters that may cause encoding issues`);
  }

  // 8. Check for common escape sequence issues
  const badEscapes = content.match(/\\[^nrt\\\"\'0bfv\[\]]/g) || [];
  if (badEscapes.length > 0) {
    const unique = [...new Set(badEscapes)];
    info.push(`Found escape sequences: ${unique.join(', ')}`);
  }

  // 9. Check for very long lines that might cause issues
  const longLines = lines.filter(l => l.length > 1000);
  if (longLines.length > 0) {
    warnings.push(`Found ${longLines.length} lines over 1000 characters`);
  }

  // Print results
  console.log('--- RESULTS ---\n');

  if (issues.length > 0) {
    console.log('❌ CRITICAL ISSUES (must fix):');
    issues.forEach(i => console.log(`   ${i}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS (review recommended):');
    warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }

  if (info.length > 0) {
    console.log('ℹ️  INFO:');
    info.forEach(i => console.log(`   ${i}`));
    console.log('');
  }

  // Summary
  console.log('--- SUMMARY ---\n');
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ PASSED: Prompt is valid for Flowise');
    return true;
  } else if (issues.length === 0) {
    console.log(`⚠️  PASSED WITH WARNINGS: ${warnings.length} warning(s) to review`);
    return true;
  } else {
    console.log(`❌ FAILED: ${issues.length} critical issue(s) must be fixed`);
    return false;
  }
}

// Run validation
const isValid = validatePrompt(PROMPT_PATH);
process.exit(isValid ? 0 : 1);
