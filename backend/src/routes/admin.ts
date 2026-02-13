import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import * as tenantController from '../controllers/tenantController';

/**
 * Admin Routes
 * /api/admin/*
 */

const router = Router();

// ---- User Management ----

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

// ---- Tenant Management ----

// POST /api/admin/tenants/test-cloud9 (must be before :id routes)
router.post('/tenants/test-cloud9', tenantController.testCloud9Connection);

// GET /api/admin/tenants
router.get('/tenants', tenantController.getTenants);

// GET /api/admin/tenants/:id
router.get('/tenants/:id', tenantController.getTenant);

// POST /api/admin/tenants
router.post('/tenants', tenantController.createTenant);

// PUT /api/admin/tenants/:id
router.put('/tenants/:id', tenantController.updateTenant);

// DELETE /api/admin/tenants/:id
router.delete('/tenants/:id', tenantController.deleteTenant);

// GET /api/admin/tenants/:id/tabs
router.get('/tenants/:id/tabs', tenantController.getTenantTabs);

// PUT /api/admin/tenants/:id/tabs
router.put('/tenants/:id/tabs', tenantController.setTenantTabs);

// GET /api/admin/tenants/:id/users
router.get('/tenants/:id/users', tenantController.getTenantUsers);

// POST /api/admin/tenants/:id/users
router.post('/tenants/:id/users', tenantController.addTenantUser);

// DELETE /api/admin/tenants/:id/users/:userId
router.delete('/tenants/:id/users/:userId', tenantController.removeTenantUser);

export default router;
