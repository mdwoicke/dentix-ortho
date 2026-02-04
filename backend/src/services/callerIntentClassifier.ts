/**
 * Caller Intent Classifier Service
 *
 * Analyzes orthodontic appointment scheduling call transcripts to classify
 * the caller's primary intent and extract relevant booking details.
 * Uses the shared LLM provider abstraction (CLI or API).
 */

import { getLLMProvider } from '../../../shared/services/llm-provider';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  responseTimeMs?: number;
  stepId?: string;
  validationPassed?: boolean;
  validationMessage?: string;
}

export interface BookingDetails {
  childCount: number;
  childNames: string[];
  parentName: string | null;
  parentPhone: string | null;
  requestedDates: string[];
}

export type CallerIntentType = 'booking' | 'rescheduling' | 'cancellation' | 'info_lookup';

export interface CallerIntent {
  type: CallerIntentType;
  confidence: number;
  bookingDetails?: BookingDetails;
  summary: string;
}

// ============================================================================
// CLASSIFIER
// ============================================================================

const SYSTEM_PROMPT = `You analyze orthodontic appointment scheduling call transcripts. Classify the caller's primary intent and extract relevant details. Return JSON only.

Return a JSON object with this exact schema:
{
  "type": "booking" | "rescheduling" | "cancellation" | "info_lookup",
  "confidence": 0.0-1.0,
  "bookingDetails": {
    "childCount": number,
    "childNames": ["string"],
    "parentName": "string or null",
    "parentPhone": "string or null",
    "requestedDates": ["string"]
  },
  "summary": "One sentence describing the caller's intent"
}

Rules:
- "booking" = caller wants to schedule a new appointment (most common)
- "rescheduling" = caller wants to change an existing appointment
- "cancellation" = caller wants to cancel an existing appointment
- "info_lookup" = caller wants information (hours, location, insurance questions, etc.)
- bookingDetails should be included for booking and rescheduling intents
- childCount defaults to 1 if children are mentioned but count is unclear
- Extract names, phone numbers, and dates mentioned in the conversation
- confidence should reflect how clearly the intent is expressed

Return ONLY the JSON object, no markdown or explanation.`;

/**
 * Classify the caller's intent from a conversation transcript.
 * Uses Anthropic Claude 3.5 Haiku for classification.
 */
export async function classifyCallerIntent(transcript: ConversationTurn[]): Promise<CallerIntent> {
  // Handle empty or very short transcripts
  if (!transcript || transcript.length < 2) {
    return {
      type: 'info_lookup',
      confidence: 0.5,
      summary: 'Insufficient transcript data to determine intent',
    };
  }

  const provider = getLLMProvider();
  if (!provider.isAvailable()) {
    console.warn('[CallerIntentClassifier] LLM provider unavailable, returning fallback');
    return {
      type: 'info_lookup',
      confidence: 0,
      summary: 'Classification unavailable - no LLM provider configured',
    };
  }

  // Build transcript text
  const transcriptText = transcript
    .map((turn) => `[${turn.role}]: ${turn.content}`)
    .join('\n');

  try {
    const response = await provider.execute({
      prompt: transcriptText,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 512,
      temperature: 0,
      purpose: 'generic-llm-call',
      metadata: { service: 'callerIntentClassifier' },
    });

    if (!response.success || !response.content) {
      console.error(`[CallerIntentClassifier] LLM provider error: ${response.error}`);
      return createFallbackIntent(response.error || 'LLM provider error');
    }

    const result = parseLlmResponse(response.content);

    // If LLM returned a low-confidence fallback, try transcript-based classification
    if (result.confidence === 0 || (result.type === 'info_lookup' && result.confidence < 0.3)) {
      const transcriptResult = classifyFromTranscript(transcript);
      if (transcriptResult && transcriptResult.confidence > result.confidence) {
        console.log('[CallerIntentClassifier] LLM fallback triggered, using transcript-based classification');
        return transcriptResult;
      }
    }

    return result;
  } catch (error: any) {
    console.error('[CallerIntentClassifier] Classification failed:', error.message);
    // Try transcript-based fallback before giving up
    const transcriptResult = classifyFromTranscript(transcript);
    if (transcriptResult) {
      console.log('[CallerIntentClassifier] LLM error, using transcript-based classification');
      return transcriptResult;
    }
    return createFallbackIntent('Classification error');
  }
}

/**
 * Parse the LLM JSON response into a CallerIntent.
 */
function parseLlmResponse(text: string): CallerIntent {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return createFallbackIntent('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate type
    const validTypes: CallerIntentType[] = ['booking', 'rescheduling', 'cancellation', 'info_lookup'];
    const type: CallerIntentType = validTypes.includes(parsed.type) ? parsed.type : 'info_lookup';

    // Validate confidence
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    // Parse booking details if present
    let bookingDetails: BookingDetails | undefined;
    if (parsed.bookingDetails && (type === 'booking' || type === 'rescheduling')) {
      bookingDetails = {
        childCount: typeof parsed.bookingDetails.childCount === 'number'
          ? parsed.bookingDetails.childCount
          : 1,
        childNames: Array.isArray(parsed.bookingDetails.childNames)
          ? parsed.bookingDetails.childNames.filter((n: any) => typeof n === 'string')
          : [],
        parentName: typeof parsed.bookingDetails.parentName === 'string'
          ? parsed.bookingDetails.parentName
          : null,
        parentPhone: typeof parsed.bookingDetails.parentPhone === 'string'
          ? parsed.bookingDetails.parentPhone
          : null,
        requestedDates: Array.isArray(parsed.bookingDetails.requestedDates)
          ? parsed.bookingDetails.requestedDates.filter((d: any) => typeof d === 'string')
          : [],
      };
    }

    return {
      type,
      confidence,
      bookingDetails,
      summary: typeof parsed.summary === 'string' ? parsed.summary : `Classified as ${type}`,
    };
  } catch (error) {
    console.warn('[CallerIntentClassifier] Failed to parse LLM response:', error);
    return createFallbackIntent('Parse error');
  }
}

/**
 * Transcript-based intent classification fallback.
 * Scans conversation turns for booking signals and extracts details
 * when the LLM fails to return valid JSON.
 */
function classifyFromTranscript(transcript: ConversationTurn[]): CallerIntent | null {
  const bookingSignals = /\b(appointment|schedule|book|consultation|come in|visit|opening|slot|available)\b/i;
  const dobPattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;

  let signalCount = 0;
  const childNames: string[] = [];
  let parentName: string | null = null;
  const dates: string[] = [];

  for (let i = 0; i < transcript.length; i++) {
    const turn = transcript[i];
    const content = turn.content;

    if (bookingSignals.test(content)) signalCount++;

    // Extract child names from various patterns
    const childNameDirect = content.match(/child(?:'s)?\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (childNameDirect) {
      const name = childNameDirect[1].trim();
      if (!childNames.includes(name)) childNames.push(name);
    }

    // Pattern: assistant asks "child's name" -> next user turn is the name
    if (turn.role === 'assistant' && /what(?:'s| is)\s+(?:your\s+)?child(?:'s)?\s+name/i.test(content)) {
      const next = transcript[i + 1];
      if (next?.role === 'user') {
        const nameMatch = next.content.trim().match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          if (!childNames.includes(name)) childNames.push(name);
        }
      }
    }

    // Pattern: assistant spells back name "first name is I-S-A-I-A-H, and the last name is C-A-V-E"
    if (turn.role === 'assistant') {
      const spellMatch = content.match(/first name is ([A-Z](?:-[A-Z])+).*last name is ([A-Z](?:-[A-Z])+)/i);
      if (spellMatch) {
        const firstName = spellMatch[1].replace(/-/g, '');
        const lastName = spellMatch[2].replace(/-/g, '');
        // Capitalize properly
        const name = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
          + ' ' + lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
        if (!childNames.includes(name)) childNames.push(name);
      }

      // Pattern: assistant mentions child by name in context like "Isaiah's date of birth" or "scheduled the consultation for Isaiah"
      const childRefMatch = content.match(/(?:for|either)\s+([A-Z][a-z]+)(?:\s+(?:and|or)\s+([A-Z][a-z]+))?/);
      if (childRefMatch) {
        for (const m of [childRefMatch[1], childRefMatch[2]]) {
          if (m && m.length > 2) {
            // Only add if it matches an already-found child first name or looks like a child name in scheduling context
            const existing = childNames.find(n => n.toLowerCase().startsWith(m.toLowerCase()));
            if (!existing && /schedul|consult|appointment|birth/i.test(content)) {
              // Check it's not a common non-name word
              if (!/^(the|that|this|your|our|any)$/i.test(m)) {
                // Just track first name — we may already have the full name
              }
            }
          }
        }
      }
    }

    // Extract parent name: "Thanks, Leanne" pattern at start of conversation
    if (turn.role === 'assistant' && !parentName) {
      const thanksMatch = content.match(/^Thanks,\s+([A-Z][a-z]+)/);
      if (thanksMatch && i < 5) {
        parentName = thanksMatch[1].trim();
      }
    }

    // Pattern: assistant asks "What's your name?" -> next user turn
    if (turn.role === 'assistant' && /what(?:'s| is)\s+your\s+(?:first\s+and\s+last\s+|full\s+)?name/i.test(content) && !parentName) {
      const next = transcript[i + 1];
      if (next?.role === 'user') {
        const nameMatch = next.content.trim().match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
        if (nameMatch) parentName = nameMatch[1].trim();
      }
    }

    // "my name is X" from user
    const myNameMatch = content.match(/my name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (myNameMatch && turn.role === 'user' && !parentName) {
      parentName = myNameMatch[1].trim();
    }

    // Extract dates
    const dateMatch = content.match(dobPattern);
    if (dateMatch) dates.push(dateMatch[1]);
  }

  // Extract child count from "is it two?" or "scheduling consultations for 2 children"
  let explicitChildCount = 0;
  for (const turn of transcript) {
    const countMatch = turn.content.match(/is it (two|three|four|2|3|4)\b/i)
      || turn.content.match(/(\d+)\s+child/i);
    if (countMatch) {
      const numMap: Record<string, number> = { two: 2, three: 3, four: 4 };
      explicitChildCount = numMap[countMatch[1].toLowerCase()] || parseInt(countMatch[1], 10) || 0;
    }
  }

  if (signalCount < 2) return null;

  // Calculate child count: use max of names found, explicit count, or default to 1
  const finalChildCount = Math.max(childNames.length, explicitChildCount, 1);

  // Build summary - distinguish between named children and inferred count
  let summaryChildInfo: string;
  if (childNames.length > 0) {
    summaryChildInfo = `${childNames.length} child${childNames.length !== 1 ? 'ren' : ''} identified: ${childNames.join(', ')}`;
  } else if (explicitChildCount > 0) {
    summaryChildInfo = `${explicitChildCount} child${explicitChildCount !== 1 ? 'ren' : ''} mentioned (names not extracted)`;
  } else {
    summaryChildInfo = `child count inferred as 1 (no names extracted)`;
  }

  return {
    type: 'booking',
    confidence: Math.min(0.85, 0.5 + signalCount * 0.1),
    bookingDetails: {
      childCount: finalChildCount,
      childNames,
      parentName,
      parentPhone: null,
      requestedDates: dates,
    },
    summary: `Transcript-based: booking intent detected (${summaryChildInfo})`,
  };
}

/**
 * Create a fallback intent when classification fails.
 */
function createFallbackIntent(reason: string): CallerIntent {
  return {
    type: 'info_lookup',
    confidence: 0,
    summary: `Fallback classification - ${reason}`,
  };
}

/**
 * Extract child names from tool observations (book_child actions).
 * This captures names that may not have been extracted from transcript text.
 * Prioritizes OUTPUT over INPUT since output contains actual created records.
 */
export function extractChildNamesFromObservations(observations: any[]): { childNames: string[]; parentName: string | null } {
  const childNamesSet = new Set<string>();
  let parentName: string | null = null;

  // Helper to normalize names for deduplication
  const normalizeForComparison = (name: string): string => {
    return name.toLowerCase().replace(/[_\-\s]+/g, '').replace(/parent$/i, '');
  };

  // Helper to check if name is already added (fuzzy match)
  const isDuplicate = (newName: string): boolean => {
    const normalized = normalizeForComparison(newName);
    for (const existing of childNamesSet) {
      const existingNorm = normalizeForComparison(existing);
      // Check if one is prefix of other or they're the same normalized
      if (normalized === existingNorm ||
          normalized.startsWith(existingNorm) ||
          existingNorm.startsWith(normalized)) {
        return true;
      }
    }
    return false;
  };

  for (const obs of observations) {
    // Look for book_child or schedule_appointment tool calls
    if (obs.name?.includes('schedule') || obs.name?.includes('book') || obs.name?.includes('patient')) {
      try {
        // PRIORITIZE OUTPUT - it contains actual created records with correct names
        if (obs.output) {
          const output = typeof obs.output === 'string' ? JSON.parse(obs.output) : obs.output;
          if (output?.children && Array.isArray(output.children)) {
            for (const child of output.children) {
              const firstName = child.firstName || child.first_name;
              if (firstName && !isDuplicate(firstName)) {
                // Use firstName only (lastName often duplicates parent name)
                childNamesSet.add(firstName);
              }
            }
          }
          if (!parentName && output?.parent?.firstName) {
            parentName = output.parent.lastName
              ? `${output.parent.firstName} ${output.parent.lastName}`
              : output.parent.firstName;
          }
        }

        // Only use INPUT if no output was found (fallback)
        if (childNamesSet.size === 0) {
          const input = typeof obs.input === 'string' ? JSON.parse(obs.input) : obs.input;

          if (input?.action === 'book_child' && input?.children) {
            const childrenData = typeof input.children === 'string'
              ? JSON.parse(input.children)
              : input.children;

            if (Array.isArray(childrenData)) {
              for (const child of childrenData) {
                const firstName = child.firstName || child.first_name;
                if (firstName && !isDuplicate(firstName)) {
                  childNamesSet.add(firstName);
                }
              }
            }

            // Extract parent name from input if not found in output
            if (!parentName && input.parentFirstName) {
              parentName = input.parentLastName
                ? `${input.parentFirstName} ${input.parentLastName}`
                : input.parentFirstName;
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  return { childNames: Array.from(childNamesSet), parentName };
}

/**
 * Enhance an intent with child names extracted from tool observations.
 * Tool observations are authoritative - they contain actual created patient names.
 * Transcript names are only used as fallback if no observation names found.
 */
export function enhanceIntentWithObservations(intent: CallerIntent, observations: any[]): CallerIntent {
  if (intent.type !== 'booking') {
    return intent;
  }

  const { childNames: obsChildNames, parentName: obsParentName } = extractChildNamesFromObservations(observations);

  // Tool observations are authoritative - use them if available
  // Only fall back to transcript names if no observation names found
  let finalNames: string[];
  if (obsChildNames.length > 0) {
    // Use observation names only - they're accurate
    finalNames = obsChildNames;
  } else {
    // Fall back to transcript-extracted names
    finalNames = intent.bookingDetails?.childNames || [];
  }

  // Update parent name if not already set
  const parentName = intent.bookingDetails?.parentName || obsParentName;

  // Update child count - use actual names count, or explicit count from intent
  const childCount = Math.max(
    finalNames.length,
    intent.bookingDetails?.childCount || 1
  );

  // Rebuild summary with actual data
  let summaryChildInfo: string;
  if (finalNames.length > 0) {
    summaryChildInfo = `${finalNames.length} child${finalNames.length !== 1 ? 'ren' : ''} identified: ${finalNames.join(', ')}`;
  } else {
    summaryChildInfo = `child count: ${childCount} (names not extracted)`;
  }

  return {
    ...intent,
    bookingDetails: {
      ...intent.bookingDetails,
      childCount,
      childNames: finalNames,
      parentName,
      parentPhone: intent.bookingDetails?.parentPhone || null,
      requestedDates: intent.bookingDetails?.requestedDates || [],
    },
    summary: `Booking intent detected (${summaryChildInfo})`,
  };
}
