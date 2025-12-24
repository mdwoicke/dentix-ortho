/**
 * API Communication Layer
 * Handles all communication with the Flowise prediction API
 */

// Use local proxy to avoid CORS issues
const API_URL = '/api/chat';

/**
 * Send a message to the Flowise API
 * @param {string} question - User's message
 * @param {string} sessionId - Session identifier for conversation context
 * @returns {Promise<Object>} - API response
 */
export async function sendMessage(question, sessionId) {
  const payload = {
    question: question,
    overrideConfig: {
      sessionId: sessionId
    }
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}
