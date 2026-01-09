/**
 * Error Clustering Service
 *
 * Analyzes test failures and groups them by similarity patterns.
 * Enables debugging 10 similar failures as 1 pattern instead of individually.
 */

import BetterSqlite3 from 'better-sqlite3';

export interface Finding {
  id: number;
  runId: string;
  testId: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  affectedStep: string;
  agentQuestion: string;
  expectedBehavior: string;
  actualBehavior: string;
  recommendation: string;
  status: string;
  createdAt: string;
}

export interface ErrorCluster {
  clusterId: string;
  pattern: string;
  patternType: 'timeout' | 'api_error' | 'validation' | 'prompt_issue' | 'tool_issue' | 'unknown';
  count: number;
  severity: string;
  affectedTests: string[];
  affectedTestNames: string[];
  sampleFinding: Finding;
  rootCauseHypothesis: string;
  suggestedAction: string;
  findings: Finding[];
}

export interface ClusteringResult {
  runId: string;
  totalFindings: number;
  totalClusters: number;
  clusters: ErrorCluster[];
  unclustered: Finding[];
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score between two strings (0-1, higher is more similar)
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - (distance / maxLen);
}

/**
 * Extract pattern type from finding
 */
function extractPatternType(finding: Finding): ErrorCluster['patternType'] {
  const text = `${finding.title} ${finding.description} ${finding.actualBehavior}`.toLowerCase();

  if (text.includes('timeout') || text.includes('timed out')) {
    return 'timeout';
  }
  if (text.includes('api') || text.includes('500') || text.includes('error code') || text.includes('network')) {
    return 'api_error';
  }
  if (text.includes('validation') || text.includes('expected') || text.includes('mismatch')) {
    return 'validation';
  }
  if (finding.type === 'prompt-issue') {
    return 'prompt_issue';
  }
  if (finding.type === 'tool-issue') {
    return 'tool_issue';
  }
  return 'unknown';
}

/**
 * Generate a pattern identifier from finding
 */
function generatePatternId(finding: Finding): string {
  const type = extractPatternType(finding);
  const titleWords = (finding.title || '').toLowerCase().split(/\s+/).slice(0, 3).join('_');
  return `${type}_${titleWords}`.replace(/[^a-z0-9_]/g, '');
}

/**
 * Generate root cause hypothesis based on cluster pattern
 */
function generateRootCauseHypothesis(cluster: ErrorCluster): string {
  switch (cluster.patternType) {
    case 'timeout':
      return 'The Flowise API or underlying Cloud9 API is responding slowly or timing out. This could be due to rate limiting, server load, or network issues.';
    case 'api_error':
      return 'API calls are failing with errors. Check Cloud9 API credentials, endpoint availability, and request payload formatting.';
    case 'validation':
      return 'Bot responses are not matching expected patterns. The system prompt or tool behavior may need adjustment for these scenarios.';
    case 'prompt_issue':
      return 'The system prompt is not handling these scenarios correctly. Review prompt instructions for handling this type of user input.';
    case 'tool_issue':
      return 'The Flowise tool is producing incorrect results. Review the tool JavaScript code and API integration logic.';
    default:
      return 'Review the sample finding details to identify the root cause pattern.';
  }
}

/**
 * Generate suggested action based on cluster pattern
 */
function generateSuggestedAction(cluster: ErrorCluster): string {
  switch (cluster.patternType) {
    case 'timeout':
      return 'Increase timeout settings, add retry logic, or investigate Flowise/Cloud9 API performance.';
    case 'api_error':
      return 'Check API credentials and connectivity. Review error responses for specific failure details.';
    case 'validation':
      return 'Update system prompt to better handle these user inputs, or adjust test expectations if behavior is acceptable.';
    case 'prompt_issue':
      return 'Edit the system prompt (docs/v1/Chord_Cloud9_SystemPrompt.md) to address this scenario.';
    case 'tool_issue':
      return 'Review and update the Flowise tool code to handle this case correctly.';
    default:
      return 'Analyze the sample finding to determine the appropriate fix.';
  }
}

/**
 * Cluster findings by similarity
 */
export function clusterFindings(findings: Finding[], similarityThreshold: number = 0.6): ErrorCluster[] {
  if (findings.length === 0) return [];

  const clusters: Map<string, ErrorCluster> = new Map();
  const assignedFindings: Set<number> = new Set();

  // Sort findings by type and severity for better clustering
  const sortedFindings = [...findings].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.severity.localeCompare(b.severity);
  });

  for (const finding of sortedFindings) {
    if (assignedFindings.has(finding.id)) continue;

    // Try to find an existing cluster that matches
    let matchedCluster: ErrorCluster | null = null;
    let bestSimilarity = 0;

    for (const cluster of clusters.values()) {
      // Compare with sample finding
      const titleSimilarity = stringSimilarity(finding.title, cluster.sampleFinding.title);
      const descSimilarity = stringSimilarity(finding.description, cluster.sampleFinding.description);
      const typeSimilarity = finding.type === cluster.sampleFinding.type ? 1 : 0;

      // Weighted similarity score
      const similarity = (titleSimilarity * 0.4) + (descSimilarity * 0.3) + (typeSimilarity * 0.3);

      if (similarity > similarityThreshold && similarity > bestSimilarity) {
        matchedCluster = cluster;
        bestSimilarity = similarity;
      }
    }

    if (matchedCluster) {
      // Add to existing cluster
      matchedCluster.count++;
      matchedCluster.findings.push(finding);
      if (!matchedCluster.affectedTests.includes(finding.testId)) {
        matchedCluster.affectedTests.push(finding.testId);
      }
      assignedFindings.add(finding.id);
    } else {
      // Create new cluster
      const patternType = extractPatternType(finding);
      const clusterId = `cluster_${generatePatternId(finding)}_${Date.now()}`;

      const newCluster: ErrorCluster = {
        clusterId,
        pattern: finding.title || 'Unknown Pattern',
        patternType,
        count: 1,
        severity: finding.severity,
        affectedTests: [finding.testId],
        affectedTestNames: [],
        sampleFinding: finding,
        rootCauseHypothesis: '',
        suggestedAction: '',
        findings: [finding],
      };

      newCluster.rootCauseHypothesis = generateRootCauseHypothesis(newCluster);
      newCluster.suggestedAction = generateSuggestedAction(newCluster);

      clusters.set(clusterId, newCluster);
      assignedFindings.add(finding.id);
    }
  }

  // Sort clusters by count (most common first) and severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  return Array.from(clusters.values()).sort((a, b) => {
    // First by severity
    const sevA = severityOrder[a.severity] ?? 4;
    const sevB = severityOrder[b.severity] ?? 4;
    if (sevA !== sevB) return sevA - sevB;
    // Then by count (descending)
    return b.count - a.count;
  });
}

/**
 * Get error clusters for a specific test run
 */
export function getErrorClustersForRun(db: BetterSqlite3.Database, runId: string): ClusteringResult {
  // Get all findings for the run
  const findingRows = db.prepare(`
    SELECT
      f.id, f.run_id, f.test_id, f.type, f.severity, f.title, f.description,
      f.affected_step, f.agent_question, f.expected_behavior, f.actual_behavior,
      f.recommendation, f.status, f.created_at
    FROM findings f
    WHERE f.run_id = ?
    ORDER BY f.created_at DESC
  `).all(runId) as any[];

  const findings: Finding[] = findingRows.map(row => ({
    id: row.id,
    runId: row.run_id,
    testId: row.test_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    affectedStep: row.affected_step,
    agentQuestion: row.agent_question,
    expectedBehavior: row.expected_behavior,
    actualBehavior: row.actual_behavior,
    recommendation: row.recommendation,
    status: row.status,
    createdAt: row.created_at,
  }));

  // Get test names for affected tests
  const testNames: Map<string, string> = new Map();
  const testNameRows = db.prepare(`
    SELECT test_id, test_name FROM test_results WHERE run_id = ?
  `).all(runId) as any[];

  for (const row of testNameRows) {
    testNames.set(row.test_id, row.test_name);
  }

  // Cluster the findings
  const clusters = clusterFindings(findings);

  // Add test names to clusters
  for (const cluster of clusters) {
    cluster.affectedTestNames = cluster.affectedTests.map(
      testId => testNames.get(testId) || testId
    );
  }

  return {
    runId,
    totalFindings: findings.length,
    totalClusters: clusters.length,
    clusters,
    unclustered: [], // All findings are clustered (single-item clusters for unique errors)
  };
}

/**
 * Get aggregated error clusters across multiple runs
 */
export function getErrorClustersAcrossRuns(
  db: BetterSqlite3.Database,
  runIds: string[]
): ClusteringResult {
  if (runIds.length === 0) {
    return {
      runId: 'aggregate',
      totalFindings: 0,
      totalClusters: 0,
      clusters: [],
      unclustered: [],
    };
  }

  const placeholders = runIds.map(() => '?').join(',');

  const findingRows = db.prepare(`
    SELECT
      f.id, f.run_id, f.test_id, f.type, f.severity, f.title, f.description,
      f.affected_step, f.agent_question, f.expected_behavior, f.actual_behavior,
      f.recommendation, f.status, f.created_at
    FROM findings f
    WHERE f.run_id IN (${placeholders})
    ORDER BY f.created_at DESC
  `).all(...runIds) as any[];

  const findings: Finding[] = findingRows.map(row => ({
    id: row.id,
    runId: row.run_id,
    testId: row.test_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    affectedStep: row.affected_step,
    agentQuestion: row.agent_question,
    expectedBehavior: row.expected_behavior,
    actualBehavior: row.actual_behavior,
    recommendation: row.recommendation,
    status: row.status,
    createdAt: row.created_at,
  }));

  const clusters = clusterFindings(findings);

  return {
    runId: 'aggregate',
    totalFindings: findings.length,
    totalClusters: clusters.length,
    clusters,
    unclustered: [],
  };
}
