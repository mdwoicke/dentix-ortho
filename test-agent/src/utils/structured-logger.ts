/**
 * Structured Logger
 *
 * Provides JSON Lines formatted logging for machine-parseable output.
 * Supports multiple log levels, contexts, and optional console output.
 *
 * Benefits:
 * - Faster parsing in backend (JSON.parse vs regex)
 * - Consistent log format across all components
 * - Easy integration with log aggregation systems
 * - Maintains human-readable console output option
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  message?: string;
  data?: Record<string, any>;
  context?: LogContext;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LogContext {
  runId?: string;
  testId?: string;
  testName?: string;
  workerId?: number;
  sessionId?: string;
  traceId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  jsonOutput: boolean;     // Output JSON lines format
  consoleOutput: boolean;  // Also output human-readable format
  timestamps: boolean;     // Include timestamps in console output
  colors: boolean;         // Use ANSI colors in console output
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  jsonOutput: true,
  consoleOutput: true,
  timestamps: true,
  colors: true,
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // Gray
  info: '\x1b[36m',   // Cyan
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
};

const RESET_COLOR = '\x1b[0m';

export class StructuredLogger {
  private config: LoggerConfig;
  private context: LogContext = {};

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set context that will be included in all log entries
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear current context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const child = new StructuredLogger(this.config);
    child.context = { ...this.context, ...context };
    return child;
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, event: string, options: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event' | 'context'>> = {}): void {
    // Check log level
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...options,
      context: { ...this.context, ...options.data },
    };

    // Remove context from data if it was merged
    if (entry.data && entry.context) {
      const contextKeys = Object.keys(this.context);
      for (const key of contextKeys) {
        if (key in entry.data) {
          delete (entry.data as any)[key];
        }
      }
      if (Object.keys(entry.data).length === 0) {
        delete entry.data;
      }
    }

    // JSON output
    if (this.config.jsonOutput) {
      console.log(JSON.stringify(entry));
    }

    // Human-readable console output
    if (this.config.consoleOutput && !this.config.jsonOutput) {
      this.printConsole(entry);
    }
  }

  /**
   * Print human-readable console output
   */
  private printConsole(entry: LogEntry): void {
    const parts: string[] = [];

    // Timestamp
    if (this.config.timestamps) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      parts.push(`[${time}]`);
    }

    // Level with color
    const levelStr = entry.level.toUpperCase().padEnd(5);
    if (this.config.colors) {
      parts.push(`${LEVEL_COLORS[entry.level]}${levelStr}${RESET_COLOR}`);
    } else {
      parts.push(levelStr);
    }

    // Context prefix
    if (entry.context?.workerId !== undefined) {
      parts.push(`[W${entry.context.workerId}]`);
    }
    if (entry.context?.testId) {
      parts.push(`[${entry.context.testId}]`);
    }

    // Event and message
    parts.push(entry.event);
    if (entry.message) {
      parts.push(`- ${entry.message}`);
    }

    // Duration
    if (entry.duration !== undefined) {
      parts.push(`(${entry.duration}ms)`);
    }

    // Data summary
    if (entry.data && Object.keys(entry.data).length > 0) {
      const summary = Object.entries(entry.data)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ');
      parts.push(`{${summary}}`);
    }

    console.log(parts.join(' '));

    // Error stack
    if (entry.error?.stack && entry.level === 'error') {
      console.error(entry.error.stack);
    }
  }

  // Convenience methods
  debug(event: string, options?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event' | 'context'>>): void {
    this.log('debug', event, options);
  }

  info(event: string, options?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event' | 'context'>>): void {
    this.log('info', event, options);
  }

  warn(event: string, options?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event' | 'context'>>): void {
    this.log('warn', event, options);
  }

  error(event: string, err?: Error | string, options?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'event' | 'context'>>): void {
    const errorInfo = err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : err
        ? { name: 'Error', message: err }
        : undefined;

    this.log('error', event, { ...options, error: errorInfo });
  }

  // Structured event methods for common test agent events
  testStarted(testId: string, testName: string, data?: Record<string, any>): void {
    this.info('test_started', {
      message: testName,
      data: { testId, testName, ...data },
    });
  }

  testCompleted(testId: string, status: 'passed' | 'failed' | 'error', durationMs: number, data?: Record<string, any>): void {
    const level = status === 'passed' ? 'info' : 'warn';
    this.log(level, 'test_completed', {
      message: `${status.toUpperCase()}`,
      duration: durationMs,
      data: { testId, status, ...data },
    });
  }

  workerStarted(workerId: number, sessionId: string): void {
    this.info('worker_started', {
      data: { workerId, sessionId },
    });
  }

  workerCompleted(workerId: number, testsRun: number): void {
    this.info('worker_completed', {
      data: { workerId, testsRun },
    });
  }

  apiCall(method: string, url: string, durationMs: number, status: number): void {
    const level = status >= 400 ? 'warn' : 'debug';
    this.log(level, 'api_call', {
      duration: durationMs,
      data: { method, url, status },
    });
  }

  runStarted(runId: string, totalTests: number, concurrency: number): void {
    this.info('run_started', {
      data: { runId, totalTests, concurrency },
    });
  }

  runCompleted(runId: string, passed: number, failed: number, durationMs: number): void {
    const level = failed > 0 ? 'warn' : 'info';
    this.log(level, 'run_completed', {
      duration: durationMs,
      data: { runId, passed, failed, total: passed + failed },
    });
  }

  concurrencyChanged(previous: number, current: number, avgLatency: number): void {
    this.info('concurrency_changed', {
      data: { previous, current, avgLatency },
    });
  }
}

// Singleton instance
let sharedLogger: StructuredLogger | null = null;

export function getLogger(config?: Partial<LoggerConfig>): StructuredLogger {
  if (!sharedLogger) {
    sharedLogger = new StructuredLogger(config);
  }
  return sharedLogger;
}

export function configureLogger(config: Partial<LoggerConfig>): void {
  sharedLogger = new StructuredLogger(config);
}

// Export default instance for convenience
export default getLogger();
