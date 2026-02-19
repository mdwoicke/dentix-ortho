import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

const NODERED_BASE_URL =
  process.env.NODERED_FLOW_URL ||
  'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';

const NODERED_AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.NODERED_ADMIN_USER || 'workflowapi'}:${process.env.NODERED_ADMIN_PASSWORD || 'e^@V95&6sAJReTsb5!iq39mIC4HYIV'}`
  ).toString('base64');

const TIMEOUT_MS = 30_000;

/**
 * Generic proxy handler — forwards POST JSON to Node-RED and returns the response.
 */
async function proxyToNodeRed(
  endpoint: string,
  body: Record<string, unknown>,
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const url = `${NODERED_BASE_URL}/${endpoint}`;
  const startTime = Date.now();

  try {
    logger.info(`[NodeRedProxy] POST ${endpoint}`, { body: Object.keys(body) });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: NODERED_AUTH,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn(`[NodeRedProxy] ${endpoint} returned ${response.status}`, {
        duration,
        errorText: errorText.slice(0, 500),
      });
      res.status(response.status).json({
        success: false,
        error: `Node-RED returned ${response.status}`,
        detail: errorText.slice(0, 1000),
      });
      return;
    }

    if (contentType.includes('application/json')) {
      const data = await response.json();
      logger.info(`[NodeRedProxy] ${endpoint} OK`, { duration });
      res.json(data);
    } else {
      const text = await response.text();
      logger.info(`[NodeRedProxy] ${endpoint} OK (text)`, { duration });
      res.json({ result: text });
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.error(`[NodeRedProxy] ${endpoint} timed out after ${TIMEOUT_MS}ms`);
      res.status(504).json({ success: false, error: 'Node-RED request timed out' });
      return;
    }
    logger.error(`[NodeRedProxy] ${endpoint} error`, {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
}

// ─── Patient Endpoints ────────────────────────────────────────────────

export async function getPatientByFilter(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('getPatientByFilter', req.body, req, res, next);
}

export async function getPatient(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('getPatient', req.body, req, res, next);
}

export async function createPatient(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('createPatient', req.body, req, res, next);
}

export async function getPatientAppts(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('getPatientAppts', req.body, req, res, next);
}

export async function getLocation(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('getLocation', req.body, req, res, next);
}

export async function editInsurance(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('editInsurance', req.body, req, res, next);
}

export async function confirmAppt(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('confirmAppt', req.body, req, res, next);
}

// ─── Scheduling Endpoints ─────────────────────────────────────────────

export async function getApptSlots(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('getApptSlots', req.body, req, res, next);
}

export async function getGroupedApptSlots(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('getGroupedApptSlots', req.body, req, res, next);
}

export async function createAppt(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('createAppt', req.body, req, res, next);
}

export async function cancelAppt(req: Request, res: Response, next: NextFunction) {
  await proxyToNodeRed('cancelAppt', req.body, req, res, next);
}
