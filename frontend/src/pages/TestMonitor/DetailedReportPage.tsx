/**
 * Detailed Report Page
 * Full-page investigation report for booking false-positive analysis.
 * Accepts a session ID, fetches the markdown report from the API, and renders it styled.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import { Card, Spinner } from '../../components/ui';
import { getInvestigationReport } from '../../services/api/testMonitorApi';

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

function MermaidBlock({ code }: { code: string }) {
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

const markdownComponents = {
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
    <td className="px-4 py-2 text-gray-800 dark:text-gray-200 break-words">
      {children}
    </td>
  ),
  code: ({ children, className }: any) => {
    const isMermaid = className?.includes('language-mermaid');
    if (isMermaid) {
      const code = String(children).replace(/\n$/, '');
      return <MermaidBlock code={code} />;
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
};

// ── Main Page ────────────────────────────────────────────────────────────────

export function DetailedReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ markdown: string; classification: string; sessionId: string } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchReport = useCallback(async (sessionId: string) => {
    if (!sessionId.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const data = await getInvestigationReport(sessionId.trim());
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch investigation report');
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep-link support: read sessionId from URL params on mount
  useEffect(() => {
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
      {/* Search Bar */}
      <div className="p-4 print:hidden">
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
      </div>

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
              <ClassificationBadge classification={report.classification} />
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
                components={markdownComponents}
              >
                {report.markdown}
              </ReactMarkdown>
            </div>
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
        @media print {
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
