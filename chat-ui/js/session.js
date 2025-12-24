/**
 * Session Management
 * Handles session ID generation and storage
 */

const SESSION_KEY = 'chat_session_id';
const HISTORY_KEY = 'chat_history';

/**
 * Generate a UUID v4
 * @returns {string} - UUID string
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or create session ID
 * @returns {string} - Session ID
 */
export function getSessionId() {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Clear session and start fresh
 * @returns {string} - New session ID
 */
export function clearSession() {
  const newSessionId = generateUUID();
  sessionStorage.setItem(SESSION_KEY, newSessionId);
  sessionStorage.removeItem(HISTORY_KEY);
  return newSessionId;
}

/**
 * Save chat history to sessionStorage
 * @param {Array} messages - Array of message objects
 */
export function saveHistory(messages) {
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
}

/**
 * Load chat history from sessionStorage
 * @returns {Array} - Array of message objects
 */
export function loadHistory() {
  const stored = sessionStorage.getItem(HISTORY_KEY);
  return stored ? JSON.parse(stored) : [];
}
