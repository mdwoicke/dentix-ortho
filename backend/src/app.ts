import express, { Application, Request, Response } from 'express';
import corsMiddleware from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { loggers } from './utils/logger';

// Import routes
import referenceRoutes from './routes/reference';
import patientRoutes from './routes/patients';
import appointmentRoutes from './routes/appointments';
import postmanRoutes from './routes/postman';
import testMonitorRoutes from './routes/testMonitor';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import skillsRunnerRoutes from './routes/skillsRunner';

/**
 * Express Application Setup
 */

const app: Application = express();

// ===========================================
// Middleware
// ===========================================

// CORS
app.use(corsMiddleware);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  const startTime = Date.now();

  // Log request
  loggers.httpRequest(req.method, req.path, req.ip);

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    loggers.httpResponse(req.method, req.path, res.statusCode, duration);
  });

  next();
});

// ===========================================
// Routes
// ===========================================

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/reference', referenceRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/postman', postmanRoutes);
app.use('/api/test-monitor', testMonitorRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/skills-runner', skillsRunnerRoutes);

// ===========================================
// Error Handling
// ===========================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ===========================================
// Exports
// ===========================================

export default app;
