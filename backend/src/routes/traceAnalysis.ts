import { Router } from 'express';
import * as traceAnalysisController from '../controllers/traceAnalysisController';

/**
 * Trace Analysis Routes
 * /api/trace-analysis/*
 *
 * Session-level analysis: transcript, intent classification, tool sequence mapping.
 */

const router = Router();

// GET /api/trace-analysis/monitoring-results - Filtered monitoring results
router.get('/monitoring-results', traceAnalysisController.getMonitoringResults);

// GET /api/trace-analysis/call-lookup/:id - Lookup call by any ID
router.get('/call-lookup/:id', traceAnalysisController.callLookup);

// GET /api/trace-analysis/:sessionId - Full session analysis
router.get('/:sessionId', traceAnalysisController.analyzeSession);

// GET /api/trace-analysis/:sessionId/intent - Intent classification only
router.get('/:sessionId/intent', traceAnalysisController.getIntent);

// GET /api/trace-analysis/:sessionId/verify - Fulfillment verification
router.get('/:sessionId/verify', traceAnalysisController.verifySession);

// GET /api/trace-analysis/:sessionId/investigate - Booking false positive investigation
router.get('/:sessionId/investigate', traceAnalysisController.investigateSession);

// GET /api/trace-analysis/:sessionId/investigate/report - Full markdown investigation report
router.get('/:sessionId/investigate/report', traceAnalysisController.getInvestigationReport);

// Booking correction endpoints
router.post('/:sessionId/correction/check-slot', traceAnalysisController.checkSlotAvailability);
router.post('/:sessionId/correction/book', traceAnalysisController.bookCorrection);
router.post('/:sessionId/correction/cancel', traceAnalysisController.cancelCorrection);
router.post('/:sessionId/correction/reschedule', traceAnalysisController.rescheduleCorrection);
router.get('/:sessionId/correction/history', traceAnalysisController.getCorrectionHistory);

export default router;
