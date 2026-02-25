import dotenv from 'dotenv';
import app from './app';
import logger from './utils/logger';
import { getDatabase } from './config/database';
import { seedMasterAdmin } from './services/authService';
import { initializeTestRunCleanup, stopPeriodicCleanup } from './services/testRunCleanupService';
import { startCacheRefreshScheduler, stopCacheRefreshScheduler } from './services/cacheRefreshScheduler';
import { run as runMultiTenancyMigration } from './database/migrations/001_add_multi_tenancy';
import { run as runTenantUniqueConstraintsMigration } from './database/migrations/002_tenant_unique_constraints';
import { run as runTenantTabsMigration } from './database/migrations/003_add_tenant_tabs';
import { run as runDominosIntegrationMigration } from './database/migrations/004_add_dominos_integration';
import { run as runDominosOrderTablesMigration } from './database/migrations/005_add_dominos_order_tables';
import { run as runDominosDataSourceMigration } from './database/migrations/006_add_dominos_data_source';
import { run as runPromptMultiTenancyMigration } from './database/migrations/007_prompt_multi_tenancy';
import { run as runTenantSkillsMigration } from './database/migrations/008_tenant_skills';
import { run as runFabricWorkflowMigration } from './database/migrations/009_fabric_workflow';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize database connection
try {
  getDatabase();
  logger.info('Database initialized successfully');
} catch (error) {
  logger.error('Failed to initialize database', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

// Run multi-tenancy migration (idempotent)
try {
  runMultiTenancyMigration(getDatabase());
  runTenantUniqueConstraintsMigration(getDatabase());
  runTenantTabsMigration(getDatabase());
  runDominosIntegrationMigration(getDatabase());
  runDominosOrderTablesMigration(getDatabase());
  runDominosDataSourceMigration(getDatabase());
  runPromptMultiTenancyMigration(getDatabase());
  runTenantSkillsMigration(getDatabase());
  runFabricWorkflowMigration(getDatabase());
  logger.info('Multi-tenancy migration check completed');
} catch (error) {
  logger.error('Failed to run multi-tenancy migration', {
    error: error instanceof Error ? error.message : String(error),
  });
}

// Seed master admin account
seedMasterAdmin().catch((error) => {
  logger.error('Failed to seed master admin', {
    error: error instanceof Error ? error.message : String(error),
  });
});

// Start server
const server = app.listen(Number(PORT), HOST, () => {
  logger.info(`Server started successfully`, {
    host: HOST,
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
  });

  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   Cloud 9 Ortho CRM API Server                ║
║                                               ║
║   Host: ${HOST}                              ║
║   Port: ${PORT}                                   ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║                                               ║
║   Local:   http://localhost:${PORT}/api         ║
║   Network: http://<your-ip>:${PORT}/api         ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);

  // Initialize test run cleanup service (marks abandoned runs & starts periodic cleanup)
  initializeTestRunCleanup();

  // Start cache refresh scheduler (backup for Node-RED cron)
  startCacheRefreshScheduler();
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop the test run cleanup service
  stopPeriodicCleanup();

  // Stop the cache refresh scheduler
  stopCacheRefreshScheduler();

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
  });

  // Exit process (let process manager restart it)
  process.exit(1);
});

export default server;
