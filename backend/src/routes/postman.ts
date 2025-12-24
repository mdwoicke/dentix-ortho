import { Router } from 'express';
import * as postmanController from '../controllers/postmanController';

/**
 * Postman Routes
 * /api/postman/*
 */

const router = Router();

// POST /api/postman/generate
router.post('/generate', postmanController.generate);

export default router;
