/**
 * Agent Report Emitter
 *
 * Shared utility for emitting structured report data from agent scripts.
 * The frontend TerminalEmulator detects these markers in the SSE stream
 * and renders a styled report modal.
 */

const REPORT_JSON_START = '<!-- AGENT_REPORT_JSON -->';
const REPORT_JSON_END = '<!-- END_AGENT_REPORT -->';
const REPORT_MD_START = '<!-- AGENT_REPORT_MD -->';
const REPORT_MD_END = '<!-- END_AGENT_REPORT_MD -->';

/**
 * Emit a structured agent report.
 *
 * @param {object} jsonData - Structured report data conforming to AgentReport schema
 * @param {string} [markdownText] - Optional markdown narrative
 */
function emitReport(jsonData, markdownText) {
  // Ensure required fields
  if (!jsonData.timestamp) {
    jsonData.timestamp = new Date().toISOString();
  }

  console.log(REPORT_JSON_START + JSON.stringify(jsonData) + REPORT_JSON_END);

  if (markdownText) {
    console.log(REPORT_MD_START + markdownText + REPORT_MD_END);
  }
}

/**
 * Build a standard report object from common trace analysis data.
 */
function buildTraceReport({ agent, sessionId, status, summary, failurePatterns, timeline, rootCause, recommendations, diagnostics, actionableSteps }) {
  const report = {
    agent: agent || 'unknown',
    sessionId: sessionId || '',
    timestamp: new Date().toISOString(),
    status: status || 'success',
    summary: summary || {},
    failurePatterns: failurePatterns || [],
    timeline: timeline || [],
    rootCause: rootCause || null,
    recommendations: recommendations || []
  };
  if (diagnostics) {
    report.diagnostics = diagnostics;
  }
  if (actionableSteps && actionableSteps.length > 0) {
    report.actionableSteps = actionableSteps;
  }
  return report;
}

module.exports = { emitReport, buildTraceReport };
