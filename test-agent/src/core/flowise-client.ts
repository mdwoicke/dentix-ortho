/**
 * Flowise API Client
 * Handles communication with the Flowise prediction API
 * Enhanced with Langfuse tracing for comprehensive observability
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/config';
import { getFlowiseEndpoint } from '../services/settings-service';
import {
  getLangfuseService,
  getCurrentTraceContext,
  scoreError,
} from '../../../shared/services';

export interface ToolCall {
  toolName: string;
  input?: any;
  output?: any;
  status?: string;
  durationMs?: number;
}

export interface FlowiseResponse {
  text: string;
  sessionId: string;
  responseTime: number;
  rawResponse: any;
  toolCalls: ToolCall[];
}

export interface FlowiseError {
  message: string;
  code: string;
  statusCode?: number;
}

export class FlowiseClient {
  private client: AxiosInstance;
  private sessionId: string;
  private endpoint: string;
  private apiKey?: string;
  private sessionVars: Record<string, string>;

  /**
   * Create a new FlowiseClient
   * @param sessionId - Optional session ID (generates UUID if not provided)
   * @param endpoint - Required endpoint URL - NO hardcoded fallbacks
   * @param apiKey - Optional API key for authentication
   * @param sessionVars - Optional session variables (e.g., c1mg_variable_caller_id_number)
   */
  constructor(sessionId: string | undefined, endpoint: string, apiKey?: string, sessionVars?: Record<string, string>) {
    if (!endpoint) {
      throw new Error('[FlowiseClient] Endpoint is required - no hardcoded fallbacks allowed');
    }
    this.sessionId = sessionId || uuidv4();
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.sessionVars = sessionVars || {};

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add Authorization header if API key is provided
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    this.client = axios.create({
      baseURL: this.endpoint,
      timeout: config.flowise.timeout,
      headers,
    });
  }

  /**
   * Get the current endpoint URL
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  /**
   * Create a FlowiseClient for a specific sandbox endpoint
   */
  static forSandbox(endpoint: string, sessionId?: string, apiKey?: string, sessionVars?: Record<string, string>): FlowiseClient {
    return new FlowiseClient(sessionId, endpoint, apiKey, sessionVars);
  }

  /**
   * @deprecated REMOVED - Use forActiveConfig() instead. No hardcoded fallbacks allowed.
   */
  static forProduction(sessionId?: string, sessionVars?: Record<string, string>): FlowiseClient {
    throw new Error('[FlowiseClient] forProduction() is deprecated and removed. Use forActiveConfig() to get settings from the app.');
  }

  /**
   * Create a FlowiseClient using the active configuration from app settings
   * Throws error if settings unavailable - NO hardcoded fallbacks
   * @param sessionId - Optional session ID
   * @param sessionVars - Optional session variables (e.g., { c1mg_variable_caller_id_number: '5551234567' })
   * @param configId - Optional specific Flowise config ID to use instead of active/default
   */
  static async forActiveConfig(sessionId?: string, sessionVars?: Record<string, string>, configId?: number): Promise<FlowiseClient> {
    const settings = await getFlowiseEndpoint(configId);
    console.log(`[FlowiseClient] Using ${configId ? `config ID ${configId}` : 'active config'}: ${settings.url.substring(0, 60)}...`);
    return new FlowiseClient(sessionId, settings.url, settings.apiKey, sessionVars);
  }

  /**
   * Set session variables (for use after construction)
   */
  setSessionVars(vars: Record<string, string>): void {
    this.sessionVars = { ...this.sessionVars, ...vars };
  }

  /**
   * Send a message to the Flowise API
   * Includes Langfuse span tracking for observability
   */
  async sendMessage(question: string): Promise<FlowiseResponse> {
    const startTime = Date.now();

    const payload = {
      question,
      overrideConfig: {
        sessionId: this.sessionId,
        // Pass session variables (e.g., c1mg_variable_caller_id_number for telephony simulation)
        ...(Object.keys(this.sessionVars).length > 0 && { vars: this.sessionVars }),
      },
    };

    // Get Langfuse context and start span tracking
    const langfuse = getLangfuseService();
    const traceContext = getCurrentTraceContext();
    let span: any = null;

    if (traceContext && await langfuse.ensureInitialized()) {
      try {
        span = await langfuse.startSpan({
          name: 'flowise-prediction',
          traceId: traceContext.traceId,
          parentObservationId: traceContext.parentObservationId,
          input: {
            question: question.substring(0, 500), // Truncate for storage
            sessionId: this.sessionId,
          },
          metadata: {
            type: 'external-llm',
            provider: 'flowise',
            endpoint: this.endpoint.substring(0, 60),
          },
        });
      } catch (e: any) {
        console.warn(`[FlowiseClient] Langfuse span start failed: ${e.message}`);
      }
    }

    let lastError: Error | null = null;
    let attemptCount = 0;

    for (let attempt = 1; attempt <= config.flowise.retryAttempts; attempt++) {
      attemptCount = attempt;
      try {
        const response = await this.client.post('', payload);
        const responseTime = Date.now() - startTime;

        // Handle different response formats from Flowise
        const text = this.extractText(response.data);

        // Extract tool calls from the response
        const toolCalls = this.extractToolCalls(response.data);

        // Log tool calls as child spans
        if (span && toolCalls.length > 0) {
          for (const tc of toolCalls) {
            try {
              const toolSpan = await langfuse.startSpan({
                name: `tool-${tc.toolName}`,
                traceId: traceContext!.traceId,
                parentObservationId: span.id,
                input: tc.input,
                metadata: {
                  type: 'flowise-tool-call',
                  toolName: tc.toolName,
                },
              });
              if (toolSpan) {
                langfuse.endSpan(toolSpan.id, {
                  output: tc.output,
                  statusMessage: tc.status,
                });
              }
            } catch (e: any) {
              // Ignore tool span errors
            }
          }
        }

        // End Langfuse span with success
        if (span) {
          try {
            langfuse.endSpan(span.id, {
              output: {
                text: text.substring(0, 500),
                toolCallCount: toolCalls.length,
                responseTime,
              },
            });
          } catch (e: any) {
            console.warn(`[FlowiseClient] Langfuse span end failed: ${e.message}`);
          }
        }

        return {
          text,
          sessionId: this.sessionId,
          responseTime,
          rawResponse: response.data,
          toolCalls,
        };
      } catch (error: any) {
        lastError = error;

        if (attempt < config.flowise.retryAttempts) {
          await this.delay(config.flowise.retryDelay * attempt);
        }
      }
    }

    // End Langfuse span with error
    if (span) {
      try {
        langfuse.endSpan(span.id, {
          output: { error: lastError?.message },
          level: 'ERROR',
          statusMessage: lastError?.message,
        });
      } catch (e: any) {
        console.warn(`[FlowiseClient] Langfuse span error end failed: ${e.message}`);
      }
    }

    // Score the error
    if (traceContext) {
      try {
        await scoreError(
          traceContext.traceId,
          'api_error',
          lastError?.message || 'Unknown error',
          span?.id
        );
      } catch (e: any) {
        // Ignore scoring errors
      }
    }

    throw this.createError(lastError);
  }

  /**
   * Extract text from various Flowise response formats
   * Filters out PAYLOAD section - only returns the ANSWER portion for TTS
   */
  private extractText(data: any): string {
    let rawText: string;

    if (typeof data === 'string') {
      rawText = data;
    } else if (data.text) {
      rawText = data.text;
    } else if (data.answer) {
      rawText = data.answer;
    } else if (data.response) {
      rawText = data.response;
    } else if (data.output) {
      rawText = data.output;
    } else {
      rawText = JSON.stringify(data);
    }

    // Filter out PAYLOAD section - only return the ANSWER portion for TTS
    return this.extractAnswerOnly(rawText);
  }

  /**
   * Extract only the ANSWER portion from a response, filtering out PAYLOAD
   * The IVA returns responses in format:
   * ANSWER: [spoken text]
   * PAYLOAD: { JSON }
   *
   * Only the ANSWER should be spoken to the caller
   */
  private extractAnswerOnly(text: string): string {
    if (!text) return '';

    // Check if response has ANSWER: prefix
    const answerMatch = text.match(/^ANSWER:\s*([\s\S]*?)(?:\n\s*PAYLOAD:|$)/i);
    if (answerMatch && answerMatch[1]) {
      return answerMatch[1].trim();
    }

    // Fallback: remove PAYLOAD section if present (no ANSWER: prefix)
    const payloadIndex = text.toUpperCase().indexOf('\nPAYLOAD:');
    if (payloadIndex !== -1) {
      return text.substring(0, payloadIndex).trim();
    }

    // Also check for PAYLOAD: at start of line without newline
    const payloadStartIndex = text.toUpperCase().indexOf('PAYLOAD:');
    if (payloadStartIndex !== -1) {
      // Only strip if PAYLOAD appears to be on its own line or after content
      const beforePayload = text.substring(0, payloadStartIndex).trim();
      if (beforePayload.length > 0) {
        return beforePayload;
      }
    }

    // No PAYLOAD found, return as-is
    return text;
  }

  /**
   * Extract tool calls from Flowise response
   * Flowise can return tool/function calls in various formats
   */
  private extractToolCalls(data: any): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    if (!data || typeof data !== 'object') {
      return toolCalls;
    }

    // Extract the text content to look for embedded PAYLOAD
    const textContent = this.extractText(data);

    // Check for embedded PAYLOAD in the response text
    // Format: ANSWER: ... PAYLOAD: { JSON }
    const payloadIndex = textContent.toUpperCase().indexOf('PAYLOAD:');
    if (payloadIndex !== -1) {
      const payloadSection = textContent.substring(payloadIndex + 8).trim();
      // Find the JSON object - handle nested braces
      const jsonStart = payloadSection.indexOf('{');
      if (jsonStart !== -1) {
        let braceCount = 0;
        let jsonEnd = jsonStart;
        for (let i = jsonStart; i < payloadSection.length; i++) {
          if (payloadSection[i] === '{') braceCount++;
          if (payloadSection[i] === '}') braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
        const jsonStr = payloadSection.substring(jsonStart, jsonEnd);
        try {
          const payloadJson = JSON.parse(jsonStr);
          toolCalls.push({
            toolName: 'flowise_payload',
            input: null,
            output: payloadJson,
            status: 'completed',
          });
        } catch (e) {
          // Store as raw text if parsing fails
          toolCalls.push({
            toolName: 'flowise_payload',
            input: null,
            output: { raw: jsonStr },
            status: 'completed',
          });
        }
      }
    }

    // Check for agentReasoning array (common in Flowise agent responses)
    if (Array.isArray(data.agentReasoning)) {
      for (const step of data.agentReasoning) {
        if (step.usedTools && Array.isArray(step.usedTools)) {
          for (const tool of step.usedTools) {
            toolCalls.push({
              toolName: tool.tool || tool.name || 'unknown',
              input: tool.toolInput || tool.input,
              output: tool.toolOutput || tool.output,
              status: tool.status || 'completed',
            });
          }
        }
        // Also check for single tool usage
        if (step.tool || step.toolName) {
          toolCalls.push({
            toolName: step.tool || step.toolName,
            input: step.toolInput || step.input,
            output: step.toolOutput || step.output,
            status: step.status || 'completed',
          });
        }
      }
    }

    // Check for tool_calls array (OpenAI function calling format)
    if (Array.isArray(data.tool_calls)) {
      for (const call of data.tool_calls) {
        toolCalls.push({
          toolName: call.function?.name || call.name || 'unknown',
          input: call.function?.arguments || call.arguments,
          output: call.output || call.result,
          status: 'completed',
        });
      }
    }

    // Check for function_call (single function call format)
    if (data.function_call) {
      toolCalls.push({
        toolName: data.function_call.name || 'unknown',
        input: data.function_call.arguments,
        output: data.function_call.output,
        status: 'completed',
      });
    }

    // Check for usedTools at the top level
    if (Array.isArray(data.usedTools)) {
      for (const tool of data.usedTools) {
        toolCalls.push({
          toolName: tool.tool || tool.name || 'unknown',
          input: tool.toolInput || tool.input,
          output: tool.toolOutput || tool.output,
          status: tool.status || 'completed',
        });
      }
    }

    // Check for sourceDocuments (RAG responses may contain retrieval info)
    if (Array.isArray(data.sourceDocuments)) {
      toolCalls.push({
        toolName: 'document_retrieval',
        input: { query: 'vector search' },
        output: data.sourceDocuments.map((doc: any) => ({
          pageContent: doc.pageContent?.substring(0, 200),
          metadata: doc.metadata,
        })),
        status: 'completed',
      });
    }

    return toolCalls;
  }

  /**
   * Create a standardized error object
   */
  private createError(error: any): FlowiseError {
    if (axios.isAxiosError(error)) {
      return {
        message: error.response?.data?.message || error.message,
        code: error.code || 'UNKNOWN_ERROR',
        statusCode: error.response?.status,
      };
    }

    return {
      message: error?.message || 'Unknown error',
      code: 'UNKNOWN_ERROR',
    };
  }

  /**
   * Create a new session
   */
  newSession(): string {
    this.sessionId = uuidv4();
    return this.sessionId;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
