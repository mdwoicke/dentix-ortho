/**
 * Caller Intent Classifier Service
 *
 * Analyzes orthodontic appointment scheduling call transcripts to classify
 * the caller's primary intent and extract relevant booking details.
 * Uses Anthropic Claude 3.5 Haiku via direct HTTP fetch.
 */

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[CallerIntentClassifier] ANTHROPIC_API_KEY not set, returning fallback');
    return {
      type: 'info_lookup',
      confidence: 0,
      summary: 'Classification unavailable - no API key configured',
    };
  }

  // Build transcript text
  const transcriptText = transcript
    .map((turn) => `[${turn.role}]: ${turn.content}`)
    .join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 512,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: transcriptText,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CallerIntentClassifier] Anthropic API error: ${response.status} - ${errorText}`);
      return createFallbackIntent('LLM API error');
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock?.text) {
      return createFallbackIntent('No text in LLM response');
    }

    return parseLlmResponse(textBlock.text);
  } catch (error: any) {
    console.error('[CallerIntentClassifier] Classification failed:', error.message);
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
 * Create a fallback intent when classification fails.
 */
function createFallbackIntent(reason: string): CallerIntent {
  return {
    type: 'info_lookup',
    confidence: 0,
    summary: `Fallback classification - ${reason}`,
  };
}
