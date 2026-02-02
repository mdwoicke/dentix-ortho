import { Router } from 'express';
import * as traceAnalysisController from '../controllers/traceAnalysisController';

/**
 * Trace Analysis Routes
 * /api/trace-analysis/*
 *
 * Session-level analysis: transcript, intent classification, tool sequence mapping.
 */

const router = Router();

// GET /api/trace-analysis/:sessionId - Full session analysis
router.get('/:sessionId', traceAnalysisController.analyzeSession);

// GET /api/trace-analysis/:sessionId/intent - Intent classification only
router.get('/:sessionId/intent', traceAnalysisController.getIntent);

export default router;
