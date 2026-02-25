/**
 * ApiAgentChatPanel Component
 * Slide-over panel for natural language API queries via the API Agent.
 * Slides in from the right side of the screen with a backdrop overlay.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { selectCurrentTenant } from '../../../store/slices/tenantSlice';
import { useApiAgentChat } from '../../../hooks/useApiAgentChat';
import { useResizablePanel } from '../../../hooks/useResizablePanel';
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition';
import type { ApiSource } from '../../../hooks/useApiAgentChat';
import ChatMessage from './ChatMessage';
import { matchSkill as matchCloud9Skill, clearLastSkill as clearCloud9LastSkill, setCurrentApiSource as setCloud9ApiSource } from '../../../skills/cloud9';
import { matchSkill as matchChordSkill, clearLastSkill as clearChordLastSkill, setCurrentApiSource as setChordApiSource } from '../../../skills/chord';

type PageContext = 'default' | 'call-tracing' | 'prod-tracker';

interface ApiAgentChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pageContext?: PageContext;
  /** Optional handler for internal links. Return true if handled (skips navigate). */
  onLinkClick?: (href: string) => boolean;
}

type TenantKind = 'ortho' | 'dominos' | 'chord';

/** Suggested queries keyed by [apiSource][tenantKind]. */
const SUGGESTED_QUERIES: Record<ApiSource, Record<TenantKind, string[]>> = {
  call: {
    ortho: [
      'How many calls today',
      'Calls this week',
      'Show recent sessions',
      'Show trace insights',
      'Find sessions with errors',
      'Calls for patient Smith',
    ],
    dominos: [
      'Show dashboard stats',
      'List recent failed orders',
      'Show error breakdown',
      'Service health status',
    ],
    chord: [
      'How many calls today',
      'Calls this week',
      'Show recent sessions',
      'Show trace insights',
      'Find sessions with errors',
    ],
  },
  cloud9: {
    ortho: [
      'Find patient Canales',
      'Search for patient Smith',
      'Show all locations',
      'List appointment types',
      'Show providers list',
      'Show cancelled appointments',
      'Appointments by location',
      'Family records',
    ],
    dominos: [
      'Store info for 4332',
      'Find coupons with wings',
      'Create a sample order',
      'List recent orders',
    ],
    chord: [
      'Find patient Smith',
      'Search for patient Jones',
      'Show prompt versions',
    ],
  },
  nodered: {
    ortho: [
      'Cache health status',
      'Booking queue stats',
      'Show prompt versions',
      'Show tracker stats',
      'Active test appointments',
    ],
    dominos: [
      'Show recent monitoring results',
      'Analyze session intent',
      'Verify session goals',
    ],
    chord: [
      'Show prompt versions',
      'Show recent sessions',
    ],
  },
};

const EMPTY_STATE_TEXT: Record<ApiSource, Record<TenantKind, string>> = {
  call: {
    ortho: 'Query call sessions & traces — call stats, recent sessions, errors, and insights.',
    dominos: 'Query Dominos call sessions — orders, errors, and dashboard stats.',
    chord: 'Query Chord Dental IVA call sessions — call stats, recent sessions, and errors.',
  },
  cloud9: {
    ortho: 'Query Cloud9 APIs directly — patients, appointments, locations, and more.',
    dominos: 'Query Dominos endpoints — orders, sessions, errors, and dashboard stats.',
    chord: 'Query Chord patient data — patient search and prompt versions.',
  },
  nodered: {
    ortho: 'Query via Node-RED middleware — patient lookup, scheduling, grouped slots, and more.',
    dominos: 'Query Dominos endpoints — orders, sessions, errors, and dashboard stats.',
    chord: 'Query Chord via Node-RED — prompt versions and session data.',
  },
};

/** Context-specific suggestions shown when opened from a particular page. */
const CONTEXT_SUGGESTIONS: Partial<Record<PageContext, Partial<Record<ApiSource, string[]>>>> = {
  'call-tracing': {
    call: [
      'How many calls today',
      'Calls this week',
      'Show recent sessions',
      'Show trace insights',
      'Find sessions with errors',
      'Calls for patient Smith',
    ],
    cloud9: [
      'Find patient Canales',
      'Search for patient Smith',
      'List appointment types',
      'Show all locations',
    ],
    nodered: [
      'Cache health status',
      'Booking queue stats',
      'Show prompt versions',
    ],
  },
  'prod-tracker': {
    call: [
      'Show tracker stats',
      'Calls for patient Smith',
      'Find sessions with errors',
    ],
    cloud9: [
      'Find test record Canales',
      'Active test appointments',
      'Show cancelled appointments',
      'Family records',
      'Appointments by location',
    ],
    nodered: [
      'Show tracker stats',
      'Show prompt versions',
      'Cache health status',
    ],
  },
};

const ApiAgentChatPanel: React.FC<ApiAgentChatPanelProps> = ({ isOpen, onClose, pageContext, onLinkClick }) => {
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
  } = useApiAgentChat();

  const currentTenant = useAppSelector(selectCurrentTenant);
  const tenantKind: TenantKind = useMemo(() => {
    const slug = currentTenant?.slug || '';
    if (slug.includes('dominos')) return 'dominos';
    if (slug.includes('chord')) return 'chord';
    return 'ortho';
  }, [currentTenant?.slug]);

  // Select skill functions based on tenant
  const matchSkill = tenantKind === 'chord' ? matchChordSkill : matchCloud9Skill;
  const clearLastSkill = tenantKind === 'chord' ? clearChordLastSkill : clearCloud9LastSkill;
  const setCurrentApiSource = tenantKind === 'chord' ? setChordApiSource : setCloud9ApiSource;

  // Keep the skill registry aware of which tab is active
  useEffect(() => { setCurrentApiSource(apiSource); }, [apiSource, setCurrentApiSource]);

  const { width, isDragging, onMouseDown: onResizeMouseDown } = useResizablePanel({
    storageKey: 'api-agent-chat-width',
    defaultWidth: 600,
    minWidth: 360,
  });

  const [input, setInput] = useState('');
  const [skillRunning, setSkillRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isListening, isSupported: micSupported, startListening, stopListening } = useSpeechRecognition({
    onResult: (transcript) => setInput((prev) => {
      const base = prev.replace(/\u200B.*$/, '');
      return base + transcript;
    }),
    onInterim: (transcript) => setInput((prev) => {
      const base = prev.replace(/\u200B.*$/, '');
      return base + '\u200B' + transcript;
    }),
  });

  const handleMicClick = useCallback(() => {
    if (isListening) {
      stopListening();
      // Clean up interim marker
      setInput((prev) => prev.replace(/\u200B/g, ''));
    } else {
      // Clear interim markers before starting fresh
      setInput((prev) => prev.replace(/\u200B/g, ''));
      startListening();
    }
  }, [isListening, startListening, stopListening]);

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
    const cleaned = input.replace(/\u200B/g, '');
    if (!cleaned.trim() || isLoading || skillRunning) return;
    if (isListening) stopListening();
    handleSend(cleaned);
    setInput('');
  };

  const handleSuggestionClick = (query: string) => {
    handleSend(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Allow Escape to close the panel
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const suggestions = SUGGESTED_QUERIES[apiSource][tenantKind];
  const emptyStateText = EMPTY_STATE_TEXT[apiSource][tenantKind];
  const contextSuggestions = pageContext && pageContext !== 'default'
    ? CONTEXT_SUGGESTIONS[pageContext]?.[apiSource] ?? null
    : null;

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
        style={{ width: `${width}px` }}
        className={`
          fixed right-0 top-0 h-full max-w-full
          bg-white dark:bg-gray-900 shadow-2xl
          flex flex-col z-50
          ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'}
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        onKeyDown={handleKeyDown}
      >
        {/* Resize handle */}
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10
            hover:bg-indigo-400/40 active:bg-indigo-500/50 transition-colors"
        />
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
              onClick={() => { clearLastSkill(); clearChat(); }}
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
            onClick={() => { clearLastSkill(); setApiSource('call'); }}
            disabled={isLoading || skillRunning}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
              ${apiSource === 'call'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Call
          </button>
          <button
            onClick={() => { clearLastSkill(); setApiSource('cloud9'); }}
            disabled={isLoading || skillRunning}
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
            onClick={() => { clearLastSkill(); setApiSource('nodered'); }}
            disabled={isLoading || skillRunning}
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
              {contextSuggestions && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-2">
                    Suggested for this page
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mb-4">
                    {contextSuggestions.map((query) => (
                      <button
                        key={query}
                        onClick={() => handleSuggestionClick(query)}
                        className="px-3 py-1.5 text-xs font-medium rounded-full
                          bg-indigo-50 dark:bg-indigo-900/30
                          text-indigo-700 dark:text-indigo-300
                          hover:bg-indigo-100 dark:hover:bg-indigo-900/50
                          border border-indigo-200 dark:border-indigo-700
                          hover:border-indigo-400 dark:hover:border-indigo-600
                          transition-colors"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-2">
                    More queries
                  </p>
                </>
              )}
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
            <ChatMessage key={m.id} message={m} onNavigate={onClose} onLinkClick={onLinkClick} />
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
              value={input.replace(/\u200B/g, '')}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isListening
                  ? 'Listening...'
                  : tenantKind === 'dominos'
                    ? 'Ask about Dominos data...'
                    : tenantKind === 'chord'
                      ? 'Ask about Chord Dental IVA data...'
                      : apiSource === 'call'
                        ? 'Ask about call sessions & traces...'
                        : apiSource === 'cloud9'
                          ? 'Ask about Cloud9 API data...'
                          : 'Ask about Node-RED endpoints...'
              }
              disabled={isLoading || skillRunning}
              className={`flex-1 px-3 py-2 text-sm rounded-lg
                border ${isListening ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                disabled:opacity-50 disabled:cursor-not-allowed
                outline-none transition-colors`}
            />
            {micSupported && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={isLoading || skillRunning}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0
                  ${isListening
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isListening ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
                  )}
                </svg>
              </button>
            )}
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
