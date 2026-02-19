/**
 * ApiAgentChatPanel Component
 * Slide-over panel for natural language API queries via the API Agent.
 * Slides in from the right side of the screen with a backdrop overlay.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { selectCurrentTenant } from '../../../store/slices/tenantSlice';
import { useApiAgentChat } from '../../../hooks/useApiAgentChat';
import type { ApiSource } from '../../../hooks/useApiAgentChat';
import ChatMessage from './ChatMessage';

interface ApiAgentChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type TenantKind = 'ortho' | 'dominos';

/** Suggested queries keyed by [apiSource][tenantKind]. */
const SUGGESTED_QUERIES: Record<ApiSource, Record<TenantKind, string[]>> = {
  cloud9: {
    ortho: [
      'Show all locations',
      'List available appointment types',
      'Find patients with last name Smith',
      'Show providers list',
    ],
    dominos: [
      'Show Dominos dashboard stats',
      'List recent Dominos orders',
      'Show Dominos error breakdown',
      'Show Dominos session details',
    ],
  },
  nodered: {
    ortho: [
      'Search patient by name Canales',
      'Get available appointment slots for next week',
      'Show location details',
      'List patient appointments',
    ],
    dominos: [
      'Show Dominos dashboard stats',
      'List recent Dominos orders',
      'Show Dominos error breakdown',
      'Show Dominos session details',
    ],
  },
};

const EMPTY_STATE_TEXT: Record<ApiSource, Record<TenantKind, string>> = {
  cloud9: {
    ortho: 'Query Cloud9 APIs directly — patients, appointments, locations, and more.',
    dominos: 'Query Dominos endpoints — orders, sessions, errors, and dashboard stats.',
  },
  nodered: {
    ortho: 'Query via Node-RED middleware — patient lookup, scheduling, grouped slots, and more.',
    dominos: 'Query Dominos endpoints — orders, sessions, errors, and dashboard stats.',
  },
};

const ApiAgentChatPanel: React.FC<ApiAgentChatPanelProps> = ({ isOpen, onClose }) => {
  const {
    messages,
    isLoading,
    error,
    apiSource,
    setApiSource,
    sendMessage,
    clearChat,
    abortStream,
  } = useApiAgentChat();

  const currentTenant = useAppSelector(selectCurrentTenant);
  const tenantKind: TenantKind = useMemo(
    () => (currentTenant?.slug?.includes('dominos') ? 'dominos' : 'ortho'),
    [currentTenant?.slug],
  );

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to let animation start
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleSuggestionClick = (query: string) => {
    sendMessage(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Allow Escape to close the panel
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const suggestions = SUGGESTED_QUERIES[apiSource][tenantKind];
  const emptyStateText = EMPTY_STATE_TEXT[apiSource][tenantKind];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`
          fixed right-0 top-0 h-full w-[480px] max-w-full
          bg-white dark:bg-gray-900 shadow-2xl
          flex flex-col z-50
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              API Agent
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Natural language API queries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearChat}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md
                text-gray-600 dark:text-gray-300
                hover:bg-gray-100 dark:hover:bg-gray-800
                border border-gray-200 dark:border-gray-700
                transition-colors"
              title="Start new conversation"
            >
              New Chat
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md
                text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800
                transition-colors"
              title="Close panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* API Source Toggle */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">API:</span>
          <button
            onClick={() => setApiSource('cloud9')}
            disabled={isLoading}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
              ${apiSource === 'cloud9'
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Cloud9
          </button>
          <button
            onClick={() => setApiSource('nodered')}
            disabled={isLoading}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
              ${apiSource === 'nodered'
                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Node-RED
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Empty state with suggested queries */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Ask anything about your API data
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                {emptyStateText}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((query) => (
                  <button
                    key={query}
                    onClick={() => handleSuggestionClick(query)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full
                      bg-gray-100 dark:bg-gray-800
                      text-gray-700 dark:text-gray-300
                      hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                      hover:text-indigo-700 dark:hover:text-indigo-300
                      border border-gray-200 dark:border-gray-700
                      hover:border-indigo-300 dark:hover:border-indigo-700
                      transition-colors"
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}

          {/* Error display */}
          {error && (
            <div className="flex justify-center">
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* Auto-scroll anchor */}
          <div ref={scrollRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 shrink-0">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                tenantKind === 'dominos'
                  ? 'Ask about Dominos data...'
                  : apiSource === 'cloud9'
                    ? 'Ask about Cloud9 API data...'
                    : 'Ask about Node-RED endpoints...'
              }
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-sm rounded-lg
                border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                disabled:opacity-50 disabled:cursor-not-allowed
                outline-none transition-colors"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={abortStream}
                className="px-3 py-2 rounded-lg text-sm font-medium
                  bg-red-600 hover:bg-red-700
                  text-white
                  transition-colors shrink-0"
                title="Stop generating"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-3 py-2 rounded-lg text-sm font-medium
                  bg-indigo-600 hover:bg-indigo-700
                  disabled:bg-indigo-400 disabled:cursor-not-allowed
                  text-white
                  transition-colors shrink-0"
                title="Send message"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
};

export default ApiAgentChatPanel;
