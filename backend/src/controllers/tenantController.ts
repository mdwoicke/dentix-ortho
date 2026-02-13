import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { TenantModel } from '../models/Tenant';
import { TenantTabModel } from '../models/TenantTab';
import { ALL_TAB_KEYS } from '../database/migrations/003_add_tenant_tabs';
import { verifyToken } from '../services/authService';

/**
 * Tenant Controller
 * Handles tenant CRUD and user-tenant association endpoints
 */

function requireAdmin(req: Request): number {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    throw new AppError('Invalid or expired token', 401);
  }

  if (!payload.isAdmin) {
    throw new AppError('Admin access required', 403);
  }

  return payload.userId;
}

/**
 * GET /api/admin/tenants
 */
export const getTenants = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);
  const tenants = TenantModel.getAll();

  res.json({
    status: 'success',
    data: { tenants }
  });
});

/**
 * GET /api/admin/tenants/:id
 */
export const getTenant = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);
  if (isNaN(id)) throw new AppError('Invalid tenant ID', 400);

  const tenant = TenantModel.getById(id);
  if (!tenant) throw new AppError('Tenant not found', 404);

  res.json({
    status: 'success',
    data: { tenant }
  });
});

/**
 * POST /api/admin/tenants
 */
export const createTenant = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireAdmin(req);

  const { slug, name } = req.body;
  if (!slug || !name) {
    throw new AppError('Slug and name are required', 400);
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new AppError('Slug must be lowercase alphanumeric with hyphens only', 400);
  }

  // Check for duplicate slug
  if (TenantModel.getBySlug(slug)) {
    throw new AppError('A tenant with this slug already exists', 400);
  }

  const tenantId = TenantModel.create(req.body);

  // Auto-assign current user as owner
  TenantModel.addUserToTenant(userId, tenantId, 'owner');

  // Assign additional users if provided
  const { users, tabKeys } = req.body;
  if (users && Array.isArray(users)) {
    for (const u of users) {
      if (u.userId && u.userId !== userId) {
        TenantModel.addUserToTenant(u.userId, tenantId, u.role || 'member');
      }
    }
  }

  // Enable selected tabs (defaults to none if not provided)
  if (tabKeys && Array.isArray(tabKeys)) {
    const validKeys = tabKeys.filter((k: string) => (ALL_TAB_KEYS as readonly string[]).includes(k));
    TenantTabModel.setTabs(tenantId, validKeys);
  }

  // Create per-tenant directories and copy default V1 files
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const v1Dir = path.join(projectRoot, 'tenants', slug, 'v1');
  const noderedDir = path.join(projectRoot, 'tenants', slug, 'nodered');

  try {
    fs.mkdirSync(v1Dir, { recursive: true });
    fs.mkdirSync(noderedDir, { recursive: true });

    // Copy canonical V1 files from docs/v1/
    const defaultV1Dir = path.join(projectRoot, 'docs', 'v1');
    const filesToCopy = [
      'Chord_Cloud9_SystemPrompt.md',
      'system_prompt_escaped.md',
      'nodered_Cloud9_flows.json',
      'chord_dso_patient_Tool.json',
      'patient_tool_func.js',
      'schedule_appointment_dso_Tool.json',
      'scheduling_tool_func.js',
    ];

    for (const file of filesToCopy) {
      const src = path.join(defaultV1Dir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(v1Dir, file));
      }
    }

    // Also copy the main Node-RED flow to the nodered dir
    const noderedFlowSrc = path.join(projectRoot, 'nodered', 'nodered_Cloud9_flows.json');
    if (fs.existsSync(noderedFlowSrc)) {
      fs.copyFileSync(noderedFlowSrc, path.join(noderedDir, 'nodered_Cloud9_flows.json'));
    }

    // Update tenant with directory paths
    TenantModel.update(tenantId, {
      v1_files_dir: `tenants/${slug}/v1`,
      nodered_flows_dir: `tenants/${slug}/nodered`,
    });
  } catch (dirErr) {
    // Non-fatal: log but don't fail tenant creation
    console.warn(`Warning: Failed to create tenant directories for ${slug}:`, (dirErr as Error).message);
  }

  const tenant = TenantModel.getById(tenantId);

  res.status(201).json({
    status: 'success',
    message: 'Tenant created successfully',
    data: { tenant }
  });
});

/**
 * PUT /api/admin/tenants/:id
 */
export const updateTenant = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);
  if (isNaN(id)) throw new AppError('Invalid tenant ID', 400);

  const existing = TenantModel.getById(id);
  if (!existing) throw new AppError('Tenant not found', 404);

  TenantModel.update(id, req.body);
  const tenant = TenantModel.getById(id);

  res.json({
    status: 'success',
    message: 'Tenant updated successfully',
    data: { tenant }
  });
});

/**
 * DELETE /api/admin/tenants/:id
 * Soft-delete (sets is_active = 0)
 */
export const deleteTenant = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);
  if (isNaN(id)) throw new AppError('Invalid tenant ID', 400);

  const tenant = TenantModel.getById(id);
  if (!tenant) throw new AppError('Tenant not found', 404);

  try {
    TenantModel.softDelete(id);
  } catch (error) {
    if ((error as Error).message.includes('default tenant')) {
      throw new AppError('Cannot delete the default tenant', 403);
    }
    throw error;
  }

  res.json({
    status: 'success',
    message: 'Tenant deactivated successfully'
  });
});

/**
 * GET /api/admin/tenants/:id/users
 */
export const getTenantUsers = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);
  if (isNaN(id)) throw new AppError('Invalid tenant ID', 400);

  const tenant = TenantModel.getById(id);
  if (!tenant) throw new AppError('Tenant not found', 404);

  const users = TenantModel.getTenantUsers(id);

  res.json({
    status: 'success',
    data: { users }
  });
});

/**
 * POST /api/admin/tenants/:id/users
 */
export const addTenantUser = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const tenantId = parseInt(req.params.id);
  if (isNaN(tenantId)) throw new AppError('Invalid tenant ID', 400);

  const { userId, role } = req.body;
  if (!userId) throw new AppError('userId is required', 400);

  const tenant = TenantModel.getById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);

  TenantModel.addUserToTenant(userId, tenantId, role || 'member');

  res.json({
    status: 'success',
    message: 'User added to tenant'
  });
});

/**
 * DELETE /api/admin/tenants/:id/users/:userId
 */
export const removeTenantUser = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const tenantId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);

  if (isNaN(tenantId) || isNaN(userId)) {
    throw new AppError('Invalid tenant or user ID', 400);
  }

  try {
    TenantModel.removeUserFromTenant(userId, tenantId);
  } catch (error) {
    if ((error as Error).message.includes('only tenant')) {
      throw new AppError('Cannot remove user from their only tenant', 400);
    }
    throw error;
  }

  res.json({
    status: 'success',
    message: 'User removed from tenant'
  });
});

/**
 * GET /api/admin/tenants/:id/tabs
 * Get enabled tabs for a tenant
 */
export const getTenantTabs = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);
  if (isNaN(id)) throw new AppError('Invalid tenant ID', 400);

  const tenant = TenantModel.getById(id);
  if (!tenant) throw new AppError('Tenant not found', 404);

  const enabledTabs = TenantTabModel.getEnabledTabs(id);

  res.json({
    status: 'success',
    data: { enabledTabs }
  });
});

/**
 * PUT /api/admin/tenants/:id/tabs
 * Set enabled tabs for a tenant
 */
export const setTenantTabs = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const id = parseInt(req.params.id);
  if (isNaN(id)) throw new AppError('Invalid tenant ID', 400);

  const tenant = TenantModel.getById(id);
  if (!tenant) throw new AppError('Tenant not found', 404);

  const { tabKeys } = req.body;
  if (!Array.isArray(tabKeys)) {
    throw new AppError('tabKeys must be an array', 400);
  }

  // Validate tab keys
  const validKeys = tabKeys.filter((k: string) => (ALL_TAB_KEYS as readonly string[]).includes(k));
  TenantTabModel.setTabs(id, validKeys);

  res.json({
    status: 'success',
    message: `${validKeys.length} tabs enabled for tenant`,
    data: { enabledTabs: validKeys }
  });
});

/**
 * POST /api/admin/tenants/test-cloud9
 * Test Cloud9 connection with provided credentials
 */
export const testCloud9Connection = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req);

  const { endpoint, clientId, username, password } = req.body;
  if (!endpoint || !clientId || !username || !password) {
    throw new AppError('All Cloud9 connection fields are required', 400);
  }

  // Try a simple GetLocations call
  try {
    const xmlBody = `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${clientId}</ClientID>
    <UserName>${username}</UserName>
    <Password>${password}</Password>
    <Procedure>GetLocations</Procedure>
    <Parameters></Parameters>
</GetDataRequest>`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xmlBody,
    });

    const text = await response.text();
    const success = text.includes('<ResponseStatus>Success</ResponseStatus>');

    res.json({
      status: success ? 'success' : 'error',
      message: success ? 'Cloud9 connection successful' : 'Cloud9 connection failed',
      data: { connected: success }
    });
  } catch (error) {
    res.json({
      status: 'error',
      message: `Connection failed: ${(error as Error).message}`,
      data: { connected: false }
    });
  }
});
