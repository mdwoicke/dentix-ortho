/**
 * Flowise Replay Service
 *
 * Re-sends caller messages from a traced conversation through Flowise
 * to compare tool call behavior between original and replayed sessions.
 *
 * Limitations:
 * - Slot availability and cache state will differ from original call
 * - Session state (memory) starts fresh -- LLM may behave differently
 * - This tests integration logic, not exact reproduction
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface FlowiseReplayMessage {
  role: 'caller' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ToolCallComparison {
  turnIndex: number;
  original: { toolName: string; action?: string } | null;
  replayed: { toolName: string; action?: string } | null;
  match: boolean;
}

export interface FlowiseReplayResult {
  traceId: string;
  replaySessionId: string;
  messages: Array<{
    sent: string;
    received: string;
    toolCalls: Array<{ toolName: string; input?: any; output?: any }>;
    responseTimeMs: number;
  }>;
  toolCallComparison: ToolCallComparison[];
  originalToolCalls: Array<{ toolName: string; action?: string; observationId: string }>;
  limitations: string[];
  durationMs: number;
}

// ============================================================================
// DATABASE ACCESS
// ============================================================================

function getDb(): BetterSqlite3.Database {
  const dbPath = path.resolve(__dirname, '../../../test-agent/data/test-results.db');
  return new BetterSqlite3(dbPath, { readonly: true });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract caller messages from trace observations.
 * Looks at GENERATION-type observations where input contains user messages.
 */
function extractCallerMessages(db: BetterSqlite3.Database, traceId: string): string[] {
  // Get all traces for this session (a trace may be part of a multi-trace session)
  const trace = db.prepare(`
    SELECT session_id FROM production_traces WHERE trace_id = ?
  `).get(traceId) as any;

  if (!trace) return [];

  // Get all traces in the session ordered chronologically
  const traces = db.prepare(`
    SELECT trace_id, input FROM production_traces
    WHERE session_id = ?
    ORDER BY started_at ASC
  `).all(trace.session_id) as any[];

  const callerMessages: string[] = [];

  for (const t of traces) {
    if (!t.input) continue;
    try {
      const input = JSON.parse(t.input);
      // Flowise traces typically have { question: "..." } as input
      const text = input.question || input.message || input.input || input.text;
      if (typeof text === 'string' && text.trim()) {
        callerMessages.push(text.trim());
      }
    } catch {
      // If input is a plain string
      if (typeof t.input === 'string' && t.input.trim()) {
        callerMessages.push(t.input.trim());
      }
    }
  }

  return callerMessages;
}

/**
 * Extract original tool calls from trace observations.
 */
function extractOriginalToolCalls(
  db: BetterSqlite3.Database,
  traceId: string
): Array<{ toolName: string; action?: string; observationId: string }> {
  const trace = db.prepare(`
    SELECT session_id FROM production_traces WHERE trace_id = ?
  `).get(traceId) as any;

  if (!trace) return [];

  const traceIds = db.prepare(`
    SELECT trace_id FROM production_traces WHERE session_id = ? ORDER BY started_at ASC
  `).all(trace.session_id) as any[];

  if (traceIds.length === 0) return [];

  const placeholders = traceIds.map(() => '?').join(',');
  const ids = traceIds.map((t: any) => t.trace_id);

  const observations = db.prepare(`
    SELECT observation_id, name, input FROM production_trace_observations
    WHERE trace_id IN (${placeholders})
      AND name IN ('chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time', 'chord_handleEscalation')
    ORDER BY started_at ASC
  `).all(...ids) as any[];

  return observations.map((obs: any) => {
    let action: string | undefined;
    try {
      const inp = typeof obs.input === 'string' ? JSON.parse(obs.input) : obs.input;
      action = inp?.action;
    } catch { /* ignore */ }
    return {
      toolName: obs.name,
      action,
      observationId: obs.observation_id,
    };
  });
}

/**
 * Get Flowise chatflow URL from flowise_configs table.
 */
function getFlowiseConfig(db: BetterSqlite3.Database, configId?: number): { url: string; apiKey?: string } | null {
  let row: any;
  if (configId) {
    row = db.prepare(`SELECT chatflow_url, api_key FROM flowise_configs WHERE id = ?`).get(configId);
  } else {
    row = db.prepare(`SELECT chatflow_url, api_key FROM flowise_configs WHERE is_default = 1 LIMIT 1`).get();
  }
  if (!row || !row.chatflow_url) return null;
  return { url: row.chatflow_url, apiKey: row.api_key || undefined };
}

/**
 * Extract tool calls from Flowise prediction response.
 */
function extractToolCallsFromResponse(data: any): Array<{ toolName: string; input?: any; output?: any }> {
  const toolCalls: Array<{ toolName: string; input?: any; output?: any }> = [];

  if (!data || typeof data !== 'object') return toolCalls;

  // agentReasoning array (common Flowise format)
  if (Array.isArray(data.agentReasoning)) {
    for (const step of data.agentReasoning) {
      if (step.usedTools && Array.isArray(step.usedTools)) {
        for (const tool of step.usedTools) {
          toolCalls.push({
            toolName: tool.tool || tool.name || 'unknown',
            input: tool.toolInput || tool.input,
            output: tool.toolOutput || tool.output,
          });
        }
      }
    }
  }

  // usedTools at top level
  if (Array.isArray(data.usedTools)) {
    for (const tool of data.usedTools) {
      toolCalls.push({
        toolName: tool.tool || tool.name || 'unknown',
        input: tool.toolInput || tool.input,
        output: tool.toolOutput || tool.output,
      });
    }
  }

  return toolCalls;
}

// ============================================================================
// MAIN REPLAY FUNCTION
// ============================================================================

/**
 * Replay a trace through Flowise by re-sending caller messages.
 */
export async function replayThroughFlowise(
  traceId: string,
  flowiseConfigId?: number
): Promise<FlowiseReplayResult> {
  const startTime = Date.now();
  const db = getDb();

  try {
    // 1. Extract caller messages from trace
    const callerMessages = extractCallerMessages(db, traceId);
    if (callerMessages.length === 0) {
      throw new Error(`No caller messages found for trace ${traceId}`);
    }

    // 2. Extract original tool calls for comparison
    const originalToolCalls = extractOriginalToolCalls(db, traceId);

    // 3. Get Flowise config
    const flowiseConfig = getFlowiseConfig(db, flowiseConfigId);
    if (!flowiseConfig) {
      throw new Error(`No Flowise config found${flowiseConfigId ? ` for ID ${flowiseConfigId}` : ' (no default set)'}`);
    }

    // 4. Create new session and send messages
    const replaySessionId = uuidv4();
    const messages: FlowiseReplayResult['messages'] = [];
    const replayedToolCalls: Array<{ toolName: string; action?: string }> = [];

    for (let i = 0; i < callerMessages.length; i++) {
      const msgStart = Date.now();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (flowiseConfig.apiKey) {
        headers['Authorization'] = `Bearer ${flowiseConfig.apiKey}`;
      }

      const response = await fetch(flowiseConfig.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: callerMessages[i],
          overrideConfig: { sessionId: replaySessionId },
        }),
      });

      const responseData = await response.json() as any;
      const responseTimeMs = Date.now() - msgStart;

      // Extract text
      let text = '';
      if (typeof responseData === 'string') text = responseData;
      else text = responseData.text || responseData.answer || responseData.response || JSON.stringify(responseData);

      // Extract tool calls
      const turnToolCalls = extractToolCallsFromResponse(responseData);
      for (const tc of turnToolCalls) {
        let action: string | undefined;
        try {
          const inp = typeof tc.input === 'string' ? JSON.parse(tc.input) : tc.input;
          action = inp?.action;
        } catch { /* ignore */ }
        replayedToolCalls.push({ toolName: tc.toolName, action });
      }

      messages.push({
        sent: callerMessages[i],
        received: text,
        toolCalls: turnToolCalls,
        responseTimeMs,
      });

      // Wait between messages to let Flowise process
      if (i < callerMessages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 5. Build tool call comparison
    const maxLen = Math.max(originalToolCalls.length, replayedToolCalls.length);
    const toolCallComparison: ToolCallComparison[] = [];
    for (let i = 0; i < maxLen; i++) {
      const orig = originalToolCalls[i] ? { toolName: originalToolCalls[i].toolName, action: originalToolCalls[i].action } : null;
      const repl = replayedToolCalls[i] || null;
      toolCallComparison.push({
        turnIndex: i,
        original: orig,
        replayed: repl,
        match: orig !== null && repl !== null && orig.toolName === repl.toolName && orig.action === repl.action,
      });
    }

    return {
      traceId,
      replaySessionId,
      messages,
      toolCallComparison,
      originalToolCalls,
      limitations: [
        'Slot availability and cache state will differ from original call.',
        'Session memory starts fresh -- LLM may choose different paths.',
        'This tests integration logic flow, not exact reproduction.',
        'Tool call comparison is positional (index-based), not semantic.',
      ],
      durationMs: Date.now() - startTime,
    };
  } finally {
    db.close();
  }
}
