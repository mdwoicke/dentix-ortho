/**
 * Tool Harness Controller
 * Thin wrappers around toolHarnessService for VM-based tool execution
 */

import { Request, Response, NextFunction } from 'express';
import * as toolHarnessService from '../services/toolHarnessService';

// ============================================================================
// POST /replay/harness - Execute tool in VM harness
// ============================================================================

export async function executeHarnessReplay(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { toolName, action, input, variant, tenantId, varsConfig, observationId, dryRun } = req.body;

    // Validate required fields
    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({ success: false, error: 'Missing or invalid toolName' });
      return;
    }
    if (!action || typeof action !== 'string') {
      res.status(400).json({ success: false, error: 'Missing or invalid action' });
      return;
    }
    if (!input || typeof input !== 'object') {
      res.status(400).json({ success: false, error: 'Missing or invalid input object' });
      return;
    }

    // Validate variant
    const validVariants = ['production', 'sandbox_a', 'sandbox_b'];
    if (variant && !validVariants.includes(variant)) {
      res.status(400).json({
        success: false,
        error: `Invalid variant: ${variant}. Must be one of: ${validVariants.join(', ')}`,
      });
      return;
    }

    const result = await toolHarnessService.executeInHarness({
      toolName,
      action,
      input,
      variant: variant || 'production',
      tenantId,
      varsConfig,
      observationId,
      dryRun,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// GET /replay/harness/variants - List available variants
// ============================================================================

export async function getHarnessVariants(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantId = req.query.tenantId ? parseInt(req.query.tenantId as string, 10) : undefined;

    const variants = toolHarnessService.getAvailableVariants(tenantId);

    res.json({
      success: true,
      data: variants,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// POST /replay/harness/validate - Syntax-check tool code
// ============================================================================

export async function validateHarnessCode(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { toolName, variant } = req.body;

    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({ success: false, error: 'Missing or invalid toolName' });
      return;
    }

    const validVariants = ['production', 'sandbox_a', 'sandbox_b'];
    if (variant && !validVariants.includes(variant)) {
      res.status(400).json({
        success: false,
        error: `Invalid variant: ${variant}. Must be one of: ${validVariants.join(', ')}`,
      });
      return;
    }

    const result = toolHarnessService.validateToolCode(toolName, variant || 'production');

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// POST /replay/harness/compare - Compare two variants
// ============================================================================

export async function compareHarnessVariants(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { toolName, action, input, variantA, variantB, tenantId, varsConfig, observationId } = req.body;

    // Validate required fields
    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({ success: false, error: 'Missing or invalid toolName' });
      return;
    }
    if (!action || typeof action !== 'string') {
      res.status(400).json({ success: false, error: 'Missing or invalid action' });
      return;
    }
    if (!input || typeof input !== 'object') {
      res.status(400).json({ success: false, error: 'Missing or invalid input object' });
      return;
    }

    const validVariants = ['production', 'sandbox_a', 'sandbox_b'];
    const vA = variantA || 'production';
    const vB = variantB || 'sandbox_b';

    if (!validVariants.includes(vA) || !validVariants.includes(vB)) {
      res.status(400).json({
        success: false,
        error: `Invalid variant(s). Must be one of: ${validVariants.join(', ')}`,
      });
      return;
    }

    if (vA === vB) {
      res.status(400).json({
        success: false,
        error: 'variantA and variantB must be different',
      });
      return;
    }

    const result = await toolHarnessService.compareVariants(
      { toolName, action, input, tenantId, varsConfig, observationId },
      vA as 'production' | 'sandbox_a' | 'sandbox_b',
      vB as 'production' | 'sandbox_a' | 'sandbox_b'
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
}
