/**
 * Expert Agent Service
 * Four domain-specific LLM agents for root cause analysis of failed calls.
 * Each agent specializes in one V1 artifact and produces structured diagnosis.
 */

import BetterSqlite3 from 'better-sqlite3';
import { createTwoFilesPatch } from 'diff';
import { getLLMProvider } from '../../../shared/services/llm-provider';

// ============================================================================
// Types
// ============================================================================

export type ExpertAgentType = 'nodered_flow' | 'patient_tool' | 'scheduling_tool' | 'system_prompt';

export interface ExpertAnalysisResult {
  agentType: ExpertAgentType;
  rootCause: {
    type: string;
    evidence: string[];
  };
  affectedArtifact: {
    fileKey: string;
    currentVersion: number | null;
  };
  confidence: number; // 0-100
  summary: string;
  suggestedCode: string | null;
  diagnosticMarkdown: string;
  unifiedDiff?: string;
  isPartialDiff?: boolean;
}

export interface ExpertAgentRequest {
  agentType: ExpertAgentType;
  traceContext: {
    transcript: string;
    apiErrors: string[];
    stepStatuses: Array<{ step: string; status: string; detail?: string }>;
  };
  freeformContext?: string;
}

// ============================================================================
// Domain System Prompts
// ============================================================================

const NODERED_FLOW_EXPERT_PROMPT = `You are an expert diagnostician for Node-RED flows that orchestrate Cloud9 Ortho API calls.

You specialize in:
- Flow routing logic (how messages move between nodes)
- Session cache management (Redis-based slot caching, pregrouped cache, cache refresh)
- Cloud9 API orchestration (XML request building, response parsing, error handling)
- Chair selection logic (schedule view GUIDs, column GUIDs, multi-chair booking)
- Slot grouping and tier-based search (40-min grouping, tier1/tier2/tier3 fallback)
- Cache refresh triggers (force refresh, TTL expiry, manual invalidation)
- Reservation system (atomic slot reservation, expiry, conflict detection)

When analyzing a failure, look for:
1. Incorrect routing (message sent to wrong node or missing connection)
2. Cache staleness (slots returned from cache that are already booked)
3. API parameter errors (wrong GUIDs, malformed XML, missing required fields)
4. Session state corruption (flow context not properly maintained between calls)
5. Race conditions (concurrent bookings, cache refresh during read)

Output your analysis as JSON with the ExpertAnalysisResult schema.`;

const PATIENT_TOOL_EXPERT_PROMPT = `You are an expert diagnostician for the Patient Tool (Flowise tool that handles patient operations via Node-RED).

You specialize in:
- Patient lookup (GetPortalPatientLookup, name matching, fuzzy search)
- Patient creation (SetPatient, required fields, provider/location GUIDs)
- Family linkage (responsible party matching, parent-child relationships)
- Sibling handling (detecting existing family members, linking to same responsible party)
- Patient demographics (address, phone, email, birthdate parsing)
- Error recovery (duplicate patient detection, partial creation rollback)

When analyzing a failure, look for:
1. Patient not found (typos in name, wrong lookup method, inactive patient)
2. Creation failures (missing required fields, invalid GUIDs, duplicate detection)
3. Family linkage errors (wrong responsible party, orphaned patient records)
4. Sibling booking issues (children array not populated, wrong family grouping)
5. Data format mismatches (date formats, phone number formats, name casing)

Output your analysis as JSON with the ExpertAnalysisResult schema.`;

const SCHEDULING_TOOL_EXPERT_PROMPT = `You are an expert diagnostician for the Scheduling Tool (Flowise tool that handles appointment operations via Node-RED).

You specialize in:
- Slot search tiers (tier1: preferred chair+time, tier2: any chair+time, tier3: extended date range)
- Booking flow (GetOnlineReservations -> select slot -> SetAppointment)
- Reservation logic (atomic reservation, slot locking, expiry handling)
- Multi-child scheduling (sequential booking, different appointment types per child)
- Appointment types (consultation vs treatment, duration mapping)
- Time window handling (business hours, 28-week limit, date range validation)
- Chair/provider mapping (schedule view GUIDs to physical chairs)

When analyzing a failure, look for:
1. No slots available (all tiers exhausted, date range too narrow, wrong appointment type)
2. Booking failures (slot already taken, reservation expired, invalid parameters)
3. Tier search issues (wrong tier progression, cache returning stale slots)
4. Multi-child conflicts (overlapping times, same chair double-booked)
5. Parameter errors (wrong appointment type GUID, invalid date format, missing patient GUID)

Output your analysis as JSON with the ExpertAnalysisResult schema.`;

const SYSTEM_PROMPT_EXPERT_PROMPT = `You are an expert diagnostician for the IVA System Prompt (Allie - the orthodontic practice virtual assistant).

You specialize in:
- Conversation flow design (greeting, data gathering, booking confirmation)
- Data gathering sequences (name, DOB, phone, insurance, appointment preference)
- Persona rules (tone, language, response length, escalation triggers)
- Multi-patient handling (parent calling for children, sibling groups)
- Edge case handling (existing patients, cancellations, rescheduling)
- Tool invocation guidance (when to call patient_tool vs scheduling_tool)

When analyzing a failure, look for:
1. Wrong tool invocation (prompt tells LLM to call wrong tool or with wrong params)
2. Missing data gathering (prompt doesn't instruct to collect required info before booking)
3. Conversation dead-ends (no recovery path when user gives unexpected input)
4. Persona violations (too verbose, wrong tone, missing empathy)
5. Multi-patient confusion (mixing up children, losing track of which child is being booked)

Output your analysis as JSON with the ExpertAnalysisResult schema.`;

const DOMAIN_PROMPTS: Record<ExpertAgentType, string> = {
  nodered_flow: NODERED_FLOW_EXPERT_PROMPT,
  patient_tool: PATIENT_TOOL_EXPERT_PROMPT,
  scheduling_tool: SCHEDULING_TOOL_EXPERT_PROMPT,
  system_prompt: SYSTEM_PROMPT_EXPERT_PROMPT,
};

const FILE_KEY_MAP: Record<ExpertAgentType, string> = {
  nodered_flow: 'nodered_flow',
  patient_tool: 'patient_tool',
  scheduling_tool: 'scheduling_tool',
  system_prompt: 'system_prompt',
};

// ============================================================================
// Expert Agent Service
// ============================================================================

export class ExpertAgentService {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  /**
   * Load the current artifact content for a given agent type from prompt_working_copies.
   */
  loadArtifact(agentType: ExpertAgentType): string {
    const fileKey = FILE_KEY_MAP[agentType];

    const row = this.db.prepare(
      'SELECT content, version FROM prompt_working_copies WHERE file_key = ?'
    ).get(fileKey) as { content: string; version: number } | undefined;

    if (!row || !row.content) {
      console.warn(`[ExpertAgent] No artifact found for file_key="${fileKey}". Returning empty.`);
      return '';
    }

    let content = row.content;

    // Truncate large artifacts (Node-RED flows can be huge)
    if (agentType === 'nodered_flow' && content.length > 15000) {
      content = content.substring(0, 15000) + '\n... [truncated at 15000 chars]';
    }

    return content;
  }

  /**
   * Get the current version number for an artifact.
   */
  private getArtifactVersion(agentType: ExpertAgentType): number | null {
    const fileKey = FILE_KEY_MAP[agentType];
    const row = this.db.prepare(
      'SELECT version FROM prompt_working_copies WHERE file_key = ?'
    ).get(fileKey) as { version: number } | undefined;
    return row?.version ?? null;
  }

  /**
   * Analyze a failure using the domain-specific expert agent.
   */
  async analyze(request: ExpertAgentRequest): Promise<ExpertAnalysisResult> {
    const { agentType, traceContext, freeformContext } = request;

    const artifact = this.loadArtifact(agentType);
    const version = this.getArtifactVersion(agentType);
    const systemPrompt = DOMAIN_PROMPTS[agentType];

    const userPrompt = this.buildAnalysisPrompt(agentType, artifact, traceContext, freeformContext);

    try {
      const llm = getLLMProvider();
      const response = await llm.execute({
        systemPrompt,
        prompt: userPrompt,
        temperature: 0.2,
        maxTokens: 4000,
        purpose: 'failure-analysis',
      });

      if (!response.success || !response.content) {
        return this.fallbackResult(agentType, version, response.error || 'LLM returned no content');
      }

      const result = this.parseAnalysis(agentType, version, response.content);
      this.attachDiff(result, artifact);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ExpertAgent] analyze() failed for ${agentType}: ${message}`);
      return this.fallbackResult(agentType, version, message);
    }
  }

  /**
   * Standalone analysis with freeform context (no trace context required).
   */
  async analyzeStandalone(
    agentType: ExpertAgentType,
    context: string
  ): Promise<ExpertAnalysisResult> {
    return this.analyze({
      agentType,
      traceContext: { transcript: '', apiErrors: [], stepStatuses: [] },
      freeformContext: context,
    });
  }

  /**
   * Attach a unified diff to the analysis result when suggestedCode is present.
   * If the suggestion is partial (less than 50% of original or missing file-level markers),
   * wrap it in a formatted comment block instead.
   */
  private attachDiff(result: ExpertAnalysisResult, currentArtifact: string): void {
    if (!result.suggestedCode || !currentArtifact) return;

    const suggested = result.suggestedCode;
    const fileKey = result.affectedArtifact.fileKey;

    // Detect partial: too short or lacks file-level markers
    const isPartial =
      suggested.length < currentArtifact.length * 0.5 ||
      !(
        /^(import |require\(|const |let |var |export |function |\/\/ |\/\*|#|\<)/.test(suggested.trim())
      );

    if (isPartial) {
      result.isPartialDiff = true;
      result.unifiedDiff = [
        `--- Suggested change for ${fileKey} (partial) ---`,
        '```',
        suggested,
        '```',
        '--- End suggested change ---',
      ].join('\n');
    } else {
      result.isPartialDiff = false;
      try {
        result.unifiedDiff = createTwoFilesPatch(
          fileKey,
          fileKey,
          currentArtifact,
          suggested,
          'current',
          'proposed'
        );
      } catch {
        // Fallback if diff generation fails
        result.unifiedDiff = [
          `--- ${fileKey} (current)`,
          `+++ ${fileKey} (proposed)`,
          '',
          suggested,
        ].join('\n');
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private buildAnalysisPrompt(
    agentType: ExpertAgentType,
    artifact: string,
    traceContext: ExpertAgentRequest['traceContext'],
    freeformContext?: string
  ): string {
    const sections: string[] = [];

    sections.push(`## Current ${agentType} Artifact\n\`\`\`\n${artifact || '(not available)'}\n\`\`\``);

    if (traceContext.transcript) {
      sections.push(`## Conversation Transcript\n${traceContext.transcript}`);
    }

    if (traceContext.apiErrors.length > 0) {
      sections.push(`## API Errors\n${traceContext.apiErrors.map(e => `- ${e}`).join('\n')}`);
    }

    if (traceContext.stepStatuses.length > 0) {
      const rows = traceContext.stepStatuses
        .map(s => `| ${s.step} | ${s.status} | ${s.detail || ''} |`)
        .join('\n');
      sections.push(`## Step Statuses\n| Step | Status | Detail |\n|------|--------|--------|\n${rows}`);
    }

    if (freeformContext) {
      sections.push(`## Additional Context\n${freeformContext}`);
    }

    sections.push(`## Instructions
Analyze the failure and respond with ONLY a JSON object (no markdown fences) matching this schema:
{
  "rootCause": { "type": "string", "evidence": ["string"] },
  "confidence": 0-100,
  "summary": "one paragraph",
  "suggestedCode": "code string or null",
  "diagnosticMarkdown": "markdown analysis",
  "unifiedDiff": "optional unified diff",
  "isPartialDiff": false
}`);

    return sections.join('\n\n');
  }

  private parseAnalysis(
    agentType: ExpertAgentType,
    version: number | null,
    raw: string
  ): ExpertAnalysisResult {
    try {
      // Strip markdown fences if present
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      return {
        agentType,
        rootCause: {
          type: parsed.rootCause?.type || 'unknown',
          evidence: Array.isArray(parsed.rootCause?.evidence) ? parsed.rootCause.evidence : [],
        },
        affectedArtifact: {
          fileKey: FILE_KEY_MAP[agentType],
          currentVersion: version,
        },
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
        summary: parsed.summary || 'Analysis completed but no summary provided.',
        suggestedCode: parsed.suggestedCode || null,
        diagnosticMarkdown: parsed.diagnosticMarkdown || parsed.summary || '',
        unifiedDiff: parsed.unifiedDiff,
        isPartialDiff: parsed.isPartialDiff,
      };
    } catch (_parseErr: unknown) {
      // LLM returned non-JSON; wrap raw text as diagnostic
      return {
        agentType,
        rootCause: { type: 'unparseable-response', evidence: [raw.substring(0, 200)] },
        affectedArtifact: { fileKey: FILE_KEY_MAP[agentType], currentVersion: version },
        confidence: 30,
        summary: 'LLM response could not be parsed as JSON.',
        suggestedCode: null,
        diagnosticMarkdown: raw,
      };
    }
  }

  private fallbackResult(
    agentType: ExpertAgentType,
    version: number | null,
    error: string
  ): ExpertAnalysisResult {
    return {
      agentType,
      rootCause: { type: 'analysis-error', evidence: [error] },
      affectedArtifact: { fileKey: FILE_KEY_MAP[agentType], currentVersion: version },
      confidence: 0,
      summary: `Expert agent analysis failed: ${error}`,
      suggestedCode: null,
      diagnosticMarkdown: `**Error:** ${error}`,
    };
  }
}
