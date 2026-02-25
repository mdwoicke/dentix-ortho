import { Request, Response, NextFunction } from 'express';
import { TenantModel, Tenant } from '../models/Tenant';
import { Cloud9Config, Environment } from '../config/cloud9';
import { verifyToken } from '../services/authService';
import logger from '../utils/logger';

/**
 * Tenant Context
 * Resolved from the X-Tenant-Id header (or user's default tenant)
 * and attached to req.tenantContext for use in controllers/services.
 */

export interface TenantContext {
  id: number;
  slug: string;
  name: string;
  cloud9: {
    production: Cloud9Config | null;
    sandbox: Cloud9Config | null;
  };
  nodered: { url: string; username: string; password: string };
  flowise: { url: string; apiKey: string };
  langfuse: { host: string; publicKey: string; secretKey: string };
  dominos: { serviceUrl: string; authToken: string; defaultStoreId: string; dataSourceUrl: string };
  fabricWorkflow: { url: string; username: string; password: string };
  v1FilesDir: string;
  noderedFlowsDir: string;
  colorPrimary: string;
  colorSecondary: string;
  logoUrl: string | null;
}

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

/** Build Cloud9Config only when credentials are actually configured */
function buildCloud9Config(endpoint: string, clientId: string | null, userName: string | null, password: string | null): Cloud9Config | null {
  if (!clientId || !userName || !password) {
    return null;
  }
  return { endpoint, credentials: { clientId, userName, password } };
}

function tenantToContext(tenant: Tenant): TenantContext {
  const prodConfig = buildCloud9Config(
    tenant.cloud9_prod_endpoint,
    tenant.cloud9_prod_client_id,
    tenant.cloud9_prod_username,
    tenant.cloud9_prod_password
  );
  const sandboxConfig = buildCloud9Config(
    tenant.cloud9_sandbox_endpoint,
    tenant.cloud9_sandbox_client_id,
    tenant.cloud9_sandbox_username,
    tenant.cloud9_sandbox_password
  );

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    cloud9: {
      production: prodConfig,
      sandbox: sandboxConfig,
    },
    nodered: {
      url: tenant.nodered_url || '',
      username: tenant.nodered_username || '',
      password: tenant.nodered_password || '',
    },
    flowise: {
      url: tenant.flowise_url || '',
      apiKey: tenant.flowise_api_key || '',
    },
    langfuse: {
      host: tenant.langfuse_host || '',
      publicKey: tenant.langfuse_public_key || '',
      secretKey: tenant.langfuse_secret_key || '',
    },
    dominos: {
      serviceUrl: tenant.dominos_service_url || '',
      authToken: tenant.dominos_service_auth_token || '',
      defaultStoreId: tenant.dominos_default_store_id || '',
      dataSourceUrl: tenant.dominos_data_source_url || '',
    },
    fabricWorkflow: {
      url: tenant.fabric_workflow_url || '',
      username: tenant.fabric_workflow_username || '',
      password: tenant.fabric_workflow_password || '',
    },
    v1FilesDir: tenant.v1_files_dir,
    noderedFlowsDir: tenant.nodered_flows_dir,
    colorPrimary: tenant.color_primary,
    colorSecondary: tenant.color_secondary,
    logoUrl: tenant.logo_url,
  };
}

/** Get Cloud9 config for a specific environment from tenant context (null = use global defaults) */
export function getCloud9ConfigForTenant(ctx: TenantContext, env: Environment): Cloud9Config | undefined {
  const config = env === 'production' ? ctx.cloud9.production : ctx.cloud9.sandbox;
  return config ?? undefined;
}

// Routes that skip tenant resolution
const SKIP_PATHS = ['/health', '/api/auth/login'];

/**
 * Tenant Context Middleware
 * Resolves tenant from X-Tenant-Id header or user's default tenant.
 * Attaches req.tenantContext for downstream use.
 */
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip for excluded paths
  if (SKIP_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return next();
  }

  try {
    // Check if tenants table exists (migration may not have run yet)
    let tenantsExist = false;
    try {
      const defaultTenant = TenantModel.getDefault();
      tenantsExist = !!defaultTenant;
    } catch {
      // Table doesn't exist yet - skip tenant resolution
      return next();
    }

    if (!tenantsExist) {
      return next();
    }

    // Try to get tenant ID from header
    const headerTenantId = req.header('X-Tenant-Id');
    let tenantId: number | null = null;

    if (headerTenantId) {
      tenantId = parseInt(headerTenantId, 10);
      if (isNaN(tenantId)) {
        tenantId = null;
      }
    }

    // If no header, try to get user's default tenant from JWT
    if (!tenantId) {
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = verifyToken(token);
        if (payload) {
          tenantId = TenantModel.getUserDefaultTenantId(payload.userId);
        }
      }
    }

    // Fallback to the default tenant
    if (!tenantId) {
      const defaultTenant = TenantModel.getDefault();
      if (defaultTenant) {
        tenantId = defaultTenant.id;
      }
    }

    if (!tenantId) {
      return next();
    }

    // Load the tenant
    const tenant = TenantModel.getById(tenantId);
    if (!tenant || !tenant.is_active) {
      return next();
    }

    // Validate user has access (if authenticated)
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload && !TenantModel.userHasAccess(payload.userId, tenant.id)) {
        res.status(403).json({
          status: 'error',
          message: 'You do not have access to this tenant',
        });
        return;
      }
    }

    req.tenantContext = tenantToContext(tenant);
  } catch (error) {
    logger.error('Tenant context middleware error', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't block requests on tenant resolution failure - fall through
  }

  next();
}
