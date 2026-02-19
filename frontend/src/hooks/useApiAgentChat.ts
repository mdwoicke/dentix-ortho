/**
 * useApiAgentChat Hook
 * Manages chat state and SSE streaming for the API Agent chat panel.
 * Uses raw fetch (not axios) because SSE streaming with ReadableStream
 * is not supported by axios.
 *
 * Messages, sessionId, and apiSource are persisted to localStorage so chat
 * history and preferences survive panel close/reopen and page refresh.
 *
 * Supports a `namespace` option so multiple independent chat instances
 * (e.g. Ortho vs Dominos) each get their own localStorage keys.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getAuthToken, getCurrentTenantId } from '../services/api/client';
import { STORAGE_KEYS } from '../utils/constants';

export type ApiSource = 'call' | 'cloud9' | 'nodered' | 'dominos-menu' | 'dominos-orders' | 'dominos-traces';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

/** Serializable shape stored in localStorage (Date → string). */
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface UseApiAgentChatOptions {
  /** Namespace for independent localStorage keys (e.g. 'dominos'). Default: none (uses base keys). */
  namespace?: string;
  /** Initial apiSource value. Default: 'cloud9'. */
  defaultSource?: ApiSource;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function generateSessionId(): string {
  return 'chat-' + generateId();
}

/** Resolve storage keys based on namespace. */
function getStorageKeys(namespace?: string) {
  if (namespace === 'dominos') {
    return {
      messages: STORAGE_KEYS.DOMINOS_CHAT_MESSAGES,
      sessionId: STORAGE_KEYS.DOMINOS_CHAT_SESSION_ID,
      source: STORAGE_KEYS.DOMINOS_CHAT_SOURCE,
    };
  }
  return {
    messages: STORAGE_KEYS.API_AGENT_MESSAGES,
    sessionId: STORAGE_KEYS.API_AGENT_SESSION_ID,
    source: STORAGE_KEYS.API_AGENT_SOURCE,
  };
}

function loadMessages(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const stored: StoredMessage[] = JSON.parse(raw);
    return stored.map(m => ({ ...m, timestamp: new Date(m.timestamp), isStreaming: false }));
  } catch {
    return [];
  }
}

function loadSessionId(key: string): string {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
  } catch {
    // fall through
  }
  const id = generateSessionId();
  try { localStorage.setItem(key, id); } catch { /* ignore */ }
  return id;
}

const VALID_SOURCES: ApiSource[] = ['call', 'cloud9', 'nodered', 'dominos-menu', 'dominos-orders', 'dominos-traces'];

function loadApiSource(key: string, defaultSource: ApiSource): ApiSource {
  try {
    const stored = localStorage.getItem(key);
    if (stored && VALID_SOURCES.includes(stored as ApiSource)) return stored as ApiSource;
  } catch {
    // fall through
  }
  return defaultSource;
}

function saveMessages(key: string, messages: ChatMessage[]): void {
  try {
    const toStore: StoredMessage[] = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    }));
    localStorage.setItem(key, JSON.stringify(toStore));
  } catch {
    // localStorage full or unavailable – silently ignore
  }
}

export function useApiAgentChat(options?: UseApiAgentChatOptions) {
  const namespace = options?.namespace;
  const defaultSource = options?.defaultSource ?? 'call';
  const keys = getStorageKeys(namespace);

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(keys.messages));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => loadSessionId(keys.sessionId));
  const [apiSource, setApiSourceState] = useState<ApiSource>(() => loadApiSource(keys.source, defaultSource));
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist messages to localStorage whenever they change and nothing is streaming.
  useEffect(() => {
    const anyStreaming = messages.some(m => m.isStreaming);
    if (!anyStreaming) {
      saveMessages(keys.messages, messages);
    }
  }, [messages, keys.messages]);

  // Persist sessionId to localStorage whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(keys.sessionId, sessionId);
    } catch { /* ignore */ }
  }, [sessionId, keys.sessionId]);

  // Persist apiSource to localStorage whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(keys.source, apiSource);
    } catch { /* ignore */ }
  }, [apiSource, keys.source]);

  const setApiSource = useCallback((source: ApiSource) => {
    setApiSourceState(source);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    // Add empty assistant message placeholder
    const assistantMessageId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);

    // Prepare abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Build headers including auth and tenant context
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const token = getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const tenantId = getCurrentTenantId();
      if (tenantId) {
        headers['X-Tenant-Id'] = String(tenantId);
      }

      const response = await fetch('/api/api-agent/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: trimmed, sessionId, source: apiSource }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMsg = `Request failed (${response.status})`;
        try {
          const parsed = JSON.parse(errorBody);
          errorMsg = parsed.error || parsed.message || errorMsg;
        } catch {
          // Use default error message
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const jsonStr = trimmedLine.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'chunk') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, content: m.content + (data.content || '') }
                    : m
                )
              );
            } else if (data.type === 'done') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, isStreaming: false }
                    : m
                )
              );
            } else if (data.type === 'error') {
              setError(data.error || data.message || 'Stream error');
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        isStreaming: false,
                        content: m.content || 'An error occurred while processing your request.',
                      }
                    : m
                )
              );
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Ensure streaming flag is cleared when stream ends naturally
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: false }
            : m
        )
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled the stream
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessageId
              ? { ...m, isStreaming: false, content: m.content || 'Message cancelled.' }
              : m
          )
        );
      } else {
        const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(errorMsg);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  isStreaming: false,
                  content: m.content || `Error: ${errorMsg}`,
                }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, sessionId, apiSource]);

  const clearChat = useCallback(() => {
    // Abort any in-flight stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setSessionId(generateSessionId());
    // Clear persisted data (keep apiSource preference)
    try {
      localStorage.removeItem(keys.messages);
      localStorage.removeItem(keys.sessionId);
    } catch { /* ignore */ }
  }, [keys.messages, keys.sessionId]);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /** Inject a user message + completed assistant response without calling the backend. */
  const addExchange = useCallback((userText: string, assistantText: string) => {
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };
    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: assistantText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sessionId,
    apiSource,
    setApiSource,
    sendMessage,
    clearChat,
    abortStream,
    addExchange,
  };
}
