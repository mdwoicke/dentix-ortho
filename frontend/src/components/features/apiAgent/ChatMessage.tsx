/**
 * ChatMessage Component
 * Renders a single chat message bubble for the API Agent chat panel.
 * User messages appear right-aligned with indigo background.
 * Assistant messages render markdown with proper formatting.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage as ChatMessageType } from '../../../hooks/useApiAgentChat';

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

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          min-w-0 rounded-xl px-4 py-2.5
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
                            // Try direct callback first (handles same-page links reliably)
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
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-current animate-pulse rounded-sm" />
          )}
        </div>

        {/* Timestamp */}
        <div
          className={`
            mt-1 text-[10px] leading-none
            ${
              isUser
                ? 'text-indigo-200'
                : 'text-gray-400 dark:text-gray-500'
            }
          `}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

export default ChatMessageComponent;
