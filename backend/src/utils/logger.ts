import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * Winston Logger Configuration
 * Provides structured logging with different levels and transports
 */

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(
    ({ timestamp, level, message, stack, ...metadata }) => {
      let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;

      // Add stack trace for errors
      if (stack) {
        msg += `\n${stack}`;
      }

      // Add metadata if present
      if (Object.keys(metadata).length > 0) {
        msg += `\n${JSON.stringify(metadata, null, 2)}`;
      }

      return msg;
    }
  )
);

// Define transports
const transports: winston.transport[] = [
  // Console transport for development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    ),
  }),

  // File transport for all logs
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: logFormat,
  }),

  // File transport for errors only
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: logFormat,
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports,
  exitOnError: false,
});

// Suppress console logging in test environment
if (process.env.NODE_ENV === 'test') {
  logger.remove(winston.transports.Console);
}

/**
 * Helper functions for common logging scenarios
 */

export const loggers = {
  /**
   * Log Cloud 9 API request
   */
  cloud9Request: (procedure: string, environment: string, params?: any) => {
    logger.info('Cloud 9 API Request', {
      procedure,
      environment,
      params: params ? JSON.stringify(params) : undefined,
    });
  },

  /**
   * Log Cloud 9 API response
   */
  cloud9Response: (
    procedure: string,
    status: string,
    recordCount: number,
    error?: string
  ) => {
    if (error) {
      logger.error('Cloud 9 API Error', {
        procedure,
        status,
        error,
      });
    } else {
      logger.info('Cloud 9 API Response', {
        procedure,
        status,
        recordCount,
      });
    }
  },

  /**
   * Log cache hit
   */
  cacheHit: (key: string, source: string) => {
    logger.debug('Cache Hit', { key, source });
  },

  /**
   * Log cache miss
   */
  cacheMiss: (key: string, source: string) => {
    logger.debug('Cache Miss', { key, source });
  },

  /**
   * Log cache refresh
   */
  cacheRefresh: (key: string, ttl: number) => {
    logger.info('Cache Refresh', { key, ttl });
  },

  /**
   * Log database operation
   */
  dbOperation: (operation: string, table: string, details?: any) => {
    logger.debug('Database Operation', {
      operation,
      table,
      details: details ? JSON.stringify(details) : undefined,
    });
  },

  /**
   * Log HTTP request
   */
  httpRequest: (method: string, path: string, ip?: string) => {
    logger.info('HTTP Request', {
      method,
      path,
      ip,
    });
  },

  /**
   * Log HTTP response
   */
  httpResponse: (method: string, path: string, statusCode: number, duration: number) => {
    logger.info('HTTP Response', {
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
    });
  },
};

export default logger;
