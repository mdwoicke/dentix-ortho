import { Router } from 'express';
import * as heartbeatController from '../controllers/heartbeatController';

/**
 * Heartbeat Alerting Routes
 * /api/heartbeat/*
 */

const router = Router();

// ============================================================================
// HEARTBEAT SERVICE MANAGEMENT
// ============================================================================

// GET /api/heartbeat/status - Get heartbeat service status
router.get('/status', heartbeatController.getStatus);

// POST /api/heartbeat/start - Start the heartbeat service
router.post('/start', heartbeatController.startService);

// POST /api/heartbeat/stop - Stop the heartbeat service
router.post('/stop', heartbeatController.stopService);

// POST /api/heartbeat/reset - Reset singleton (reinitialize with fresh config)
router.post('/reset', heartbeatController.resetService);

// POST /api/heartbeat/run - Trigger manual heartbeat check
router.post('/run', heartbeatController.runManual);

// GET /api/heartbeat/history - Get heartbeat run history
router.get('/history', heartbeatController.getHistory);

// ============================================================================
// ALERT CONFIGURATION
// ============================================================================

// GET /api/heartbeat/alerts - List all alert definitions
router.get('/alerts', heartbeatController.getAlerts);

// GET /api/heartbeat/alerts/history - Get all alert trigger history
router.get('/alerts/history', heartbeatController.getAllAlertHistory);

// POST /api/heartbeat/alerts - Create new alert
router.post('/alerts', heartbeatController.createAlert);

// PUT /api/heartbeat/alerts/:id - Update alert
router.put('/alerts/:id', heartbeatController.updateAlert);

// DELETE /api/heartbeat/alerts/:id - Delete alert
router.delete('/alerts/:id', heartbeatController.deleteAlert);

// POST /api/heartbeat/alerts/:id/toggle - Enable/disable alert
router.post('/alerts/:id/toggle', heartbeatController.toggleAlert);

// GET /api/heartbeat/alerts/:id/history - Get trigger history for alert
router.get('/alerts/:id/history', heartbeatController.getAlertHistory);

// ============================================================================
// SLACK INTEGRATION
// ============================================================================

// GET /api/heartbeat/slack/status - Check Slack connection
router.get('/slack/status', heartbeatController.getSlackStatus);

// POST /api/heartbeat/slack/test - Send test message
router.post('/slack/test', heartbeatController.testSlack);

// PUT /api/heartbeat/slack/config - Update webhook URL
router.put('/slack/config', heartbeatController.updateSlackConfig);

// ============================================================================
// LANGFUSE CONFIG
// ============================================================================

// GET /api/heartbeat/langfuse-configs - Get available Langfuse configs
router.get('/langfuse-configs', heartbeatController.getLangfuseConfigs);

// PUT /api/heartbeat/langfuse-config - Set Langfuse config for monitoring
router.put('/langfuse-config', heartbeatController.setLangfuseConfig);

// ============================================================================
// METRIC UTILITIES
// ============================================================================

// GET /api/heartbeat/metrics - Get available metric types
router.get('/metrics', heartbeatController.getAvailableMetrics);

// GET /api/heartbeat/metrics/:metricType/current - Get current metric value
router.get('/metrics/:metricType/current', heartbeatController.getMetricValue);

export default router;
