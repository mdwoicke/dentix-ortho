/**
 * Diagnostic Orchestrator
 *
 * Routes failed production traces to the appropriate expert agent(s)
 * based on StepStatus data from the tool sequence mapper.
 * Combines results from multiple experts into a unified DiagnosticReport.
 */

import BetterSqlite3 from 'better-sqlite3';
import { ExpertAgentService, ExpertAgentType, ExpertAnalysisResult } from './expertAgentService';
import { StepStatus } from './toolSequenceMapper';

// ============================================================================
// Types
// ============================================================================

export interface DiagnosticRequest {
  traceId: string;
  sessionId: string;
  transcript: string;
  apiErrors: string[];
  stepStatuses: StepStatus[];
  failureTimestamp?: string;
}

export interface DiagnosticReport {
  sessionId: string;
  traceId: string;
  agents: ExpertAnalysisResult[];
  combinedMarkdown: string;
  overallConfidence: number;
  deployCorrelation?: DeployCorrelation[];
}

export interface DeployCorrelation {
  artifactKey: string;
  version: number;
  deployedAt: string;
  deltaMinutes: number;
}

// ============================================================================
// Routing Rules
// ============================================================================

/**
 * Determine which expert agents should analyze this failure based on StepStatus data.
 * Multiple agents can be selected when failures span domains.
 */
function determineExperts(request: DiagnosticRequest): ExpertAgentType[] {
  const agents: Set<ExpertAgentType> = new Set();
  const { stepStatuses, apiErrors } = request;

  // Check step statuses for domain-specific failures
  for (const ss of stepStatuses) {
    const stepName = ss.step.toolName.toLowerCase();
    const hasFailure = ss.status === 'failed' || ss.status === 'missing';

    if (!hasFailure) continue;

    if (stepName.includes('patient') || ss.step.action === 'lookup' || ss.step.action === 'create_patient') {
      agents.add('patient_tool');
    }

    if (stepName.includes('schedule') || stepName.includes('appointment') ||
        ss.step.action === 'slots' || ss.step.action === 'book_child' || ss.step.action === 'cancel') {
      agents.add('scheduling_tool');
    }
  }

  // API errors suggest Node-RED flow issues
  if (apiErrors.length > 0) {
    agents.add('nodered_flow');
  }

  // Low completion rate suggests system prompt issues (wrong tool invocation, missing data gathering)
  if (stepStatuses.length > 0) {
    const required = stepStatuses.filter(s => !s.step.optional || s.status !== 'missing');
    const completed = required.filter(s => s.status === 'completed');
    const completionRate = required.length > 0 ? completed.length / required.length : 0;

    if (completionRate < 0.5) {
      agents.add('system_prompt');
    }
  }

  // Fallback: if no specific agent identified, use system_prompt
  if (agents.size === 0) {
    agents.add('system_prompt');
  }

  return Array.from(agents);
}

// ============================================================================
// Diagnostic Orchestrator
// ============================================================================

export class DiagnosticOrchestrator {
  private db: BetterSqlite3.Database;
  private expertService: ExpertAgentService;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
    this.expertService = new ExpertAgentService(db);
  }

  /**
   * Diagnose a failed trace by routing to relevant expert agents.
   * Returns a combined report from all invoked experts.
   */
  async diagnose(request: DiagnosticRequest): Promise<DiagnosticReport> {
    const agentTypes = determineExperts(request);

    console.log(`[DiagnosticOrchestrator] Routing trace ${request.traceId} to experts: ${agentTypes.join(', ')}`);

    // Run experts sequentially to avoid rate limiting
    const agents: ExpertAnalysisResult[] = [];
    for (const agentType of agentTypes) {
      try {
        const result = await this.expertService.analyze({
          agentType,
          traceContext: {
            transcript: request.transcript,
            apiErrors: request.apiErrors,
            stepStatuses: request.stepStatuses.map(ss => ({
              step: ss.step.toolName + (ss.step.action ? `:${ss.step.action}` : ''),
              status: ss.status,
              detail: ss.errors.length > 0 ? ss.errors.join('; ') : undefined,
            })),
          },
        });
        agents.push(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[DiagnosticOrchestrator] Expert ${agentType} failed: ${msg}`);
      }
    }

    // Overall confidence = max of individual confidences
    const overallConfidence = agents.length > 0
      ? Math.max(...agents.map(a => a.confidence))
      : 0;

    // Correlate deploy versions if failure timestamp provided
    let deployCorrelation: DeployCorrelation[] | undefined;
    if (request.failureTimestamp) {
      deployCorrelation = [];
      for (const agent of agents) {
        const corr = this.correlateDeployVersions(agent.affectedArtifact.fileKey, request.failureTimestamp);
        if (corr) deployCorrelation.push(corr);
      }
      if (deployCorrelation.length === 0) deployCorrelation = undefined;
    }

    // Build combined markdown
    const combinedMarkdown = this.buildCombinedMarkdown(agents, overallConfidence);

    return {
      sessionId: request.sessionId,
      traceId: request.traceId,
      agents,
      combinedMarkdown,
      overallConfidence,
      deployCorrelation,
    };
  }

  /**
   * Correlate a failure timestamp with the most recent deploy of an artifact.
   */
  correlateDeployVersions(artifactKey: string, timestamp: string): DeployCorrelation | null {
    try {
      const row = this.db.prepare(`
        SELECT artifact_key, version, deployed_at
        FROM artifact_deploy_events
        WHERE artifact_key = ? AND deployed_at <= ?
        ORDER BY deployed_at DESC
        LIMIT 1
      `).get(artifactKey, timestamp) as { artifact_key: string; version: number; deployed_at: string } | undefined;

      if (!row) return null;

      const failureTime = new Date(timestamp).getTime();
      const deployTime = new Date(row.deployed_at).getTime();
      const deltaMinutes = Math.round((failureTime - deployTime) / 60000);

      return {
        artifactKey: row.artifact_key,
        version: row.version,
        deployedAt: row.deployed_at,
        deltaMinutes,
      };
    } catch {
      return null;
    }
  }

  /**
   * Build combined markdown from all expert results.
   */
  private buildCombinedMarkdown(agents: ExpertAnalysisResult[], overallConfidence: number): string {
    if (agents.length === 0) {
      return '## Diagnostic Report\n\nNo expert agents produced results.';
    }

    const sections: string[] = [
      `## Diagnostic Report`,
      `**Overall Confidence:** ${overallConfidence}%`,
      `**Experts Consulted:** ${agents.map(a => a.agentType).join(', ')}`,
      '',
    ];

    for (const agent of agents) {
      sections.push(`### ${agent.agentType} Expert`);
      sections.push(`**Confidence:** ${agent.confidence}%`);
      sections.push(`**Root Cause:** ${agent.rootCause.type}`);
      if (agent.rootCause.evidence.length > 0) {
        sections.push(`**Evidence:**`);
        for (const e of agent.rootCause.evidence) {
          sections.push(`- ${e}`);
        }
      }
      sections.push('');
      sections.push(agent.diagnosticMarkdown);
      if (agent.unifiedDiff) {
        sections.push('');
        sections.push(`#### Suggested Changes${agent.isPartialDiff ? ' (partial)' : ''}`);
        sections.push('');
        sections.push('```diff');
        sections.push(agent.unifiedDiff);
        sections.push('```');
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }

    return sections.join('\n');
  }
}
