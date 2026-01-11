/**
 * Claude Skill Service
 * Executes Claude skill .MD files using the LLM Provider
 * Provides EventEmitter-based streaming compatible with existing SSE infrastructure
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { parseSkillFile, discoverSkillFiles, getDefaultSkillsDir, SkillFileInfo } from './skillFileParser';
import { getLLMProvider } from '../../../shared/services/llm-provider';

// ============================================================================
// Types
// ============================================================================

export interface ClaudeSkillRequest {
  /** Path to the skill .MD file */
  skillFilePath: string;
  /** User's prompt/request */
  userPrompt: string;
  /** Model to use (sonnet, opus, haiku) */
  model?: string;
  /** Timeout in ms (default: 120000) */
  timeout?: number;
}

export interface ClaudeSkillSession {
  sessionId: string;
  emitter: EventEmitter;
  status: 'running' | 'completed' | 'failed';
  startTime: number;
  output: string[];
}

// ============================================================================
// Service
// ============================================================================

class ClaudeSkillService {
  private sessions: Map<string, ClaudeSkillSession> = new Map();
  private projectRoot: string;

  constructor() {
    // Get project root from environment or default
    this.projectRoot = process.env.PROJECT_ROOT ||
      process.cwd().replace(/[\\/]backend$/, '');
  }

  /**
   * Execute a Claude skill file
   */
  async executeClaudeSkill(request: ClaudeSkillRequest): Promise<{
    sessionId: string;
    emitter: EventEmitter;
  }> {
    const sessionId = uuidv4();
    const emitter = new EventEmitter();

    // Create session
    const session: ClaudeSkillSession = {
      sessionId,
      emitter,
      status: 'running',
      startTime: Date.now(),
      output: [],
    };
    this.sessions.set(sessionId, session);

    // Start execution asynchronously
    this.runSkillExecution(session, request).catch(error => {
      console.error(`[ClaudeSkillService] Session ${sessionId} failed:`, error);
    });

    return { sessionId, emitter };
  }

  /**
   * Run the skill execution
   */
  private async runSkillExecution(
    session: ClaudeSkillSession,
    request: ClaudeSkillRequest
  ): Promise<void> {
    const { sessionId, emitter, output } = session;

    try {
      // Emit start status
      const startMsg = `[Claude Skill Execution]\n`;
      output.push(startMsg);
      emitter.emit('data', startMsg);

      // Parse the skill file
      emitter.emit('data', `Loading skill file: ${request.skillFilePath}\n`);

      let parsedSkill;
      try {
        parsedSkill = parseSkillFile(request.skillFilePath, this.projectRoot);
      } catch (parseError: any) {
        throw new Error(`Failed to parse skill file: ${parseError.message}`);
      }

      emitter.emit('data', `Skill: ${parsedSkill.name}\n`);
      if (parsedSkill.description) {
        emitter.emit('data', `Description: ${parsedSkill.description}\n`);
      }
      emitter.emit('data', `---\n\n`);

      // Get the LLM provider
      const llmProvider = getLLMProvider();

      // Check availability
      const status = await llmProvider.checkAvailability();
      if (!status.available) {
        throw new Error(`LLM not available: ${status.error}`);
      }

      emitter.emit('data', `Using provider: ${status.provider}\n`);
      emitter.emit('data', `Model: ${request.model || parsedSkill.model || 'sonnet'}\n`);
      emitter.emit('data', `---\n\n`);

      // Execute the skill
      emitter.emit('data', `User prompt: ${request.userPrompt}\n`);
      emitter.emit('data', `---\n\n`);
      emitter.emit('data', `Executing skill...\n\n`);

      const response = await llmProvider.execute({
        prompt: request.userPrompt,
        systemPrompt: parsedSkill.content,
        model: request.model || parsedSkill.model || 'sonnet',
        timeout: request.timeout || 120000,
        purpose: 'generic-llm-call',
        metadata: {
          skillName: parsedSkill.name,
          skillFilePath: request.skillFilePath,
        },
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM execution failed');
      }

      // Emit the response
      emitter.emit('data', `\n--- Response ---\n\n`);
      emitter.emit('data', response.content || '(empty response)');
      emitter.emit('data', `\n\n`);

      // Emit usage info
      if (response.usage) {
        emitter.emit('data', `---\n`);
        emitter.emit('data', `Tokens: ${response.usage.inputTokens} in, ${response.usage.outputTokens} out\n`);
      }
      if (response.durationMs) {
        emitter.emit('data', `Duration: ${response.durationMs}ms\n`);
      }

      // Mark as completed
      session.status = 'completed';
      emitter.emit('status', { status: 'completed', exitCode: 0 });
      emitter.emit('end', { exitCode: 0 });

    } catch (error: any) {
      // Handle errors
      const errorMsg = `\n[Error] ${error.message}\n`;
      output.push(errorMsg);
      emitter.emit('data', errorMsg);

      session.status = 'failed';
      emitter.emit('status', { status: 'failed', exitCode: 1 });
      emitter.emit('end', { exitCode: 1 });
    }

    // Clean up session after delay
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 30000); // Keep for 30 seconds for late-connecting clients
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ClaudeSkillSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Kill a running session
   */
  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.status === 'running') {
      session.status = 'failed';
      session.emitter.emit('data', '\n[Session killed by user]\n');
      session.emitter.emit('status', { status: 'killed', exitCode: -1 });
      session.emitter.emit('end', { exitCode: -1 });
    }

    return true;
  }

  /**
   * Get available skill files
   */
  getSkillFiles(): SkillFileInfo[] {
    const skillsDir = getDefaultSkillsDir(this.projectRoot);
    return discoverSkillFiles(skillsDir, this.projectRoot);
  }

  /**
   * Get the project root path
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: ClaudeSkillService | null = null;

export function getClaudeSkillService(): ClaudeSkillService {
  if (!instance) {
    instance = new ClaudeSkillService();
  }
  return instance;
}

export { ClaudeSkillService };
