/**
 * Detailed Report Page
 * Full-page investigation report for booking false-positive analysis.
 * Accepts a session ID, fetches the markdown report from the API, and renders it styled.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import { Card, Spinner } from '../../components/ui';
import { getInvestigationReport, getStandaloneReport, getFlowiseReasoning, enrichFromFlowise } from '../../services/api/testMonitorApi';
import type { FlowiseReasoningResponse, FlowiseReasoningTurn } from '../../services/api/testMonitorApi';

// Mermaid config shared between themes
const mermaidBase = {
  startOnLoad: false,
  securityLevel: 'loose' as const,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  sequence: { actorMargin: 60, messageFontSize: 13, noteFontSize: 12, actorFontSize: 14 },
  flowchart: { curve: 'basis' as const, padding: 12 },
};

function initMermaid(isDark: boolean) {
  mermaid.initialize({
    ...mermaidBase,
    theme: isDark ? 'dark' : 'default',
  });
}

// ── Icons ────────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// ── Classification Badge ─────────────────────────────────────────────────────

function ClassificationBadge({ classification }: { classification: string }) {
  const normalized = classification.toUpperCase().replace(/ /g, '_');
  let bgColor: string;
  let textColor: string;
  let label: string;

  switch (normalized) {
    case 'FALSE_POSITIVE':
    case 'FALSE_POSITIVE_WITH_TOOL':
      bgColor = 'bg-red-100 dark:bg-red-900/40';
      textColor = 'text-red-800 dark:text-red-200';
      label = normalized.replace(/_/g, ' ');
      break;
    case 'LEGITIMATE':
    case 'CLEAN':
      bgColor = 'bg-green-100 dark:bg-green-900/40';
      textColor = 'text-green-800 dark:text-green-200';
      label = normalized;
      break;
    case 'INCONCLUSIVE':
      bgColor = 'bg-yellow-100 dark:bg-yellow-900/40';
      textColor = 'text-yellow-800 dark:text-yellow-200';
      label = 'INCONCLUSIVE';
      break;
    case 'DISCONNECT':
    case 'DEAD_AIR':
      bgColor = 'bg-orange-100 dark:bg-orange-900/40';
      textColor = 'text-orange-800 dark:text-orange-200';
      label = normalized.replace(/_/g, ' ');
      break;
    case 'INVESTIGATION':
      bgColor = 'bg-blue-100 dark:bg-blue-900/40';
      textColor = 'text-blue-800 dark:text-blue-200';
      label = 'INVESTIGATION';
      break;
    default:
      bgColor = 'bg-gray-100 dark:bg-gray-700';
      textColor = 'text-gray-800 dark:text-gray-200';
      label = classification;
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${bgColor} ${textColor}`}>
      {label}
    </span>
  );
}

// ── Data Popup (click-to-open modal for truncated table values) ──────────────

/** Decode base64 title → structured data or plain string. */
function decodePopupData(encoded: string): any {
  try {
    const json = atob(encoded);
    return JSON.parse(json);
  } catch {
    // Not base64/JSON — treat as plain text
    return encoded;
  }
}

/** Full-screen modal showing the complete untruncated data. */
function DataModal({ data, onClose }: { data: any; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Determine content type
  const isSlotData = data && typeof data === 'object' && (data.operatories || data.slots);
  const isText = typeof data === 'string';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {isSlotData ? `Full Slot Data — ${data.slots?.length ?? 0} slots, ${data.operatories?.length ?? 0} operatories` : 'Full Value'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isSlotData && (
            <div className="space-y-5">
              {/* Operatories list */}
              {data.operatories?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Operatories ({data.operatories.length})
                  </h4>
                  <div className="grid gap-1.5">
                    {data.operatories.map((op: string, i: number) => (
                      <code key={i} className="block text-xs bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded font-mono text-gray-800 dark:text-gray-200 select-all">
                        {op}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Slots table */}
              {data.slots?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Slots ({data.slots.length})
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">#</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Date</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Time</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Operatory ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {data.slots.map((slot: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 even:bg-gray-50/50 dark:even:bg-gray-800/30">
                            <td className="px-3 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">{slot.date}</td>
                            <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200 font-mono">{slot.time}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-400 select-all">{slot.op}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {isText && (
            <pre className="text-sm font-mono whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 select-all">
              {data}
            </pre>
          )}

          {!isSlotData && !isText && (
            <pre className="text-sm font-mono whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 select-all">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/** Clickable span that opens a DataModal with full untruncated data. */
function DataPopupSpan({ encoded, children }: { encoded: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const data = useMemo(() => decodePopupData(encoded), [encoded]);

  return (
    <>
      <span
        className="cursor-pointer border-b border-dashed border-blue-400 dark:border-blue-500 hover:border-blue-600 dark:hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        onClick={() => setOpen(true)}
        title="Click to view full data"
      >
        {children}
      </span>
      {open && createPortal(
        <DataModal data={data} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  );
}

// ── Mermaid Block ────────────────────────────────────────────────────────────

let mermaidCounter = 0;

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function MermaidBlock({ code, onToolCallClick }: { code: string; onToolCallClick?: (index: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const isDark = useDarkMode();

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++mermaidCounter}`;
    initMermaid(isDark);
    mermaid.render(id, code).then(({ svg: rendered }) => {
      if (!cancelled) setSvg(rendered);
    }).catch(() => {
      if (!cancelled && containerRef.current) {
        containerRef.current.textContent = code;
      }
    });
    return () => { cancelled = true; };
  }, [code, isDark]);

  // Attach click handlers to tool call labels in the rendered SVG
  useEffect(() => {
    if (!svg || !containerRef.current || !onToolCallClick) return;
    const texts = containerRef.current.querySelectorAll<SVGTextElement>('text.messageText');
    texts.forEach((el) => {
      const match = el.textContent?.match(/^\[(\d+)r?\]\s*(.*)/);
      if (!match) return;
      const idx = parseInt(match[1], 10);
      el.textContent = match[2];
      el.classList.add('tool-call-link');
      el.style.cursor = 'pointer';
      el.style.textDecoration = 'none';
      el.setAttribute('role', 'link');
      el.setAttribute('tabindex', '0');
      const handler = () => onToolCallClick(idx);
      el.addEventListener('click', handler);
      el.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  }, [svg, onToolCallClick]);

  if (svg) {
    return (
      <div
        ref={containerRef}
        className="my-4 overflow-x-auto bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <div ref={containerRef} className="my-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono whitespace-pre">
      {code}
    </div>
  );
}

// ── Markdown Component Overrides ─────────────────────────────────────────────

function getMarkdownComponents(onToolCallClick?: (index: number) => void) {
  return {
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold mt-8 mb-4 first:mt-0 text-gray-900 dark:text-gray-100">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-bold mt-6 mb-3 pb-2 border-b border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-800 dark:text-gray-200">
        {children}
      </h3>
    ),
    p: ({ children }: any) => (
      <p className="mb-3 last:mb-0 text-gray-700 dark:text-gray-300 leading-relaxed">
        {children}
      </p>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-sm text-gray-700 dark:text-gray-300">{children}</li>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4 rounded-lg border border-gray-200 dark:border-gray-600" style={{ maxWidth: 'calc(100vw - 11rem)' }}>
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-gray-100 dark:bg-gray-700">{children}</thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">{children}</tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors even:bg-gray-50/50 dark:even:bg-gray-800/30">
        {children}
      </tr>
    ),
    th: ({ children }: any) => (
      <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider bg-gray-100 dark:bg-gray-700">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-4 py-2 text-gray-800 dark:text-gray-200 break-words whitespace-pre-wrap">
        {children}
      </td>
    ),
    code: ({ children, className }: any) => {
      const isMermaid = className?.includes('language-mermaid');
      if (isMermaid) {
        const code = String(children).replace(/\n$/, '');
        return <MermaidBlock code={code} onToolCallClick={onToolCallClick} />;
      }
      const isBlock = className?.includes('language-');
      if (isBlock) {
        return (
          <code className="block bg-gray-900 text-green-400 rounded-lg p-4 my-3 text-xs font-mono overflow-x-auto whitespace-pre max-w-full">
            {children}
          </code>
        );
      }
      return (
        <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs font-mono text-gray-800 dark:text-gray-200 break-all">
          {children}
        </code>
      );
    },
    pre: ({ children }: any) => <div className="my-2">{children}</div>,
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-amber-500 dark:border-amber-400 pl-4 py-2 my-3 bg-amber-50 dark:bg-amber-900/20 rounded-r-lg">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-6 border-gray-300 dark:border-gray-600" />,
    a: ({ href, children }: any) => (
      <a href={href} className="text-primary-600 dark:text-primary-400 underline hover:no-underline" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    span: ({ node, className, title, children, ...props }: any) => {
      if (className?.includes('trunc') && title) {
        return <DataPopupSpan encoded={title}>{children}</DataPopupSpan>;
      }
      return <span className={className} title={title} {...props}>{children}</span>;
    },
  };
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function DetailedReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isStandaloneReport = !!searchParams.get('report');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ markdown: string; classification: string; sessionId: string } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Flowise enrichment state
  const [flowiseData, setFlowiseData] = useState<FlowiseReasoningResponse | null>(null);
  const [flowiseLoading, setFlowiseLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [flowiseExpanded, setFlowiseExpanded] = useState(false);

  const handleToolCallClick = useCallback((index: number) => {
    const el = document.getElementById(`tool-call-${index}`);
    if (!el) return;
    // Expand the <details> element
    el.setAttribute('open', '');
    // Smooth scroll into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Add highlight animation, remove after 2s
    el.classList.add('tool-call-highlight');
    setTimeout(() => el.classList.remove('tool-call-highlight'), 2000);
  }, []);

  const mdComponents = useMemo(() => getMarkdownComponents(handleToolCallClick), [handleToolCallClick]);

  // Fetch Flowise enrichment data for a session
  const fetchFlowiseData = useCallback(async (sessionId: string) => {
    setFlowiseLoading(true);
    try {
      const data = await getFlowiseReasoning(sessionId);
      setFlowiseData(data);
    } catch {
      // Non-fatal — Flowise enrichment is optional
      setFlowiseData(null);
    } finally {
      setFlowiseLoading(false);
    }
  }, []);

  // Trigger on-demand Flowise enrichment
  const handleEnrich = useCallback(async (sessionId: string) => {
    setEnriching(true);
    try {
      await enrichFromFlowise([sessionId]);
      // Re-fetch after enrichment
      await fetchFlowiseData(sessionId);
    } catch {
      // Ignore
    } finally {
      setEnriching(false);
    }
  }, [fetchFlowiseData]);

  const fetchReport = useCallback(async (sessionId: string) => {
    if (!sessionId.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setFlowiseData(null);

    try {
      const data = await getInvestigationReport(sessionId.trim());
      setReport(data);
      // Also fetch Flowise data
      fetchFlowiseData(sessionId.trim());
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch investigation report');
    } finally {
      setLoading(false);
    }
  }, [fetchFlowiseData]);

  const fetchStandaloneReport = useCallback(async (filename: string) => {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const data = await getStandaloneReport(filename);
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch report');
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep-link support: read sessionId or report filename from URL params on mount
  useEffect(() => {
    const reportFile = searchParams.get('report');
    if (reportFile) {
      const filename = reportFile.endsWith('.md') ? reportFile : `${reportFile}.md`;
      fetchStandaloneReport(filename);
      return;
    }
    const sid = searchParams.get('sessionId');
    if (sid) {
      setInputValue(sid);
      fetchReport(sid);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setSearchParams({ sessionId: inputValue.trim() });
    fetchReport(inputValue.trim());
  };

  const handlePrint = () => {
    if (!reportRef.current) return;

    // Clone the report content and convert Mermaid SVGs to static images
    const clone = reportRef.current.cloneNode(true) as HTMLElement;

    // Force all SVG text elements to dark color (overrides mermaid inline styles)
    clone.querySelectorAll('svg text').forEach((el) => {
      const htmlEl = el as SVGTextElement;
      // Skip white text on dark actor boxes (Caller, LLM, Tools)
      const parent = htmlEl.closest('.actor');
      if (parent) return;
      htmlEl.style.fill = '#111';
      htmlEl.style.fontWeight = '600';
      htmlEl.setAttribute('fill', '#111');
    });
    clone.querySelectorAll('svg line, svg .messageLine0, svg .messageLine1').forEach((el) => {
      (el as SVGElement).style.stroke = '#333';
    });

    // Collect all stylesheets from the current page for the print window
    const styles = Array.from(document.styleSheets)
      .map((ss) => {
        try {
          return Array.from(ss.cssRules).map((r) => r.cssText).join('\n');
        } catch {
          // Cross-origin stylesheets can't be read; link them instead
          return ss.href ? `@import url("${ss.href}");` : '';
        }
      })
      .join('\n');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Report — ${report?.sessionId || 'Session'}</title>
  <style>
    ${styles}
    /* Print-specific overrides */
    body {
      background: white !important;
      color: black !important;
      padding: 1.5rem;
      max-width: 900px;
      margin: 0 auto;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    }
    h1, h2, h3, strong { color: black !important; }
    p, li, td { color: #333 !important; }
    th { color: #555 !important; background: #f3f4f6 !important; }
    code { background: #f3f4f6 !important; color: #1a1a1a !important; }
    pre { background: #f8f9fa !important; border: 1px solid #e5e7eb !important; }
    blockquote { border-color: #d97706 !important; background: #fffbeb !important; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
    svg { max-width: 100%; height: auto; }
    /* Mermaid diagram — force all text dark for print legibility */
    svg text {
      fill: #111 !important;
      color: #111 !important;
      font-weight: 600 !important;
      opacity: 1 !important;
    }
    svg text[fill] { fill: #111 !important; }
    svg .messageText, svg .sequenceNumber,
    svg .labelText, svg .loopText, svg .noteText {
      fill: #111 !important;
      font-weight: 600 !important;
    }
    svg line, svg .messageLine0, svg .messageLine1 {
      stroke: #333 !important;
      stroke-width: 1.5px !important;
    }
    svg .actor-line { stroke: #555 !important; }
    svg .note rect, svg .activation0 { stroke: #333 !important; }
    svg path, svg .edgePath path, svg .flowchart-link {
      stroke: #444 !important;
    }
    svg .node rect, svg .node circle, svg .node polygon {
      stroke: #333 !important;
      stroke-width: 1.5px !important;
    }
    svg .nodeLabel, svg .edgeLabel, svg .label {
      fill: #111 !important;
      font-weight: 600 !important;
    }
    details { break-inside: avoid; }
    details[open] summary { border-bottom: 1px solid #e5e7eb; margin-bottom: 0.5rem; }
    .dark, [class*="dark:"] { color: black !important; background: white !important; }
    @media print {
      body { padding: 0; }
      h2 { page-break-before: auto; }
    }
  </style>
</head>
<body>
  ${clone.innerHTML}
</body>
</html>`);
    printWindow.document.close();

    // Wait for images/SVGs to load, then trigger print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // Close the window after printing (or cancelling)
      setTimeout(() => printWindow.close(), 1000);
    }, 500);
  };

  return (
    <div className="h-full w-full min-w-0 flex flex-col overflow-y-auto overflow-x-hidden" style={{ maxWidth: 'calc(100vw - 12rem)' }}>
      {/* Search Bar — hidden for standalone reports */}
      {!isStandaloneReport && <div className="p-4 print:hidden">
        <Card padding="sm">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <div className="text-gray-400">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter session ID (e.g. conv_9_+19546824812_1771965271483)"
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Investigating...' : 'Investigate'}
            </button>
          </form>
        </Card>
      </div>}

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner size="lg" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Analyzing session...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="p-4">
          <Card padding="md">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          </Card>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="flex-1 p-4 pt-0 overflow-y-auto overflow-x-hidden min-w-0" ref={reportRef}>
          <Card padding="lg">
            {/* Report Header */}
            <div className="flex items-center justify-between mb-4 print:hidden">
              <div className="flex items-center gap-3">
                <ClassificationBadge classification={report.classification} />
                {/* Flowise enrichment badge */}
                {flowiseData?.isEnriched ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Flowise Data
                    {flowiseData.hasLoops && <span className="ml-1 text-red-500">(Loop)</span>}
                  </span>
                ) : flowiseLoading ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    <Spinner size="xs" />
                    Checking Flowise...
                  </span>
                ) : (
                  <button
                    onClick={() => report.sessionId && handleEnrich(report.sessionId)}
                    disabled={enriching}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900/40 dark:hover:text-purple-300 transition-colors disabled:opacity-50"
                    title="Fetch Flowise chat message data for this session"
                  >
                    {enriching ? <><Spinner size="xs" /> Enriching...</> : 'Enrich from Flowise'}
                  </button>
                )}
              </div>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Print / Save as PDF"
              >
                <DownloadIcon />
                PDF
              </button>
            </div>

            {/* Markdown Report */}
            <div className="detailed-report-markdown min-w-0 overflow-hidden">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={mdComponents}
              >
                {report.markdown}
              </ReactMarkdown>
            </div>

            {/* Flowise Enrichment Data Section */}
            {flowiseData?.isEnriched && flowiseData.turns.length > 0 && (
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4 print:hidden">
                <button
                  onClick={() => setFlowiseExpanded(!flowiseExpanded)}
                  className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${flowiseExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Flowise Enrichment Data
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({flowiseData.turns.filter(t => t.stepCount > 0 || t.toolTimings.length > 0 || t.errors.length > 0).length} turns with data)
                  </span>
                </button>

                {flowiseExpanded && (
                  <div className="mt-3 space-y-3">
                    {/* Summary stats */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
                        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{flowiseData.totalSteps}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Tool Calls</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
                        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{flowiseData.turns.length}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Messages</div>
                      </div>
                      <div className={`rounded-lg p-3 text-center ${flowiseData.hasLoops ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800'}`}>
                        <div className={`text-lg font-bold ${flowiseData.hasLoops ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {flowiseData.hasLoops ? 'Yes' : 'No'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Loop Detected</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
                        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{Object.keys(flowiseData.toolTimings).length}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Timed Tools</div>
                      </div>
                    </div>

                    {/* Per-tool timing */}
                    {Object.keys(flowiseData.toolTimings).length > 0 && (
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Tool Timing (from Node-RED _debug_calls)
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                          {Object.entries(flowiseData.toolTimings).map(([tool, avgMs]) => (
                            <div key={tool} className="flex items-center justify-between px-3 py-2 text-sm">
                              <span className="font-mono text-gray-700 dark:text-gray-300">{tool}</span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">{avgMs}ms avg</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Turns with errors */}
                    {flowiseData.turns.some(t => t.errors.length > 0) && (
                      <div className="rounded-lg border border-red-200 dark:border-red-800 overflow-hidden">
                        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
                          Flowise Errors (not in Langfuse)
                        </div>
                        <div className="divide-y divide-red-200 dark:divide-red-800">
                          {flowiseData.turns.filter(t => t.errors.length > 0).map(t => (
                            <div key={t.turnIndex} className="px-3 py-2">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Turn {t.turnIndex} ({t.role})</div>
                              {t.errors.map((err, i) => (
                                <div key={i} className="text-sm text-red-700 dark:text-red-300 font-mono break-all">{err}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && !report && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 dark:text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Enter a session ID to generate a detailed investigation report</p>
          </div>
        </div>
      )}

      {/* Collapsible details + Print Styles */}
      <style>{`
        .detailed-report-markdown details {
          margin: 0.5rem 0;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          overflow: hidden;
        }
        .dark .detailed-report-markdown details {
          border-color: #4b5563;
        }
        .detailed-report-markdown details summary {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          user-select: none;
          font-size: 0.875rem;
          color: #374151;
          background: #f9fafb;
          transition: background 0.15s;
        }
        .dark .detailed-report-markdown details summary {
          color: #d1d5db;
          background: #1f2937;
        }
        .detailed-report-markdown details summary:hover {
          background: #f3f4f6;
        }
        .dark .detailed-report-markdown details summary:hover {
          background: #374151;
        }
        .detailed-report-markdown details[open] summary {
          border-bottom: 1px solid #e5e7eb;
        }
        .dark .detailed-report-markdown details[open] summary {
          border-bottom-color: #4b5563;
        }
        .detailed-report-markdown details > :not(summary) {
          padding: 0 0.75rem;
        }
        /* Tool call click-to-jump: clickable labels in Mermaid SVG */
        .tool-call-link {
          cursor: pointer;
          transition: fill 0.15s, text-decoration 0.15s;
        }
        .tool-call-link:hover {
          fill: #2563eb;
        }
        .dark .tool-call-link:hover {
          fill: #60a5fa;
        }
        .tool-call-link:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
          border-radius: 2px;
        }

        /* Tool call highlight animation on target <details> */
        @keyframes tool-call-ring {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          50% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .detailed-report-markdown details.tool-call-highlight {
          animation: tool-call-ring 1s ease-out 2;
          border-color: #3b82f6;
        }
        .dark .detailed-report-markdown details.tool-call-highlight {
          border-color: #60a5fa;
        }

        @media print {
          .tool-call-link { cursor: default; }
          .tool-call-link:hover { text-decoration: none; }
          /* Hide everything except the report */
          nav, .print\\:hidden, header,
          [class*="border-b"][class*="bg-white"],
          [class*="border-b"][class*="bg-gray-800"] {
            display: none !important;
          }
          /* Full width, white background */
          body { background: white !important; }
          .detailed-report-markdown { color: black !important; }
          .detailed-report-markdown h1,
          .detailed-report-markdown h2,
          .detailed-report-markdown h3,
          .detailed-report-markdown strong { color: black !important; }
          .detailed-report-markdown p,
          .detailed-report-markdown li,
          .detailed-report-markdown td { color: #333 !important; }
          .detailed-report-markdown th { color: #555 !important; background: #f3f4f6 !important; }
          .detailed-report-markdown code { background: #f3f4f6 !important; color: #1a1a1a !important; }
          .detailed-report-markdown blockquote { border-color: #d97706 !important; background: #fffbeb !important; }
          /* Mermaid SVG text — darker & bolder for print */
          .detailed-report-markdown svg text,
          .detailed-report-markdown svg .nodeLabel,
          .detailed-report-markdown svg .edgeLabel,
          .detailed-report-markdown svg .label {
            fill: #111 !important;
            color: #111 !important;
            font-weight: 600 !important;
          }
          .detailed-report-markdown svg .node rect,
          .detailed-report-markdown svg .node circle,
          .detailed-report-markdown svg .node polygon,
          .detailed-report-markdown svg .node .label-container {
            stroke: #333 !important;
            stroke-width: 1.5px !important;
          }
          .detailed-report-markdown svg .edgePath path,
          .detailed-report-markdown svg .flowchart-link {
            stroke: #444 !important;
            stroke-width: 1.5px !important;
          }
          .detailed-report-markdown svg marker path { fill: #444 !important; }
          /* Page breaks before major sections */
          .detailed-report-markdown h2 { page-break-before: auto; }
          /* Remove shadows and borders for cleaner print */
          .shadow, .shadow-sm { box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}

export default DetailedReportPage;
