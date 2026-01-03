import { Router } from 'express';
import * as authController from '../controllers/authController';

/**
 * Auth Routes
 * /api/auth/*
 */

const router = Router();

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/change-password
router.post('/change-password', authController.changePasswordHandler);

// GET /api/auth/me
router.get('/me', authController.getCurrentUser);

export default router;
