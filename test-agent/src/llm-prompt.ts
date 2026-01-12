/**
 * LLM Prompt CLI
 * Uses the shared ClaudeCliService for proper stdin handling on Windows
 *
 * Usage: npx ts-node src/llm-prompt.ts --prompt "your prompt" [--model haiku|sonnet|opus]
 */

import { claudeCliService } from '../../shared/services/claude-cli-service';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let prompt = '';
  let model = 'sonnet'; // default

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt' || args[i] === '-p') {
      prompt = args[i + 1] || '';
      i++;
    } else if (args[i] === '--model' || args[i] === '-m') {
      model = args[i + 1] || 'sonnet';
      i++;
    } else if (!args[i].startsWith('-')) {
      // Bare argument is treated as prompt
      prompt = args[i];
    }
  }

  if (!prompt) {
    console.error('Error: No prompt provided');
    console.error('Usage: npm run llm-prompt -- --prompt "your prompt" [--model haiku|sonnet|opus]');
    process.exit(1);
  }

  // Check CLI status first
  const status = await claudeCliService.checkStatus();

  if (!status.installed) {
    console.error('Error: Claude CLI is not installed');
    console.error('Install it with: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }

  if (!status.authenticated) {
    console.error('Error: Claude CLI is not authenticated');
    console.error('Run: claude login');
    process.exit(1);
  }

  console.log(`[LLM] Using model: ${model}`);
  console.log(`[LLM] Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
  console.log('---');

  // Execute the prompt
  const response = await claudeCliService.execute({
    prompt,
    model,
    timeout: 120000, // 2 minutes
  });

  if (response.success) {
    console.log(response.result);
    console.log('---');
    console.log(`[LLM] Completed in ${response.durationMs}ms`);
    if (response.usage) {
      console.log(`[LLM] Tokens: ${response.usage.inputTokens} in, ${response.usage.outputTokens} out`);
    }
  } else {
    console.error(`[LLM] Error: ${response.error}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
