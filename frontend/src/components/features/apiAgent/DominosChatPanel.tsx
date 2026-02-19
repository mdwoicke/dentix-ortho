/**
 * DominosChatPanel Component
 * Slide-over chat panel for Dominos-specific API queries.
 * Provides a 3-way toggle: Menu/Coupons | Orders | Trace Calls
 * Each category constrains the API agent to the relevant endpoints.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApiAgentChat } from '../../../hooks/useApiAgentChat';
import type { ApiSource } from '../../../hooks/useApiAgentChat';
import ChatMessage from './ChatMessage';
import { matchSkill } from '../../../skills/dominos';

interface DominosChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type DominosCategory = 'dominos-menu' | 'dominos-orders' | 'dominos-traces';

const CATEGORY_LABELS: Record<DominosCategory, string> = {
  'dominos-menu': 'Menu/Coupons',
  'dominos-orders': 'Orders',
  'dominos-traces': 'Trace Calls',
};

const CATEGORY_COLORS: Record<DominosCategory, { active: string }> = {
  'dominos-menu': {
    active: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700',
  },
  'dominos-orders': {
    active: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
  },
  'dominos-traces': {
    active: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
  },
};

const SUGGESTED_QUERIES: Record<DominosCategory, string[]> = {
  'dominos-menu': [
    'Menu code for large Extravaganza',
    'Find coupons with wings for store 4332',
    'Show pizza coupons for store 7539',
    'List all coupons for store 4332',
  ],
  'dominos-orders': [
    'Create a sample order',
    'Show dashboard stats',
    'List recent order logs',
    'Show error breakdown',
  ],
  'dominos-traces': [
    'Show recent monitoring results',
    'Analyze session intent',
    'Verify session goals',
  ],
};

const EMPTY_STATE_TEXT: Record<DominosCategory, string> = {
  'dominos-menu': 'Query Dominos menu, coupons, and store info endpoints.',
  'dominos-orders': 'Query Dominos order logs, dashboard stats, and session data.',
  'dominos-traces': 'Analyze call traces, session intents, and goal verification.',
};

const PLACEHOLDER_TEXT: Record<DominosCategory, string> = {
  'dominos-menu': 'Ask about menu items, coupons, stores...',
  'dominos-orders': 'Ask about orders, sessions, stats...',
  'dominos-traces': 'Ask about traces, intents, goals...',
};

const DominosChatPanel: React.FC<DominosChatPanelProps> = ({ isOpen, onClose }) => {
  const {
    messages,
    isLoading,
    error,
    apiSource,
    setApiSource,
    sendMessage,
    clearChat,
    abortStream,
    addExchange,
  } = useApiAgentChat({ namespace: 'dominos', defaultSource: 'dominos-orders' });

  const category = apiSource as DominosCategory;

  const [input, setInput] = useState('');
  const [skillRunning, setSkillRunning] = useState(false);
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
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  /**
   * Try to run a local skill first; fall back to the backend API agent.
   */
  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || skillRunning) return;

    const skill = matchSkill(trimmed);
    if (skill) {
      setSkillRunning(true);
      try {
        const result = await skill.execute(trimmed);
        addExchange(trimmed, result.markdown);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Skill execution failed';
        addExchange(trimmed, `Error running **${skill.label}**: ${msg}`);
      } finally {
        setSkillRunning(false);
      }
    } else {
      sendMessage(trimmed);
    }
  }, [isLoading, skillRunning, sendMessage, addExchange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || skillRunning) return;
    handleSend(input);
    setInput('');
  };

  const handleSuggestionClick = (query: string) => {
    handleSend(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleCategoryChange = (cat: DominosCategory) => {
    setApiSource(cat as ApiSource);
  };

  const suggestions = SUGGESTED_QUERIES[category] ?? SUGGESTED_QUERIES['dominos-orders'];
  const emptyStateText = EMPTY_STATE_TEXT[category] ?? EMPTY_STATE_TEXT['dominos-orders'];
  const placeholder = PLACEHOLDER_TEXT[category] ?? PLACEHOLDER_TEXT['dominos-orders'];

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
              Dominos Agent
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Natural language Dominos queries
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

        {/* Category Toggle */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Scope:</span>
          {(Object.keys(CATEGORY_LABELS) as DominosCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              disabled={isLoading || skillRunning}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                ${category === cat
                  ? CATEGORY_COLORS[cat].active
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                }
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Empty state with suggested queries */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Ask anything about Dominos data
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
                      hover:bg-emerald-50 dark:hover:bg-emerald-900/30
                      hover:text-emerald-700 dark:hover:text-emerald-300
                      border border-gray-200 dark:border-gray-700
                      hover:border-emerald-300 dark:hover:border-emerald-700
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
              placeholder={placeholder}
              disabled={isLoading || skillRunning}
              className="flex-1 px-3 py-2 text-sm rounded-lg
                border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500
                disabled:opacity-50 disabled:cursor-not-allowed
                outline-none transition-colors"
            />
            {isLoading || skillRunning ? (
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
                disabled={!input.trim() || skillRunning}
                className="px-3 py-2 rounded-lg text-sm font-medium
                  bg-emerald-600 hover:bg-emerald-700
                  disabled:bg-emerald-400 disabled:cursor-not-allowed
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

export default DominosChatPanel;
