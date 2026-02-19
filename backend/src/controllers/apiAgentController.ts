import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { mcpClientService } from '../services/mcpClientService';
import logger from '../utils/logger';

/**
 * Convert CSV text to a markdown table.
 */
function csvToMarkdownTable(csv: string): string {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return csv;

  // Parse CSV lines (handle quoted fields with commas)
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  // Build markdown table
  const headerRow = '| ' + headers.join(' | ') + ' |';
  const separator = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const dataRows = rows.map(row => {
    // Pad or truncate to match header count
    const padded = headers.map((_, i) => (row[i] || '').replace(/\|/g, '\\|'));
    return '| ' + padded.join(' | ') + ' |';
  });

  return [headerRow, separator, ...dataRows].join('\n');
}

/**
 * Check if text looks like CSV data (has a header row with commas and subsequent data rows).
 */
function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return false;
  const firstLine = lines[0];
  // Header row should have commas and no leading spaces (not markdown)
  if (!firstLine.includes(',')) return false;
  // Should not start with markdown markers
  if (firstLine.startsWith('#') || firstLine.startsWith('*') || firstLine.startsWith('-') || firstLine.startsWith('|')) return false;
  // At least 2 columns
  const commaCount = (firstLine.match(/,/g) || []).length;
  return commaCount >= 1;
}

/**
 * Format the display text: convert CSV to markdown table, clean up JSON objects, etc.
 */
function formatDisplayText(text: string): string {
  if (!text || text.trim().length === 0) return text;

  // If it looks like CSV, convert to markdown table
  if (looksLikeCsv(text)) {
    return csvToMarkdownTable(text);
  }

  return text;
}

/**
 * Parse api-agent JSON response and extract the human-readable text.
 * api-agent returns: {"ok":true,"data":"...text...","api_calls":[...],"result":[...]}
 * When using a cached recipe, may return raw CSV instead of JSON.
 */
function extractAgentResponse(raw: string): {
  displayText: string;
  apiCalls: unknown[];
  resultData: unknown;
} {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      const dataText = String(parsed.data || '');
      return {
        displayText: formatDisplayText(dataText),
        apiCalls: Array.isArray(parsed.api_calls) ? parsed.api_calls : [],
        resultData: parsed.result ?? null,
      };
    }
  } catch {
    // Not JSON — check if raw text is CSV
  }
  return { displayText: formatDisplayText(raw), apiCalls: [], resultData: null };
}

/**
 * Build a source-specific instruction prefix for the api-agent question.
 * This constrains the agent to only use endpoints tagged with the chosen API.
 */
function buildSourcePrefix(source: string): string {
  switch (source) {
    case 'call':
      return '[IMPORTANT: Focus on call session and trace endpoints: /api/test-monitor/sessions/*, /api/test-monitor/prod-tracker/*, /api/trace-analysis/*. Use these for call stats, session lookup, trace insights, and error analysis.]\n\n';
    case 'nodered':
      return '[IMPORTANT: Only use the Node-RED Ortho endpoints (paths starting with /api/nodered/ortho/). Do NOT use Cloud9 direct endpoints.]\n\n';
    case 'dominos-menu':
      return '[IMPORTANT: Only use Dominos menu/store endpoints: /api/dominos/menu/*, /api/dominos/coupons/*, /api/dominos/store/*/info.]\n\n';
    case 'dominos-orders':
      return '[IMPORTANT: Only use Dominos order/dashboard endpoints: /api/dominos/dashboard/*, /api/dominos/sessions/*, /api/dominos/correlation.]\n\n';
    case 'dominos-traces':
      return '[IMPORTANT: Only use Trace Analysis endpoints: /api/trace-analysis/*.]\n\n';
    default: // cloud9
      return '[IMPORTANT: Only use Cloud9 direct API endpoints (Patients, Appointments, Reference, Test Monitor, Dominos, Trace Analysis). Do NOT use Node-RED endpoints.]\n\n';
  }
}

/**
 * POST /api/api-agent/chat
 *
 * Accepts { message, sessionId?, source? } and streams the api-agent response
 * back to the client as Server-Sent Events.
 *
 * source: 'call' (default) | 'cloud9' | 'nodered' — tells the agent which API set to query.
 */
export const chat = async (req: Request, res: Response): Promise<void> => {
  const { message } = req.body;
  const sessionId = req.body.sessionId || uuidv4();
  const VALID_SOURCES = ['call', 'cloud9', 'nodered', 'dominos-menu', 'dominos-orders', 'dominos-traces'];
  const source: string = VALID_SOURCES.includes(req.body.source) ? req.body.source : 'call';

  if (!message || typeof message !== 'string') {
    res.status(400).json({ success: false, error: 'message is required and must be a string' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if proxied
  res.flushHeaders();

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Signal start
    sendEvent({ type: 'start', sessionId, source });

    const toolName = mcpClientService.getQueryToolName();
    logger.info(`[ApiAgent] Calling ${toolName} tool`, { sessionId, source, messageLength: message.length });

    const question = buildSourcePrefix(source) + message;
    const result = await mcpClientService.callTool(toolName, { question });

    // The MCP tool result has a `content` array with { type, text } items.
    // api-agent returns JSON like: {"ok":true,"data":"...human text...","api_calls":[...],"result":[...]}
    // We extract the human-readable `data` field for display, and send metadata separately.
    if (result?.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          const extracted = extractAgentResponse(item.text);
          sendEvent({ type: 'chunk', content: extracted.displayText });
          if (extracted.apiCalls.length > 0 || extracted.resultData) {
            sendEvent({ type: 'metadata', apiCalls: extracted.apiCalls, resultData: extracted.resultData });
          }
        }
      }
    } else if (result?.content) {
      // Single content item (non-array fallback)
      const extracted = extractAgentResponse(String(result.content));
      sendEvent({ type: 'chunk', content: extracted.displayText });
    }

    // Signal completion
    sendEvent({ type: 'done', sessionId });
    logger.info(`[ApiAgent] ${toolName} completed`, { sessionId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[ApiAgent] chat error', { sessionId, error: errorMessage });
    sendEvent({ type: 'error', error: errorMessage });
  } finally {
    res.end();
  }
};

/**
 * GET /api/api-agent/health
 *
 * Check if the MCP client can connect to the api-agent server.
 */
export const health = async (_req: Request, res: Response): Promise<void> => {
  try {
    await mcpClientService.getClient();
    // If getClient() succeeded, the connection is alive
    res.json({
      status: 'healthy',
      connected: true,
      queryTool: mcpClientService.getQueryToolName(),
      endpoint: process.env.API_AGENT_MCP_URL || 'http://localhost:3001/mcp',
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn('[ApiAgent] health check failed', { error: errorMessage });
    res.json({
      status: 'unhealthy',
      connected: false,
      error: errorMessage,
      endpoint: process.env.API_AGENT_MCP_URL || 'http://localhost:3001/mcp',
    });
  }
};
