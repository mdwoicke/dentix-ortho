import { Router } from 'express';
import * as adminController from '../controllers/adminController';

/**
 * Admin Routes
 * /api/admin/*
 */

const router = Router();

// GET /api/admin/users
router.get('/users', adminController.getUsers);

// GET /api/admin/users/:id
router.get('/users/:id', adminController.getUser);

// POST /api/admin/users
router.post('/users', adminController.createUser);

// PUT /api/admin/users/:id
router.put('/users/:id', adminController.updateUser);

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminController.deleteUser);

// PUT /api/admin/users/:id/permissions
router.put('/users/:id/permissions', adminController.setUserPermissions);

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', adminController.resetPassword);

export default router;
