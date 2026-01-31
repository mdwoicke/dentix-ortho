/**
 * Agent Report Modal
 * Renders structured agent report data in a styled modal
 */

import { useState, useCallback } from 'react';
import { Modal } from '../../ui/Modal';
import { Badge } from '../../ui/Badge';
import type { AgentReportData } from './TerminalEmulator';

interface AgentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: AgentReportData | null;
}

const severityVariant: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'default',
};

const statusVariant: Record<string, 'success' | 'danger' | 'warning'> = {
  success: 'success',
  failure: 'danger',
  warning: 'warning',
};

const timelineStatusColor: Record<string, string> = {
  ok: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
};

function openJsonPopout(title: string, json: unknown) {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  const content = JSON.stringify(json, null, 2);
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{margin:0;padding:16px;background:#1e1e1e;color:#d4d4d4;font-family:"Cascadia Code","Fira Code",Consolas,monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;}</style></head><body>${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</body></html>`);
  win.document.close();
}

export function AgentReportModal({ isOpen, onClose, report }: AgentReportModalProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!report) return null;

  const { json: data, markdown } = report;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agent Report" size="xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {data.agent}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {data.sessionId}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {new Date(data.timestamp).toLocaleString()}
            </p>
          </div>
          <Badge variant={statusVariant[data.status] || 'default'} size="md">
            {data.status.toUpperCase()}
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Tool Calls" value={data.summary.toolCalls} />
          <SummaryCard label="Errors" value={data.summary.errors} variant={data.summary.errors > 0 ? 'danger' : 'default'} />
          <SummaryCard label="Duration" value={data.summary.duration} />
          {data.summary.bookings !== undefined && (
            <SummaryCard
              label="Bookings"
              value={`${data.summary.bookingsSucceeded ?? 0}/${data.summary.bookings}`}
              variant={(data.summary.bookingsFailed as number) > 0 ? 'warning' : 'default'}
            />
          )}
        </div>

        {/* Failure Patterns */}
        {data.failurePatterns && data.failurePatterns.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Failure Patterns
            </h4>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Code</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Pattern</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Severity</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.failurePatterns.map((fp, i) => (
                    <tr key={i} className="bg-white dark:bg-gray-900">
                      <td className="px-3 py-2 font-mono text-xs">{fp.code}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{fp.name}</td>
                      <td className="px-3 py-2">
                        <Badge variant={severityVariant[fp.severity] || 'default'} size="sm">
                          {fp.severity}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">{fp.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Data Issues */}
        {data.diagnostics?.dataIssues && data.diagnostics.dataIssues.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Data Issues
            </h4>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Field</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Expected</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actual</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.diagnostics.dataIssues.map((issue, i) => (
                    <tr key={i} className="bg-white dark:bg-gray-900">
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">{issue.field}</td>
                      <td className="px-3 py-2 text-xs text-green-700 dark:text-green-400">{issue.expected}</td>
                      <td className="px-3 py-2 text-xs text-red-700 dark:text-red-400 font-mono">{issue.actual}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{issue.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Key Tool Calls */}
        {data.diagnostics?.toolCalls && data.diagnostics.toolCalls.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Key Tool Calls
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data.diagnostics.toolCalls.map((tc, i) => (
                <ToolCallCard key={i} toolCall={tc} />
              ))}
            </div>
          </div>
        )}

        {/* Conversation Excerpts */}
        {data.diagnostics?.conversationExcerpts && data.diagnostics.conversationExcerpts.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Conversation Excerpts
            </h4>
            <div className="space-y-2">
              {data.diagnostics.conversationExcerpts.map((excerpt, i) => (
                <div key={i} className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 py-2">
                  {excerpt.issue && (
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">{excerpt.issue}</p>
                  )}
                  <blockquote className="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {excerpt.content}
                  </blockquote>
                  <p className="text-xs text-gray-400 mt-1">Role: {excerpt.role}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        {data.timeline && data.timeline.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Timeline
            </h4>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.timeline.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${timelineStatusColor[entry.status] || 'bg-gray-400'}`} />
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">{entry.time}</span>
                  <span className="text-gray-900 dark:text-gray-100">{entry.action}</span>
                  {entry.detail && (
                    <span className="text-gray-500 dark:text-gray-400 text-xs truncate">{entry.detail}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Root Cause */}
        {data.rootCause && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Root Cause
            </h4>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-300">{data.rootCause}</p>
            </div>
          </div>
        )}

        {/* Actionable Next Steps */}
        {data.actionableSteps && data.actionableSteps.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Next Steps
            </h4>
            <div className="space-y-3">
              {data.actionableSteps.map((s) => (
                <div key={s.step} className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">{s.step}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.action}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{s.detail}</p>
                    {s.command && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <pre className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded font-mono overflow-auto max-w-full">{s.command}</pre>
                        <button
                          onClick={() => navigator.clipboard.writeText(s.command!)}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
                          title="Copy command"
                        >&#x2398;</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : data.recommendations && data.recommendations.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Recommendations
            </h4>
            <ul className="space-y-1">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-primary-500 mt-0.5">-</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Narrative (rendered HTML) */}
        {markdown && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Narrative
            </h4>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <RenderedMarkdown content={markdown} />
            </div>
          </div>
        )}

        {/* Raw JSON Toggle */}
        <div>
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            {showRawJson ? 'Hide' : 'Show'} Raw JSON
          </button>
          {showRawJson && (
            <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-auto max-h-64 font-mono">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Lightweight markdown-to-HTML renderer.
 * Handles: ## headings, **bold**, `code`, ```code blocks```, bullet lists, and paragraphs.
 */
function RenderedMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={elements.length} className="my-2 p-3 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-auto font-mono">
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={elements.length} className="text-base font-semibold text-gray-900 dark:text-white mt-4 mb-1">
          {renderInline(line.slice(3))}
        </h3>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={elements.length} className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">
          {renderInline(line.slice(4))}
        </h4>
      );
      i++;
      continue;
    }

    // Bullet list item
    if (/^\s*[-*]\s/.test(line) || /^\s+[•]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && (/^\s*[-*•]\s/.test(lines[i]) || /^\s+[•]\s/.test(lines[i]))) {
        listItems.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={elements.length} className="my-1.5 space-y-1">
          {listItems.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="text-primary-500 mt-0.5 flex-shrink-0">-</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={elements.length} className="text-sm text-gray-700 dark:text-gray-300 my-1">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

/** Render inline markdown: **bold**, `code` */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // bold
      parts.push(<strong key={parts.length} className="font-semibold text-gray-900 dark:text-white">{match[2]}</strong>);
    } else if (match[3]) {
      // inline code
      parts.push(<code key={parts.length} className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">{match[3]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

function ToolCallCard({ toolCall }: { toolCall: { name: string; timestamp: string; status: 'ok' | 'error'; input: Record<string, unknown>; output: Record<string, unknown>; issue?: string } }) {
  const [expanded, setExpanded] = useState(false);
  const statusBadge = toolCall.status === 'error'
    ? <Badge variant="danger" size="sm">ERROR</Badge>
    : <Badge variant="success" size="sm">OK</Badge>;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-gray-900 dark:text-gray-100">{toolCall.name}</span>
          {statusBadge}
          <span className="text-xs text-gray-400">{toolCall.timestamp}</span>
        </div>
        <span className="text-xs text-gray-400">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="p-3 space-y-2 bg-white dark:bg-gray-900">
          {toolCall.issue && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">{toolCall.issue}</p>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Input</p>
              <button onClick={() => openJsonPopout(`${toolCall.name} — Input`, toolCall.input)} className="text-xs text-primary-500 hover:text-primary-400" title="Open in new window">&#x2197;</button>
            </div>
            <pre className="p-2 bg-gray-900 text-green-300 rounded text-xs overflow-auto max-h-40 font-mono">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Output</p>
              <button onClick={() => openJsonPopout(`${toolCall.name} — Output`, toolCall.output)} className="text-xs text-primary-500 hover:text-primary-400" title="Open in new window">&#x2197;</button>
            </div>
            <pre className="p-2 bg-gray-900 text-blue-300 rounded text-xs overflow-auto max-h-40 font-mono">
              {JSON.stringify(toolCall.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, variant = 'default' }: { label: string; value: string | number; variant?: string }) {
  const borderColor = variant === 'danger' ? 'border-red-300 dark:border-red-700' : variant === 'warning' ? 'border-yellow-300 dark:border-yellow-700' : 'border-gray-200 dark:border-gray-700';
  return (
    <div className={`p-3 rounded-lg border ${borderColor} bg-white dark:bg-gray-900`}>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default AgentReportModal;
