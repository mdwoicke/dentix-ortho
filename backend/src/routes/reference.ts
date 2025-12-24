import { Router } from 'express';
import * as referenceController from '../controllers/referenceController';

/**
 * Reference Data Routes
 * /api/reference/*
 */

const router = Router();

// GET /api/reference/locations
router.get('/locations', referenceController.getLocations);

// GET /api/reference/appointment-types
router.get('/appointment-types', referenceController.getAppointmentTypes);

// GET /api/reference/providers
router.get('/providers', referenceController.getProviders);

// POST /api/reference/refresh
router.post('/refresh', referenceController.refreshAllCaches);

// GET /api/reference/cache/stats
router.get('/cache/stats', referenceController.getCacheStats);

export default router;
