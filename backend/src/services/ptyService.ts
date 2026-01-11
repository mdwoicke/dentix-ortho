/**
 * PTY Service
 * Provides pseudo-terminal execution for commands that require interactive terminal
 * This allows Claude CLI to use subscription auth instead of API credits
 *
 * Features:
 * - ANSI escape code stripping for clean output
 * - Smart exit detection for Claude plugins
 * - Auto-exit after plugin completion
 */

import { EventEmitter } from 'events';
import * as os from 'os';

// Dynamic import for node-pty (native module)
let pty: typeof import('node-pty') | null = null;
let stripAnsi: ((str: string) => string) | null = null;

async function loadPty() {
  if (!pty) {
    try {
      pty = await import('node-pty');
    } catch (error) {
      console.error('[PTY] Failed to load node-pty:', error);
      throw new Error('node-pty is not available');
    }
  }
  return pty;
}

async function loadStripAnsi() {
  if (!stripAnsi) {
    try {
      const module = await import('strip-ansi');
      stripAnsi = module.default;
    } catch (error) {
      console.error('[PTY] Failed to load strip-ansi:', error);
      // Fallback: basic ANSI stripping
      stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    }
  }
  return stripAnsi;
}

export interface PTYExecuteOptions {
  /** Strip ANSI escape codes from output */
  stripAnsi?: boolean;
  /** Auto-exit Claude after plugin completes */
  autoExit?: boolean;
  /** Timeout in ms to auto-exit after detecting completion */
  autoExitDelay?: number;
  /** Working directory */
  workDir?: string;
}

interface PTYSession {
  id: string;
  ptyProcess: import('node-pty').IPty;
  emitter: EventEmitter;
  outputBuffer: string[];
  rawOutputBuffer: string[];
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  exitCode?: number;
  options: PTYExecuteOptions;
  completionDetected: boolean;
  lastOutput: string;
}

// Patterns that indicate Claude plugin completion
const COMPLETION_PATTERNS = [
  /⎿\s+.*completed/i,
  /⎿\s+.*done/i,
  /⎿\s+.*finished/i,
  /⎿\s+.*created/i,
  /⎿\s+.*updated/i,
  /⎿\s+.*saved/i,
  /⎿\s+.*committed/i,
  /⎿\s+No .* found/i,
  /Help dialog dismissed/i,
  /Nothing to commit/i,
  /Already up to date/i,
];

// Patterns that indicate Claude is waiting for input (prompt ready)
// Note: Currently unused but kept for future interactive mode support
// const PROMPT_PATTERNS = [
//   /❯\s*$/,
//   />\s*$/,
// ];

class PTYService {
  private sessions: Map<string, PTYSession> = new Map();
  private maxBufferSize = 1000;

  /**
   * Execute a command in a pseudo-terminal
   */
  async execute(
    command: string,
    options: PTYExecuteOptions = {}
  ): Promise<{ sessionId: string }> {
    const nodePty = await loadPty();
    const stripAnsiFn = await loadStripAnsi();

    const {
      stripAnsi: shouldStripAnsi = true,
      autoExit = true,
      autoExitDelay = 2000,
      workDir,
    } = options;

    const sessionId = crypto.randomUUID();
    const emitter = new EventEmitter();
    const outputBuffer: string[] = [];
    const rawOutputBuffer: string[] = [];

    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
    const shellArgs = isWindows ? [] : ['-l'];
    const cwd = workDir || process.cwd();

    console.log(`[PTY] Starting session ${sessionId}`);
    console.log(`[PTY] Shell: ${shell}, CWD: ${cwd}`);
    console.log(`[PTY] Command: ${command}`);
    console.log(`[PTY] Options: stripAnsi=${shouldStripAnsi}, autoExit=${autoExit}`);

    const ptyProcess = nodePty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1',
        LANG: 'en_US.UTF-8',
      },
    });

    const session: PTYSession = {
      id: sessionId,
      ptyProcess,
      emitter,
      outputBuffer,
      rawOutputBuffer,
      status: 'running',
      startedAt: new Date(),
      options: { stripAnsi: shouldStripAnsi, autoExit, autoExitDelay, workDir },
      completionDetected: false,
      lastOutput: '',
    };

    this.sessions.set(sessionId, session);

    let autoExitTimer: NodeJS.Timeout | null = null;
    let accumulatedOutput = '';

    ptyProcess.onData((data: string) => {
      // Store raw output
      if (rawOutputBuffer.length < this.maxBufferSize) {
        rawOutputBuffer.push(data);
      }

      // Accumulate for pattern matching
      accumulatedOutput += data;
      // Keep only last 2000 chars for pattern matching
      if (accumulatedOutput.length > 2000) {
        accumulatedOutput = accumulatedOutput.slice(-2000);
      }

      // Process output
      let processedData = data;
      if (shouldStripAnsi && stripAnsiFn) {
        processedData = stripAnsiFn(data);
        // Clean up common terminal artifacts
        processedData = this.cleanTerminalOutput(processedData);
      }

      // Only emit non-empty processed data
      if (processedData.trim()) {
        if (outputBuffer.length < this.maxBufferSize) {
          outputBuffer.push(processedData);
        }
        emitter.emit('data', processedData);
        session.lastOutput = processedData;
      }

      // Check for completion patterns
      if (autoExit && !session.completionDetected) {
        const cleanAccumulated = stripAnsiFn ? stripAnsiFn(accumulatedOutput) : accumulatedOutput;

        for (const pattern of COMPLETION_PATTERNS) {
          if (pattern.test(cleanAccumulated)) {
            console.log(`[PTY] Completion pattern detected: ${pattern}`);
            session.completionDetected = true;

            // Wait for prompt, then exit
            autoExitTimer = setTimeout(() => {
              if (session.status === 'running') {
                console.log(`[PTY] Auto-exiting session ${sessionId}`);
                emitter.emit('data', '\n[Auto-exit: Plugin completed]\n');
                // Send /exit command to Claude
                ptyProcess.write('/exit\r');
                // Give it time to exit, then force kill
                setTimeout(() => {
                  if (session.status === 'running') {
                    ptyProcess.write('\x03'); // Ctrl+C
                    setTimeout(() => {
                      if (session.status === 'running') {
                        ptyProcess.kill();
                      }
                    }, 1000);
                  }
                }, 2000);
              }
            }, autoExitDelay);
            break;
          }
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[PTY] Session ${sessionId} exited with code ${exitCode}`);

      if (autoExitTimer) {
        clearTimeout(autoExitTimer);
      }

      session.status = exitCode === 0 ? 'completed' : 'failed';
      session.exitCode = exitCode;

      emitter.emit('status', { status: session.status, exitCode });
      emitter.emit('end', { exitCode });

      setTimeout(() => {
        this.sessions.delete(sessionId);
      }, 60000);
    });

    // Send command after shell is ready
    setTimeout(() => {
      ptyProcess.write(command + '\r');
    }, 500);

    return { sessionId };
  }

  /**
   * Clean terminal output by removing common artifacts
   */
  private cleanTerminalOutput(text: string): string {
    return text
      // Remove cursor positioning sequences that weren't caught
      .replace(/\[\?[\d;]*[a-zA-Z]/g, '')
      .replace(/\[\d*[A-Za-z]/g, '')
      // Remove OSC sequences (window titles, etc.)
      .replace(/\][\d;]*[^\x07]*\x07/g, '')
      // Remove other control sequences
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Clean up excessive whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove lines that are just whitespace
      .split('\n')
      .filter(line => line.trim() || line === '')
      .join('\n');
  }

  /**
   * Send input to a PTY session
   */
  sendInput(sessionId: string, input: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') {
      return false;
    }
    session.ptyProcess.write(input);
    return true;
  }

  /**
   * Send a keypress (like Ctrl+C)
   */
  sendKey(sessionId: string, key: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') {
      return false;
    }

    const keyMap: Record<string, string> = {
      'ctrl+c': '\x03',
      'ctrl+d': '\x04',
      'ctrl+z': '\x1a',
      'enter': '\r',
      'tab': '\t',
      'escape': '\x1b',
    };

    const keyCode = keyMap[key.toLowerCase()] || key;
    session.ptyProcess.write(keyCode);
    return true;
  }

  /**
   * Resize PTY terminal
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') {
      return false;
    }
    session.ptyProcess.resize(cols, rows);
    return true;
  }

  /**
   * Kill a PTY session
   */
  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      session.ptyProcess.kill();
      session.status = 'failed';
      session.exitCode = -1;
      session.emitter.emit('status', { status: 'failed', exitCode: -1 });
      session.emitter.emit('end', { exitCode: -1 });
      return true;
    } catch (error) {
      console.error(`[PTY] Error killing session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get session data for streaming
   */
  getSessionData(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      session: {
        id: session.id,
        targetId: 'pty',
        command: 'pty-session',
        status: session.status,
        startedAt: session.startedAt,
        exitCode: session.exitCode,
      },
      emitter: session.emitter,
      outputBuffer: session.outputBuffer,
      isComplete: session.status !== 'running',
    };
  }

  /**
   * Get all active PTY sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'running')
      .map(s => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt,
        completionDetected: s.completionDetected,
      }));
  }
}

export const ptyService = new PTYService();
