/**
 * Intent Detector Service
 *
 * Uses LLM to detect what the agent is asking for from its response.
 * Falls back to keyword-based detection when LLM is unavailable.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/config';
import {
  AgentIntent,
  IntentDetectionResult,
  detectIntentByKeywords,
  INTENT_KEYWORDS,
} from '../tests/types/intent';
import type { CollectableField } from '../tests/types/goals';
import type { ConversationTurn } from '../tests/test-case';

/**
 * Configuration for the intent detector
 */
export interface IntentDetectorConfig {
  /** Whether to use LLM for detection */
  useLlm: boolean;

  /** Model to use for detection */
  model: string;

  /** Temperature for detection (lower = more deterministic) */
  temperature: number;

  /** Max tokens for response */
  maxTokens: number;

  /** Timeout in ms */
  timeout: number;

  /** Whether to cache results */
  cacheEnabled: boolean;

  /** Cache TTL in ms */
  cacheTtlMs: number;
}

const DEFAULT_CONFIG: IntentDetectorConfig = {
  useLlm: true,
  model: 'claude-opus-4-5-20251101', // Using Opus 4.5 for all LLM calls
  temperature: 0.1,
  maxTokens: 512,
  timeout: 15000,
  cacheEnabled: true,
  cacheTtlMs: 300000, // 5 minutes
};

interface CacheEntry {
  result: IntentDetectionResult;
  timestamp: number;
}

/**
 * Intent Detector Service
 *
 * Analyzes agent responses to determine what information they're asking for.
 */
export class IntentDetector {
  private client: Anthropic | null = null;
  private config: IntentDetectorConfig;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(cfg?: Partial<IntentDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...cfg };
    this.initializeClient();
  }

  private initializeClient(): void {
    const token = process.env.CLAUDE_CODE_OAUTH_TOKEN ||
                  process.env.ANTHROPIC_API_KEY;

    if (token && this.config.useLlm) {
      this.client = new Anthropic({ apiKey: token });
      console.log('[IntentDetector] Initialized with LLM support');
    } else {
      console.log('[IntentDetector] Running in keyword-only mode');
    }
  }

  /**
   * Check if LLM-based detection is available
   */
  isLlmAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Check for terminal intent patterns that should override LLM detection
   * These are high-confidence patterns that indicate definitive state changes
   */
  private checkForTerminalIntentOverride(agentResponse: string): IntentDetectionResult | null {
    // Explicit booking confirmation patterns
    const bookingPatterns = [
      /\bappointment has been (successfully )?scheduled\b/i,
      /\bI have booked\b/i,
      /\byour appointment is confirmed\b/i,
      /\bappointment.*scheduled.*for (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
    ];

    for (const pattern of bookingPatterns) {
      if (pattern.test(agentResponse)) {
        return {
          primaryIntent: 'confirming_booking',
          confidence: 0.95,
          isQuestion: false,
          requiresUserResponse: false,
          reasoning: 'Explicit booking confirmation detected',
        };
      }
    }

    return null;
  }

  /**
   * Detect the intent from an agent response
   */
  async detectIntent(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    pendingFields: CollectableField[] = []
  ): Promise<IntentDetectionResult> {
    // FIRST: Check for terminal intent patterns that should override everything
    const terminalOverride = this.checkForTerminalIntentOverride(agentResponse);
    if (terminalOverride) {
      return terminalOverride;
    }

    // Check cache
    const cacheKey = this.getCacheKey(agentResponse, pendingFields);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Try LLM detection
    if (this.client && this.config.useLlm) {
      try {
        const result = await this.detectWithLlm(agentResponse, conversationHistory, pendingFields);
        this.saveToCache(cacheKey, result);
        return result;
      } catch (error) {
        console.warn('[IntentDetector] LLM detection failed, falling back to keywords:', error);
      }
    }

    // Fall back to keyword detection
    const result = this.detectWithKeywords(agentResponse);
    this.saveToCache(cacheKey, result);
    return result;
  }

  /**
   * Detect intent using LLM
   */
  private async detectWithLlm(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    pendingFields: CollectableField[]
  ): Promise<IntentDetectionResult> {
    const prompt = this.buildPrompt(agentResponse, conversationHistory, pendingFields);

    const response = await this.client!.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from LLM');
    }

    return this.parseResponse(textContent.text);
  }

  /**
   * Build the prompt for intent detection
   */
  private buildPrompt(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    pendingFields: CollectableField[]
  ): string {
    // Get recent history (last 4 turns)
    const recentHistory = conversationHistory.slice(-4);
    const historyText = recentHistory.length > 0
      ? recentHistory.map(t => `[${t.role}]: ${t.content}`).join('\n')
      : 'No prior conversation';

    return `You are analyzing an orthodontic scheduling assistant's response to detect what information it's asking for.

## Agent's Response
"${agentResponse}"

## Recent Conversation History
${historyText}

## Fields Not Yet Collected
${pendingFields.length > 0 ? pendingFields.join(', ') : 'None specified'}

## Your Task
Identify the agent's PRIMARY intent from this response. What information is the agent asking for or what action is it taking?

Return ONLY a JSON object (no markdown, no explanation):

{
  "primaryIntent": "asking_parent_name",
  "confidence": 0.95,
  "secondaryIntents": [],
  "isQuestion": true,
  "requiresUserResponse": true,
  "reasoning": "Agent asks 'May I have your first and last name?'"
}

## Valid Intent Values
- greeting, saying_goodbye
- asking_parent_name, asking_spell_name, asking_phone, asking_email
- asking_child_count, asking_child_name, asking_child_dob, asking_child_age
- asking_new_patient, asking_previous_visit, asking_previous_ortho
- asking_insurance, asking_special_needs, asking_time_preference, asking_location_preference
- confirming_information, confirming_spelling, asking_proceed_confirmation
- searching_availability, offering_time_slots, confirming_booking
- initiating_transfer, handling_error, asking_clarification
- unknown

## Critical Intent Distinctions
- searching_availability: Use when agent says "Let me check", "One moment", "Looking up available times" WITHOUT offering specific times yet
- offering_time_slots: Use when agent explicitly offers specific times like "I have 9:30 AM available" or "Would you prefer 10 AM or 2 PM?"
- asking_proceed_confirmation: Use when agent asks "Would you like to proceed anyway?" (e.g., for out-of-network insurance)

## Guidelines
- Choose the MOST SPECIFIC intent that matches
- If agent asks multiple things, put additional intents in secondaryIntents
- requiresUserResponse=true if the agent is expecting user input
- isQuestion=true if the response ends with a question or asks for information
- confidence should be 0.7-1.0 based on how clear the intent is`;
  }

  /**
   * Parse LLM response into IntentDetectionResult
   */
  private parseResponse(text: string): IntentDetectionResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate primaryIntent
      const validIntents = Object.keys(INTENT_KEYWORDS);
      if (!validIntents.includes(parsed.primaryIntent)) {
        parsed.primaryIntent = 'unknown';
      }

      return {
        primaryIntent: parsed.primaryIntent as AgentIntent,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        secondaryIntents: (parsed.secondaryIntents || []).filter((i: string) => validIntents.includes(i)) as AgentIntent[],
        isQuestion: parsed.isQuestion ?? true,
        requiresUserResponse: parsed.requiresUserResponse ?? true,
        extractedInfo: parsed.extractedInfo,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.warn('[IntentDetector] Failed to parse LLM response:', error);
      // Return a safe default
      return {
        primaryIntent: 'unknown',
        confidence: 0.3,
        isQuestion: true,
        requiresUserResponse: true,
        reasoning: 'Failed to parse LLM response',
      };
    }
  }

  /**
   * Detect intent using keyword matching
   */
  private detectWithKeywords(agentResponse: string): IntentDetectionResult {
    const primaryIntent = detectIntentByKeywords(agentResponse);

    // Determine if it's a question
    const isQuestion = /\?/.test(agentResponse) ||
      /\b(what|how|when|where|who|which|could you|would you|can you|may i)\b/i.test(agentResponse);

    // Determine if response is expected
    const terminalIntents: AgentIntent[] = ['saying_goodbye', 'confirming_booking', 'initiating_transfer'];
    const requiresUserResponse = !terminalIntents.includes(primaryIntent);

    return {
      primaryIntent,
      confidence: primaryIntent === 'unknown' ? 0.3 : 0.7,
      isQuestion,
      requiresUserResponse,
      reasoning: `Keyword match for '${primaryIntent}'`,
    };
  }

  /**
   * Generate cache key
   */
  private getCacheKey(response: string, pendingFields: CollectableField[]): string {
    // Use first 100 chars of response + pending fields
    const prefix = response.slice(0, 100).toLowerCase().replace(/\s+/g, ' ');
    return `${prefix}|${pendingFields.sort().join(',')}`;
  }

  /**
   * Get from cache if valid
   */
  private getFromCache(key: string): IntentDetectionResult | null {
    if (!this.config.cacheEnabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.config.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Save to cache
   */
  private saveToCache(key: string, result: IntentDetectionResult): void {
    if (!this.config.cacheEnabled) return;

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Clean old entries periodically
    if (this.cache.size > 100) {
      this.cleanCache();
    }
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTtlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Default singleton instance
let defaultInstance: IntentDetector | null = null;

export function getIntentDetector(): IntentDetector {
  if (!defaultInstance) {
    defaultInstance = new IntentDetector();
  }
  return defaultInstance;
}
