/**
 * Chat Logic and Message Handling
 */

import { sendMessage } from './api.js';
import { getSessionId, saveHistory, loadHistory } from './session.js';
import { formatTime, escapeHtml } from './utils.js';

let messages = [];

/**
 * Create message HTML element
 * @param {string} content - Message content
 * @param {string} role - 'user' or 'ai'
 * @param {string} timestamp - ISO timestamp
 * @returns {HTMLElement} - Message element
 */
function createMessageElement(content, role, timestamp) {
  const div = document.createElement('div');
  div.className = `message message--${role}`;
  div.setAttribute('role', 'article');
  div.setAttribute('data-role', role);
  div.setAttribute('data-timestamp', timestamp);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message__content';
  contentDiv.innerHTML = escapeHtml(content);

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message__timestamp';
  timeDiv.textContent = formatTime(timestamp);

  div.appendChild(contentDiv);
  div.appendChild(timeDiv);

  return div;
}

/**
 * Add message to chat and render
 * @param {string} content - Message content
 * @param {string} role - 'user' or 'ai'
 * @returns {Object} - Message object
 */
export function addMessage(content, role) {
  const timestamp = new Date().toISOString();
  const message = { content, role, timestamp };
  messages.push(message);
  saveHistory(messages);

  const container = document.getElementById('messages-container');
  const element = createMessageElement(content, role, timestamp);
  container.appendChild(element);
  container.scrollTop = container.scrollHeight;

  return message;
}

/**
 * Show/hide typing indicator
 * @param {boolean} isTyping - Whether AI is typing
 */
export function setTyping(isTyping) {
  const indicator = document.getElementById('typing-indicator');
  indicator.hidden = !isTyping;

  if (isTyping) {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Send user message and get AI response
 * @param {string} text - User message text
 */
export async function handleUserMessage(text) {
  if (!text.trim()) return;

  // Add user message
  addMessage(text, 'user');

  // Show typing indicator
  setTyping(true);

  // Disable input while processing
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-button');
  input.disabled = true;
  sendBtn.disabled = true;

  try {
    const sessionId = getSessionId();
    const response = await sendMessage(text, sessionId);

    // Extract response text (handle different response formats)
    const aiText = response.text || response.answer || response.response ||
                   (typeof response === 'string' ? response : JSON.stringify(response));

    addMessage(aiText, 'ai');
  } catch (error) {
    console.error('API Error:', error);
    addMessage('Sorry, I encountered an error. Please try again.', 'ai');
  } finally {
    setTyping(false);
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/**
 * Clear all messages
 */
export function clearMessages() {
  messages = [];
  const container = document.getElementById('messages-container');
  container.innerHTML = '';
}

/**
 * Initialize chat with saved history
 */
export function initializeChat() {
  messages = loadHistory();
  const container = document.getElementById('messages-container');

  messages.forEach(msg => {
    const element = createMessageElement(msg.content, msg.role, msg.timestamp);
    container.appendChild(element);
  });

  container.scrollTop = container.scrollHeight;
}
