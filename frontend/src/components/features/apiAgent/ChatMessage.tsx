/**
 * ChatMessage Component
 * Renders a single chat message bubble for the API Agent chat panel.
 * User messages appear right-aligned with indigo background.
 * Assistant messages render markdown with proper formatting.
 */

import React, { useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage as ChatMessageType, TableData } from '../../../hooks/useApiAgentChat';
import { parseMarkdownTable } from '../../../utils/parseMarkdownTable';

/** Tiny copy-to-clipboard button shown next to inline code identifiers. */
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard not available */ }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center ml-1 align-middle opacity-30 hover:opacity-100
        transition-opacity cursor-pointer shrink-0"
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
};

/** Tiny inline copy button for table cells. */
const CellCopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard not available */ }
  }, [text]);
  if (!text || text === '-') return null;
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center ml-1.5 opacity-0 group-hover/row:opacity-40 hover:!opacity-100 transition-opacity cursor-pointer shrink-0"
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
};

/** Interactive table with sort and search. */
const InteractiveTable: React.FC<{ tableData: TableData }> = ({ tableData }) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const filtered = useMemo(() => {
    let rows = tableData.rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      const keys = tableData.searchableKeys ?? tableData.columns.map(c => c.key);
      rows = rows.filter(r => keys.some(k => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    if (sortKey) {
      const rawKey = `_${sortKey}Raw`;
      rows = [...rows].sort((a, b) => {
        const av = String(a[rawKey] ?? a[sortKey] ?? '');
        const bv = String(b[rawKey] ?? b[sortKey] ?? '');
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [tableData, search, sortKey, sortDir]);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search results..."
            className="w-full pl-7 pr-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200
              placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{filtered.length} rows</span>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 dark:border-gray-600 max-h-[400px] overflow-y-auto">
        <table className="w-max min-w-full text-xs border-collapse">
          <thead className="bg-gray-200/80 dark:bg-gray-700/80 sticky top-0">
            <tr>
              {tableData.columns.map(col => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  className={`px-3 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-300 text-[11px] uppercase tracking-wider
                    ${col.sortable ? 'cursor-pointer select-none hover:bg-gray-300/60 dark:hover:bg-gray-600/60' : ''}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {sortDir === 'asc'
                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
            {filtered.map((row, i) => (
              <tr key={i} className="group/row hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                {tableData.columns.map(col => {
                  const val = String(row[col.key] ?? '-');
                  return (
                    <td key={col.key} className="px-3 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      <span className="inline-flex items-center">
                        {val}
                        {col.copyable && <CellCopyButton text={val} />}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={tableData.columns.length} className="px-3 py-4 text-center text-gray-400 text-xs">
                  No results match your search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface ChatMessageProps {
  message: ChatMessageType;
  onNavigate?: () => void;
  /** Optional handler for internal links. Return true if handled (skips navigate). */
  onLinkClick?: (href: string) => boolean;
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ChatMessageComponent: React.FC<ChatMessageProps> = ({ message, onNavigate, onLinkClick }) => {
  const isUser = message.role === 'user';
  const navigate = useNavigate();
  const [copiedFull, setCopiedFull] = useState(false);

  const handleCopyFull = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 1500);
    } catch { /* clipboard not available */ }
  }, [message.content]);

  // Auto-detect markdown pipe-tables and convert to interactive tables
  const autoTable = useMemo(() => {
    if (message.tableData || message.role === 'user' || message.isStreaming) return null;
    return parseMarkdownTable(message.content);
  }, [message.content, message.tableData, message.role, message.isStreaming]);

  const effectiveTableData = message.tableData || autoTable?.tableData || null;
  const displayContent = message.tableData
    ? message.content.split('\n').filter(l => !l.startsWith('|')).join('\n')
    : autoTable
      ? autoTable.strippedContent
      : message.content;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          group/msg min-w-0 rounded-xl px-4 py-2.5 relative
          ${
            isUser
              ? 'max-w-[85%] bg-indigo-600 text-white rounded-br-sm'
              : 'max-w-[95%] bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-bl-sm'
          }
        `}
      >
        {/* Message content */}
        <div className="text-sm leading-relaxed min-w-0">
          {isUser ? (
            message.content
          ) : (
            <div className="api-agent-markdown min-w-0">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Headings
                  h1: ({ children }) => (
                    <h3 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h3>
                  ),
                  h2: ({ children }) => (
                    <h4 className="text-sm font-bold mt-2.5 mb-1 first:mt-0">{children}</h4>
                  ),
                  h3: ({ children }) => (
                    <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h5>
                  ),
                  // Paragraphs
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  // Bold
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>
                  ),
                  // Lists
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  // Code blocks
                  code: ({ children, className }) => {
                    const isBlock = className?.includes('language-');
                    if (isBlock) {
                      return (
                        <code className="block bg-gray-200 dark:bg-gray-700 rounded-md p-2 my-2 text-xs font-mono overflow-x-auto whitespace-pre">
                          {children}
                        </code>
                      );
                    }
                    // Inline code with copy button for identifier-length values
                    // CopyButton uses preventDefault so it won't trigger parent link navigation
                    const text = String(children).replace(/\n$/, '');
                    const showCopy = text.length >= 4;
                    if (showCopy) {
                      return (
                        <span className="inline-flex items-center">
                          <code className="bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5 text-xs font-mono">
                            {children}
                          </code>
                          <CopyButton text={text} />
                        </span>
                      );
                    }
                    return (
                      <code className="bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5 text-xs font-mono">
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <div className="my-1">{children}</div>,
                  // Tables
                  table: ({ children }) => (
                    <div className="overflow-x-auto overscroll-x-contain my-2 rounded-lg border border-gray-200 dark:border-gray-600">
                      <table className="w-max min-w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-gray-200/80 dark:bg-gray-700/80">{children}</thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">{children}</tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-300 text-[11px] uppercase tracking-wider">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      {children}
                    </td>
                  ),
                  // Horizontal rule
                  hr: () => <hr className="my-2 border-gray-300 dark:border-gray-600" />,
                  // Links
                  a: ({ href, children }) => {
                    const isInternal = href?.startsWith('/');
                    if (isInternal) {
                      return (
                        <a
                          href={href}
                          onClick={(e) => {
                            e.preventDefault();
                            const handled = onLinkClick?.(href!);
                            if (!handled) {
                              navigate(href!);
                            }
                            onNavigate?.();
                          }}
                          className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300"
                        >
                          {children}
                        </a>
                      );
                    }
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300"
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
              {effectiveTableData && <InteractiveTable tableData={effectiveTableData} />}
            </div>
          )}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-current animate-pulse rounded-sm" />
          )}
        </div>

        {/* Timestamp + Copy button */}
        <div
          className={`
            mt-1 flex items-center gap-2 text-[10px] leading-none
            ${
              isUser
                ? 'text-indigo-200'
                : 'text-gray-400 dark:text-gray-500'
            }
          `}
        >
          <span>{formatTime(message.timestamp)}</span>
          {!isUser && !message.isStreaming && (
            <button
              type="button"
              onClick={handleCopyFull}
              className="opacity-0 group-hover/msg:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              title={copiedFull ? 'Copied!' : 'Copy response'}
            >
              {copiedFull ? (
                <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessageComponent;
