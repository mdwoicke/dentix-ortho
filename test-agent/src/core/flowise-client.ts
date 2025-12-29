/**
 * Flowise API Client
 * Handles communication with the Flowise prediction API
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/config';

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

  /**
   * Create a new FlowiseClient
   * @param sessionId - Optional session ID (generates UUID if not provided)
   * @param endpoint - Optional endpoint URL override (uses config default if not provided)
   */
  constructor(sessionId?: string, endpoint?: string) {
    this.sessionId = sessionId || uuidv4();
    this.endpoint = endpoint || config.flowise.endpoint;
    this.client = axios.create({
      baseURL: this.endpoint,
      timeout: config.flowise.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
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
  static forSandbox(endpoint: string, sessionId?: string): FlowiseClient {
    return new FlowiseClient(sessionId, endpoint);
  }

  /**
   * Create a FlowiseClient using the default production endpoint
   */
  static forProduction(sessionId?: string): FlowiseClient {
    return new FlowiseClient(sessionId, config.flowise.endpoint);
  }

  /**
   * Send a message to the Flowise API
   */
  async sendMessage(question: string): Promise<FlowiseResponse> {
    const startTime = Date.now();

    const payload = {
      question,
      overrideConfig: {
        sessionId: this.sessionId,
      },
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.flowise.retryAttempts; attempt++) {
      try {
        const response = await this.client.post('', payload);
        const responseTime = Date.now() - startTime;

        // Handle different response formats from Flowise
        const text = this.extractText(response.data);

        // Extract tool calls from the response
        const toolCalls = this.extractToolCalls(response.data);

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

    throw this.createError(lastError);
  }

  /**
   * Extract text from various Flowise response formats
   */
  private extractText(data: any): string {
    if (typeof data === 'string') {
      return data;
    }

    if (data.text) {
      return data.text;
    }

    if (data.answer) {
      return data.answer;
    }

    if (data.response) {
      return data.response;
    }

    if (data.output) {
      return data.output;
    }

    return JSON.stringify(data);
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
