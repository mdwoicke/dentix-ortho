/**
 * Semantic Entity Extractor
 *
 * Uses LLM to extract structured data from user messages.
 * Replaces brittle regex patterns with semantic understanding.
 *
 * Features:
 * - Extracts phone, email, names, DOB, insurance, preferences
 * - Normalizes formats (phone → XXX-XXX-XXXX, dates → ISO)
 * - Handles international formats and variations
 * - Caches results for repeated extractions
 */

import { z } from 'zod';
import { getLLMProvider, LLMProvider, LLMRequest } from '../../../shared/services/llm-provider';
import type { DataFieldCategory } from '../schemas/response-category-schemas';
import type { CollectableField } from '../tests/types/goals';

// =============================================================================
// Zod Schemas for Extracted Entities
// =============================================================================

/**
 * Extracted phone number with normalization
 */
export const ExtractedPhoneSchema = z.object({
  raw: z.string(),
  normalized: z.string().regex(/^\d{3}-\d{3}-\d{4}$/).optional(),
  isValid: z.boolean(),
});

export type ExtractedPhone = z.infer<typeof ExtractedPhoneSchema>;

/**
 * Extracted email with validation
 */
export const ExtractedEmailSchema = z.object({
  raw: z.string(),
  normalized: z.string().email().optional(),
  isValid: z.boolean(),
});

export type ExtractedEmail = z.infer<typeof ExtractedEmailSchema>;

/**
 * Extracted name (person)
 */
export const ExtractedNameSchema = z.object({
  full: z.string().optional(),
  first: z.string().optional(),
  last: z.string().optional(),
  spelling: z.string().optional(), // Letter-by-letter spelling if provided
});

export type ExtractedName = z.infer<typeof ExtractedNameSchema>;

/**
 * Extracted date (DOB, appointment date, etc.)
 */
export const ExtractedDateSchema = z.object({
  raw: z.string(),
  normalized: z.string().optional(), // ISO format: YYYY-MM-DD
  month: z.number().min(1).max(12).optional(),
  day: z.number().min(1).max(31).optional(),
  year: z.number().min(1900).max(2100).optional(),
  isValid: z.boolean(),
});

export type ExtractedDate = z.infer<typeof ExtractedDateSchema>;

/**
 * Extracted child information
 */
export const ExtractedChildSchema = z.object({
  name: ExtractedNameSchema.optional(),
  dateOfBirth: ExtractedDateSchema.optional(),
  age: z.number().min(0).max(100).optional(),
});

export type ExtractedChild = z.infer<typeof ExtractedChildSchema>;

/**
 * Extracted insurance information
 */
export const ExtractedInsuranceSchema = z.object({
  hasInsurance: z.boolean().optional(),
  provider: z.string().optional(),
  memberId: z.string().optional(),
  groupNumber: z.string().optional(),
});

export type ExtractedInsurance = z.infer<typeof ExtractedInsuranceSchema>;

/**
 * Extracted time/scheduling preferences
 */
export const ExtractedPreferencesSchema = z.object({
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).optional(),
  specificTime: z.string().optional(), // e.g., "9am", "2:30pm"
  preferredDays: z.array(z.string()).optional(), // e.g., ["Monday", "Wednesday"]
  location: z.string().optional(),
});

export type ExtractedPreferences = z.infer<typeof ExtractedPreferencesSchema>;

/**
 * Complete extraction result
 */
export const ExtractedEntitiesSchema = z.object({
  // Contact information
  phone: ExtractedPhoneSchema.optional(),
  email: ExtractedEmailSchema.optional(),

  // Caller/parent information
  callerName: ExtractedNameSchema.optional(),

  // Child information (can be multiple)
  children: z.array(ExtractedChildSchema).optional(),
  childCount: z.number().min(0).max(10).optional(),

  // Insurance
  insurance: ExtractedInsuranceSchema.optional(),

  // Preferences
  preferences: ExtractedPreferencesSchema.optional(),

  // Special needs/accommodations
  specialNeeds: z.string().optional(),

  // Previous visit/treatment info
  previousVisit: z.boolean().optional(),
  previousTreatment: z.boolean().optional(),

  // Raw confirmations (yes/no responses)
  confirmation: z.enum(['yes', 'no', 'unclear']).optional(),

  // Extraction metadata
  confidence: z.number().min(0).max(1),
  fieldsExtracted: z.array(z.string()),
});

export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;

// =============================================================================
// Configuration
// =============================================================================

export interface SemanticEntityExtractorConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  maxCacheEntries: number;
}

const DEFAULT_CONFIG: SemanticEntityExtractorConfig = {
  model: 'claude-3-5-haiku-20241022',
  temperature: 0.0, // Deterministic for consistent extraction
  maxTokens: 1024,
  timeout: 30000,
  cacheEnabled: true,
  cacheTtlMs: 300000, // 5 minutes
  maxCacheEntries: 500,
};

// =============================================================================
// LRU Cache Implementation
// =============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries: number, ttlMs: number) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Delete if exists (to update position)
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// =============================================================================
// Semantic Entity Extractor
// =============================================================================

export class SemanticEntityExtractor {
  private llmProvider: LLMProvider;
  private config: SemanticEntityExtractorConfig;
  private cache: LRUCache<ExtractedEntities>;

  constructor(config: Partial<SemanticEntityExtractorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llmProvider = getLLMProvider();
    this.cache = new LRUCache(this.config.maxCacheEntries, this.config.cacheTtlMs);
    console.log('[SemanticEntityExtractor] Initialized with LLM-based extraction');
  }

  /**
   * Extract entities from a user message
   */
  async extract(
    userMessage: string,
    context: {
      agentQuestion?: string;
      expectedFields?: DataFieldCategory[];
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    } = {}
  ): Promise<ExtractedEntities> {
    // Generate cache key
    const cacheKey = this.generateCacheKey(userMessage, context);

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log('[SemanticEntityExtractor] Cache hit');
        return cached;
      }
    }

    // Build extraction prompt
    const prompt = this.buildExtractionPrompt(userMessage, context);

    // Execute LLM extraction
    const request: LLMRequest = {
      prompt,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      timeout: this.config.timeout,
      systemPrompt: this.getSystemPrompt(),
      purpose: 'semantic-evaluation',
    };

    try {
      const response = await this.llmProvider.execute(request);

      if (!response.success || !response.content) {
        console.warn('[SemanticEntityExtractor] LLM extraction failed:', response.error);
        return this.getFallbackExtraction(userMessage);
      }

      // Parse and validate response
      const extracted = this.parseExtractionResponse(response.content, userMessage);

      // Cache result
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, extracted);
      }

      const fieldsStr = extracted.fieldsExtracted.join(', ') || 'none';
      console.log(`[SemanticEntityExtractor] Extracted: ${fieldsStr} (${extracted.confidence.toFixed(2)})`);

      return extracted;
    } catch (error: any) {
      console.warn('[SemanticEntityExtractor] Extraction error:', error.message);
      return this.getFallbackExtraction(userMessage);
    }
  }

  /**
   * Quick extraction for volunteered data (used during test runs)
   * Returns data in CollectableField format for compatibility
   */
  async extractVolunteered(
    userMessage: string
  ): Promise<Array<{ field: CollectableField; value: string }>> {
    const entities = await this.extract(userMessage);
    const results: Array<{ field: CollectableField; value: string }> = [];

    // Map extracted entities to CollectableField format
    if (entities.phone?.normalized || entities.phone?.raw) {
      results.push({
        field: 'parent_phone',
        value: entities.phone.normalized || entities.phone.raw,
      });
    }

    if (entities.email?.normalized || entities.email?.raw) {
      results.push({
        field: 'parent_email',
        value: entities.email.normalized || entities.email.raw,
      });
    }

    if (entities.callerName?.full || entities.callerName?.first) {
      results.push({
        field: 'parent_name',
        value: entities.callerName.full || `${entities.callerName.first || ''} ${entities.callerName.last || ''}`.trim(),
      });
    }

    if (entities.insurance?.provider) {
      results.push({
        field: 'insurance',
        value: entities.insurance.provider,
      });
    }

    if (entities.specialNeeds) {
      results.push({
        field: 'special_needs',
        value: entities.specialNeeds,
      });
    }

    if (entities.childCount !== undefined) {
      results.push({
        field: 'child_count',
        value: String(entities.childCount),
      });
    }

    if (entities.children && entities.children.length > 0) {
      const firstChild = entities.children[0];
      if (firstChild.name?.full || firstChild.name?.first) {
        results.push({
          field: 'child_names',
          value: firstChild.name.full || `${firstChild.name.first || ''} ${firstChild.name.last || ''}`.trim(),
        });
      }
      if (firstChild.dateOfBirth?.normalized) {
        results.push({
          field: 'child_dob',
          value: firstChild.dateOfBirth.normalized,
        });
      }
    }

    return results;
  }

  /**
   * Generate cache key from message and context
   */
  private generateCacheKey(message: string, context: any): string {
    const contextStr = JSON.stringify({
      agentQuestion: context.agentQuestion?.substring(0, 100),
      expectedFields: context.expectedFields,
    });
    return `${message}|${contextStr}`;
  }

  /**
   * Get system prompt for extraction
   */
  private getSystemPrompt(): string {
    return `You are an entity extraction assistant for an orthodontic scheduling system.
Your job is to extract structured data from user messages during phone calls.

EXTRACTION RULES:
1. Only extract data that is EXPLICITLY stated in the message
2. Do NOT infer or guess data that isn't clearly provided
3. Normalize formats where possible:
   - Phone: XXX-XXX-XXXX (US format)
   - Email: lowercase
   - Date: YYYY-MM-DD (ISO format)
   - Names: Title Case
4. For letter-by-letter spelling, combine into the full word
5. Handle variations gracefully (different date formats, phone formats, etc.)
6. Set isValid=false for malformed data that couldn't be normalized

CONTEXT: This is an orthodontic office scheduling call. Common entities include:
- Parent/caller name and contact info
- Child name, DOB, and age
- Insurance information
- Appointment preferences
- Special needs or accommodations

Return ONLY a JSON object matching the schema. Include only fields that have extracted data.`;
  }

  /**
   * Build extraction prompt
   */
  private buildExtractionPrompt(
    userMessage: string,
    context: {
      agentQuestion?: string;
      expectedFields?: DataFieldCategory[];
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): string {
    let prompt = `Extract structured data from this user message.\n\n`;

    if (context.agentQuestion) {
      prompt += `Agent asked: "${context.agentQuestion}"\n`;
    }

    if (context.expectedFields && context.expectedFields.length > 0) {
      prompt += `Expected data types: ${context.expectedFields.join(', ')}\n`;
    }

    prompt += `\nUser message: "${userMessage}"\n\n`;

    prompt += `Return JSON with this structure:
{
  "phone": { "raw": "original text", "normalized": "XXX-XXX-XXXX", "isValid": true/false },
  "email": { "raw": "original text", "normalized": "email@example.com", "isValid": true/false },
  "callerName": { "full": "First Last", "first": "First", "last": "Last", "spelling": "F-I-R-S-T" },
  "children": [{ "name": {...}, "dateOfBirth": {...}, "age": number }],
  "childCount": number,
  "insurance": { "hasInsurance": true/false, "provider": "name", "memberId": "id", "groupNumber": "num" },
  "preferences": { "timeOfDay": "morning|afternoon|evening|any", "specificTime": "9am", "preferredDays": ["Monday"], "location": "name" },
  "specialNeeds": "description if mentioned",
  "previousVisit": true/false,
  "previousTreatment": true/false,
  "confirmation": "yes|no|unclear",
  "confidence": 0.0-1.0,
  "fieldsExtracted": ["field1", "field2", ...]
}

Include ONLY fields with extracted data. Always include confidence and fieldsExtracted.`;

    return prompt;
  }

  /**
   * Parse and validate LLM response
   */
  private parseExtractionResponse(text: string, originalMessage: string): ExtractedEntities {
    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Remove null values recursively (LLM often returns null instead of omitting)
      const cleaned = this.removeNulls(parsed);

      // Apply normalization and defaults
      const normalized = this.normalizeExtraction(cleaned, originalMessage);

      // Validate with Zod (partial validation - allow missing fields)
      return ExtractedEntitiesSchema.parse(normalized);
    } catch (error: any) {
      console.warn('[SemanticEntityExtractor] Parse error:', error.message);
      console.warn('[SemanticEntityExtractor] Raw response:', text.substring(0, 200));
      return this.getFallbackExtraction(originalMessage);
    }
  }

  /**
   * Recursively remove null values from an object
   */
  private removeNulls(obj: any): any {
    if (obj === null || obj === undefined) {
      return undefined;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeNulls(item)).filter(item => item !== undefined);
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleaned = this.removeNulls(value);
        if (cleaned !== undefined) {
          result[key] = cleaned;
        }
      }
      // Return undefined if object is empty after cleaning
      return Object.keys(result).length > 0 ? result : undefined;
    }

    return obj;
  }

  /**
   * Normalize extracted data
   */
  private normalizeExtraction(parsed: any, originalMessage: string): any {
    const result: any = {
      confidence: parsed.confidence ?? 0.5,
      fieldsExtracted: parsed.fieldsExtracted ?? [],
    };

    // Normalize phone
    if (parsed.phone) {
      result.phone = {
        raw: parsed.phone.raw || '',
        normalized: this.normalizePhone(parsed.phone.raw || parsed.phone.normalized),
        isValid: parsed.phone.isValid ?? true,
      };
      if (result.phone.normalized && !result.fieldsExtracted.includes('phone')) {
        result.fieldsExtracted.push('phone');
      }
    }

    // Normalize email
    if (parsed.email) {
      result.email = {
        raw: parsed.email.raw || '',
        normalized: (parsed.email.normalized || parsed.email.raw || '').toLowerCase(),
        isValid: parsed.email.isValid ?? true,
      };
      if (result.email.normalized && !result.fieldsExtracted.includes('email')) {
        result.fieldsExtracted.push('email');
      }
    }

    // Copy other fields - handle callerName which may be string or object
    if (parsed.callerName) {
      if (typeof parsed.callerName === 'string') {
        // LLM returned just a name string
        const parts = parsed.callerName.split(/\s+/);
        result.callerName = {
          full: parsed.callerName,
          first: parts[0],
          last: parts[1],
        };
      } else {
        // LLM returned object - ensure full name is populated
        result.callerName = {
          ...parsed.callerName,
          full: parsed.callerName.full ||
            `${parsed.callerName.first || ''} ${parsed.callerName.last || ''}`.trim() ||
            undefined,
        };
      }
      if (!result.fieldsExtracted.includes('callerName')) {
        result.fieldsExtracted.push('callerName');
      }
    }

    if (parsed.children && Array.isArray(parsed.children)) {
      result.children = parsed.children.map((child: any) => {
        // Handle dateOfBirth - LLM may return string directly or object
        let dateOfBirth = undefined;
        if (child.dateOfBirth) {
          if (typeof child.dateOfBirth === 'string') {
            // LLM returned simplified string format
            const normalized = this.normalizeDate(child.dateOfBirth);
            dateOfBirth = {
              raw: child.dateOfBirth,
              normalized,
              isValid: !!normalized,
            };
          } else {
            // LLM returned object format
            const normalized = this.normalizeDate(child.dateOfBirth.raw || child.dateOfBirth.normalized);
            dateOfBirth = {
              raw: child.dateOfBirth.raw || '',
              normalized,
              isValid: child.dateOfBirth.isValid ?? !!normalized,
            };
          }
        }

        // Handle name - LLM may return string or object
        let name = undefined;
        if (child.name) {
          if (typeof child.name === 'string') {
            const parts = child.name.split(/\s+/);
            name = { full: child.name, first: parts[0], last: parts[1] };
          } else {
            name = child.name;
          }
        }

        return { name, dateOfBirth, age: child.age };
      });
      if (!result.fieldsExtracted.includes('children')) {
        result.fieldsExtracted.push('children');
      }
    }

    if (parsed.childCount !== undefined) {
      result.childCount = parsed.childCount;
      if (!result.fieldsExtracted.includes('childCount')) {
        result.fieldsExtracted.push('childCount');
      }
    }

    if (parsed.insurance) {
      result.insurance = parsed.insurance;
      if (!result.fieldsExtracted.includes('insurance')) {
        result.fieldsExtracted.push('insurance');
      }
    }

    if (parsed.preferences) {
      result.preferences = parsed.preferences;
      if (!result.fieldsExtracted.includes('preferences')) {
        result.fieldsExtracted.push('preferences');
      }
    }

    if (parsed.specialNeeds) {
      result.specialNeeds = parsed.specialNeeds;
      if (!result.fieldsExtracted.includes('specialNeeds')) {
        result.fieldsExtracted.push('specialNeeds');
      }
    }

    if (parsed.previousVisit !== undefined) {
      result.previousVisit = parsed.previousVisit;
    }

    if (parsed.previousTreatment !== undefined) {
      result.previousTreatment = parsed.previousTreatment;
    }

    if (parsed.confirmation) {
      result.confirmation = parsed.confirmation;
    }

    return result;
  }

  /**
   * Normalize phone number to XXX-XXX-XXXX format
   */
  private normalizePhone(phone: string): string | undefined {
    if (!phone) return undefined;

    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Handle different lengths
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    }

    return undefined; // Invalid format
  }

  /**
   * Normalize date to YYYY-MM-DD format
   */
  private normalizeDate(dateStr: string): string | undefined {
    if (!dateStr) return undefined;

    try {
      // Try parsing various formats
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }

      // Try MM/DD/YYYY format
      const mdyMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (mdyMatch) {
        const month = mdyMatch[1].padStart(2, '0');
        const day = mdyMatch[2].padStart(2, '0');
        let year = mdyMatch[3];
        if (year.length === 2) {
          year = (parseInt(year) > 50 ? '19' : '20') + year;
        }
        return `${year}-${month}-${day}`;
      }

      // Try "Month Day, Year" format
      const textMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
      if (textMatch) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december'];
        const monthIdx = monthNames.indexOf(textMatch[1].toLowerCase());
        if (monthIdx >= 0) {
          const month = String(monthIdx + 1).padStart(2, '0');
          const day = textMatch[2].padStart(2, '0');
          return `${textMatch[3]}-${month}-${day}`;
        }
      }
    } catch (e) {
      // Fall through to return undefined
    }

    return undefined;
  }

  /**
   * Fallback extraction using regex patterns (legacy behavior)
   */
  private getFallbackExtraction(message: string): ExtractedEntities {
    const result: ExtractedEntities = {
      confidence: 0.3,
      fieldsExtracted: [],
    };

    // Phone extraction
    const phoneMatch = message.match(/\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/);
    if (phoneMatch) {
      const normalized = this.normalizePhone(phoneMatch[1]);
      result.phone = {
        raw: phoneMatch[1],
        normalized,
        isValid: !!normalized,
      };
      result.fieldsExtracted.push('phone');
    }

    // Email extraction
    const emailMatch = message.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i);
    if (emailMatch) {
      result.email = {
        raw: emailMatch[1],
        normalized: emailMatch[1].toLowerCase(),
        isValid: true,
      };
      result.fieldsExtracted.push('email');
    }

    // Name extraction
    const nameMatch = message.match(/\b(?:i'?m|my name is|this is)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/i);
    if (nameMatch) {
      const parts = nameMatch[1].split(/\s+/);
      result.callerName = {
        full: nameMatch[1],
        first: parts[0],
        last: parts[1],
      };
      result.fieldsExtracted.push('callerName');
    }

    // Child count extraction
    const countMatch = message.match(/\b(one|two|three|four|five|\d+)\s+(child|children|kids?)\b/i);
    if (countMatch) {
      const countMap: Record<string, number> = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5
      };
      const countWord = countMatch[1].toLowerCase();
      result.childCount = countMap[countWord] || parseInt(countWord);
      result.fieldsExtracted.push('childCount');
    }

    // Insurance extraction
    const insuranceMatch = message.match(/\b(aetna|cigna|united\s*health|blue\s*cross|anthem|humana|kaiser)\b/i);
    if (insuranceMatch) {
      result.insurance = {
        hasInsurance: true,
        provider: insuranceMatch[1],
      };
      result.fieldsExtracted.push('insurance');
    }

    return result;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[SemanticEntityExtractor] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheEntries,
      ttlMs: this.config.cacheTtlMs,
    };
  }
}

// =============================================================================
// Singleton Factory
// =============================================================================

let extractorInstance: SemanticEntityExtractor | null = null;

/**
 * Get the singleton entity extractor instance
 */
export function getSemanticEntityExtractor(): SemanticEntityExtractor {
  if (!extractorInstance) {
    extractorInstance = new SemanticEntityExtractor();
  }
  return extractorInstance;
}

/**
 * Reset the extractor instance (useful for testing)
 */
export function resetSemanticEntityExtractor(): void {
  extractorInstance = null;
}
