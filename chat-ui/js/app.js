/**
 * Main Application Entry Point
 */

import { handleUserMessage, clearMessages, initializeChat } from './chat.js';
import { clearSession } from './session.js';
import { autoResizeTextarea } from './utils.js';

/**
 * Initialize application
 */
function init() {
  // Initialize chat with any saved history
  initializeChat();

  // Get DOM elements
  const form = document.getElementById('chat-form');
  const input = document.getElementById('message-input');
  const clearButton = document.getElementById('clear-chat');

  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();

    if (text) {
      input.value = '';
      input.style.height = 'auto';
      await handleUserMessage(text);
    }
  });

  // Handle Enter key (Shift+Enter for new line)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    autoResizeTextarea(input);
  });

  // Handle clear chat
  clearButton.addEventListener('click', () => {
    if (confirm('Clear all messages and start a new conversation?')) {
      clearMessages();
      clearSession();
    }
  });

  // Focus input on load
  input.focus();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
