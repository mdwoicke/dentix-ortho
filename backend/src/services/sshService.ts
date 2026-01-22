/**
 * SSH Service
 * Manages SSH connections and command execution for Skills Runner
 * Also supports local execution mode (no SSH required)
 */

import { Client, ClientChannel } from 'ssh2';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { SSHTarget, getSSH2Config, getSSHTarget, loadSSHTargets, saveSSHTargets, maskSSHTarget, SSHTargetsConfig } from '../config/ssh';

export interface SSHSession {
  id: string;
  targetId: string;
  command: string;
  status: 'connecting' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  endedAt?: Date;
  exitCode?: number;
  error?: string;
}

interface ActiveSession {
  session: SSHSession;
  client?: Client;
  channel?: ClientChannel;
  process?: ChildProcess;
  emitter: EventEmitter;
  isLocal: boolean;
  outputBuffer: string[];  // Buffer output for late-connecting clients
  isComplete: boolean;
}

class SSHService {
  private activeSessions: Map<string, ActiveSession> = new Map();

  /**
   * Get all SSH targets (masked for security)
   */
  getTargets(): SSHTarget[] {
    const config = loadSSHTargets();
    return config.targets.map(maskSSHTarget);
  }

  /**
   * Get SSH targets config
   */
  getTargetsConfig(): SSHTargetsConfig {
    const config = loadSSHTargets();
    return {
      ...config,
      targets: config.targets.map(maskSSHTarget)
    };
  }

  /**
   * Add or update an SSH target
   */
  saveTarget(target: SSHTarget): void {
    const config = loadSSHTargets();
    const existingIndex = config.targets.findIndex(t => t.id === target.id);

    if (existingIndex >= 0) {
      // Update existing - preserve password if not provided
      const existing = config.targets[existingIndex];
      if (!target.password && existing.password) {
        target.password = existing.password;
      }
      config.targets[existingIndex] = target;
    } else {
      config.targets.push(target);
    }

    saveSSHTargets(config);
  }

  /**
   * Delete an SSH target
   */
  deleteTarget(targetId: string): boolean {
    const config = loadSSHTargets();
    const initialLength = config.targets.length;
    config.targets = config.targets.filter(t => t.id !== targetId);

    if (config.targets.length < initialLength) {
      if (config.defaultTarget === targetId) {
        config.defaultTarget = config.targets[0]?.id || '';
      }
      saveSSHTargets(config);
      return true;
    }
    return false;
  }

  /**
   * Set the default SSH target
   */
  setDefaultTarget(targetId: string): void {
    const config = loadSSHTargets();
    if (config.targets.some(t => t.id === targetId)) {
      config.defaultTarget = targetId;
      saveSSHTargets(config);
    }
  }

  /**
   * Check if a target is local execution mode
   */
  isLocalTarget(target: SSHTarget): boolean {
    return target.authType === 'local' as SSHTarget['authType'] || target.id === 'local-exec';
  }

  /**
   * Test connection to a target (SSH or local)
   */
  async testConnection(targetId: string): Promise<{ success: boolean; message: string; latency?: number }> {
    const target = getSSHTarget(targetId);
    if (!target) {
      return { success: false, message: `Target not found: ${targetId}` };
    }

    // Local execution - just verify we can spawn a process
    if (this.isLocalTarget(target)) {
      const startTime = Date.now();
      return new Promise((resolve) => {
        const testProc = spawn('echo', ['test'], { shell: true });
        testProc.on('close', (code) => {
          const latency = Date.now() - startTime;
          if (code === 0) {
            resolve({ success: true, message: 'Local execution available', latency });
          } else {
            resolve({ success: false, message: `Local execution test failed with code ${code}` });
          }
        });
        testProc.on('error', (err) => {
          resolve({ success: false, message: `Local execution error: ${err.message}` });
        });
      });
    }

    // SSH connection test
    const client = new Client();
    const startTime = Date.now();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.end();
        resolve({ success: false, message: 'Connection timeout (30s)' });
      }, 30000);

      client.on('ready', () => {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        client.end();
        resolve({ success: true, message: 'Connection successful', latency });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.end();
        resolve({ success: false, message: `Connection error: ${err.message}` });
      });

      try {
        const ssh2Config = getSSH2Config(target);
        client.connect(ssh2Config);
      } catch (err) {
        clearTimeout(timeout);
        resolve({ success: false, message: `Configuration error: ${(err as Error).message}` });
      }
    });
  }

  /**
   * Execute a command locally (no SSH)
   */
  executeLocal(targetId: string, command: string): { sessionId: string; emitter: EventEmitter } {
    const target = getSSHTarget(targetId);
    const sessionId = uuidv4();
    const emitter = new EventEmitter();
    const outputBuffer: string[] = [];

    const session: SSHSession = {
      id: sessionId,
      targetId,
      command,
      status: 'running',
      startedAt: new Date()
    };

    // Determine working directory
    const cwd = target?.workDir || process.cwd();

    // Spawn the process
    const proc = spawn(command, [], {
      shell: true,
      cwd,
      env: { ...process.env }
    });

    const activeSession: ActiveSession = {
      session,
      process: proc,
      emitter,
      isLocal: true,
      outputBuffer,
      isComplete: false
    };

    this.activeSessions.set(sessionId, activeSession);

    // Helper to emit and buffer data
    const emitData = (data: string) => {
      outputBuffer.push(data);
      emitter.emit('data', data);
    };

    // Emit initial status
    emitter.emit('status', { status: 'running' });
    emitData(`\x1b[32m[Local Execution]\x1b[0m\r\n`);
    emitData(`\x1b[90m$ ${command}\x1b[0m\r\n`);
    if (cwd !== process.cwd()) {
      emitData(`\x1b[90m(working directory: ${cwd})\x1b[0m\r\n`);
    }
    emitData('\r\n');

    proc.stdout?.on('data', (data: Buffer) => {
      emitData(data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      emitData(`\x1b[31m${data.toString()}\x1b[0m`);
    });

    proc.on('close', (code) => {
      session.status = code === 0 ? 'completed' : 'failed';
      session.exitCode = code ?? -1;
      session.endedAt = new Date();
      activeSession.isComplete = true;

      emitData(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
      emitter.emit('status', { status: session.status, exitCode: code });
      emitter.emit('end', { exitCode: code });

      // Keep session for 30 seconds so late-connecting clients can get output
      setTimeout(() => {
        this.activeSessions.delete(sessionId);
      }, 30000);
    });

    proc.on('error', (err) => {
      session.status = 'failed';
      session.error = err.message;
      session.endedAt = new Date();
      activeSession.isComplete = true;

      emitData(`\x1b[31mError: ${err.message}\x1b[0m\r\n`);
      emitter.emit('status', { status: 'failed', error: err.message });
      emitter.emit('end', { exitCode: 1, error: err.message });

      // Keep session for 30 seconds
      setTimeout(() => {
        this.activeSessions.delete(sessionId);
      }, 30000);
    });

    return { sessionId, emitter };
  }

  /**
   * Execute a command via SSH or locally
   * Returns session ID and EventEmitter for streaming output
   */
  async execute(targetId: string, command: string): Promise<{ sessionId: string; emitter: EventEmitter }> {
    const target = getSSHTarget(targetId);
    if (!target) {
      throw new Error(`Target not found: ${targetId}`);
    }

    // Use local execution if target is configured for local mode
    if (this.isLocalTarget(target)) {
      return this.executeLocal(targetId, command);
    }

    // SSH execution
    const sessionId = uuidv4();
    const emitter = new EventEmitter();
    const client = new Client();

    const session: SSHSession = {
      id: sessionId,
      targetId,
      command,
      status: 'connecting',
      startedAt: new Date()
    };

    const activeSession: ActiveSession = {
      session,
      client,
      emitter,
      isLocal: false,
      outputBuffer: [],
      isComplete: false
    };

    this.activeSessions.set(sessionId, activeSession);

    // Emit initial status
    emitter.emit('status', { status: 'connecting' });

    client.on('ready', () => {
      session.status = 'running';
      emitter.emit('status', { status: 'running' });
      emitter.emit('data', `\x1b[32m[Connected to ${target.name}]\x1b[0m\r\n`);
      emitter.emit('data', `\x1b[90m$ ${command}\x1b[0m\r\n`);

      client.exec(command, (err, channel) => {
        if (err) {
          session.status = 'failed';
          session.error = err.message;
          session.endedAt = new Date();
          emitter.emit('data', `\x1b[31mError: ${err.message}\x1b[0m\r\n`);
          emitter.emit('status', { status: 'failed', error: err.message });
          emitter.emit('end', { exitCode: 1, error: err.message });
          client.end();
          return;
        }

        activeSession.channel = channel;

        channel.on('data', (data: Buffer) => {
          emitter.emit('data', data.toString());
        });

        channel.stderr.on('data', (data: Buffer) => {
          emitter.emit('data', `\x1b[31m${data.toString()}\x1b[0m`);
        });

        channel.on('close', (code: number) => {
          session.status = code === 0 ? 'completed' : 'failed';
          session.exitCode = code;
          session.endedAt = new Date();

          emitter.emit('data', `\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
          emitter.emit('status', { status: session.status, exitCode: code });
          emitter.emit('end', { exitCode: code });

          client.end();
          this.activeSessions.delete(sessionId);
        });
      });
    });

    client.on('error', (err) => {
      session.status = 'failed';
      session.error = err.message;
      session.endedAt = new Date();

      emitter.emit('data', `\x1b[31mSSH Error: ${err.message}\x1b[0m\r\n`);
      emitter.emit('status', { status: 'failed', error: err.message });
      emitter.emit('end', { exitCode: 1, error: err.message });

      this.activeSessions.delete(sessionId);
    });

    client.on('close', () => {
      if (session.status === 'running' || session.status === 'connecting') {
        session.status = 'cancelled';
        session.endedAt = new Date();
        emitter.emit('status', { status: 'cancelled' });
        emitter.emit('end', { exitCode: -1 });
      }
      this.activeSessions.delete(sessionId);
    });

    try {
      const ssh2Config = getSSH2Config(target);
      client.connect(ssh2Config);
    } catch (err) {
      session.status = 'failed';
      session.error = (err as Error).message;
      session.endedAt = new Date();
      emitter.emit('data', `\x1b[31mConfiguration Error: ${(err as Error).message}\x1b[0m\r\n`);
      emitter.emit('status', { status: 'failed', error: (err as Error).message });
      emitter.emit('end', { exitCode: 1, error: (err as Error).message });
      this.activeSessions.delete(sessionId);
    }

    return { sessionId, emitter };
  }

  /**
   * Send input to a running session
   */
  sendInput(sessionId: string, input: string): boolean {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return false;
    }

    try {
      if (activeSession.isLocal && activeSession.process) {
        activeSession.process.stdin?.write(input);
        return true;
      } else if (activeSession.channel) {
        activeSession.channel.write(input);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Kill a running session
   */
  killSession(sessionId: string): boolean {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return false;
    }

    try {
      activeSession.session.status = 'cancelled';
      activeSession.session.endedAt = new Date();

      if (activeSession.isLocal && activeSession.process) {
        // Kill local process
        activeSession.process.kill('SIGTERM');
      } else {
        // Kill SSH session
        if (activeSession.channel) {
          activeSession.channel.signal('KILL');
        }
        activeSession.client?.end();
      }

      activeSession.emitter.emit('data', '\r\n\x1b[33m[Session killed by user]\x1b[0m\r\n');
      activeSession.emitter.emit('status', { status: 'cancelled' });
      activeSession.emitter.emit('end', { exitCode: -1 });

      this.activeSessions.delete(sessionId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): SSHSession | undefined {
    return this.activeSessions.get(sessionId)?.session;
  }

  /**
   * Get emitter for a session (for reconnecting to stream)
   */
  getSessionEmitter(sessionId: string): EventEmitter | undefined {
    return this.activeSessions.get(sessionId)?.emitter;
  }

  /**
   * Get full session data including buffer and completion status
   */
  getSessionData(sessionId: string): {
    session: SSHSession;
    emitter: EventEmitter;
    outputBuffer: string[];
    isComplete: boolean
  } | undefined {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) return undefined;
    return {
      session: activeSession.session,
      emitter: activeSession.emitter,
      outputBuffer: activeSession.outputBuffer || [],
      isComplete: activeSession.isComplete || false
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SSHSession[] {
    return Array.from(this.activeSessions.values()).map(s => s.session);
  }
}

// Export singleton instance
export const sshService = new SSHService();
