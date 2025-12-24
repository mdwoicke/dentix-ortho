# Chat UI

A standalone chat interface for testing the c1elly.ai Flowise API with browser automation tools like the Claude Chrome extension.

## Quick Start

1. Open a terminal in this directory
2. Run the server:
   ```bash
   python server.py
   ```
3. Open http://localhost:8080 in your browser

## Features

- **Chat Interface**: Clean message bubbles with user/AI distinction
- **Session History**: Conversation context maintained via sessionId
- **Typing Indicator**: Animated dots while waiting for AI response
- **Message Timestamps**: Time displayed on each message
- **Clear Chat**: Reset conversation and start fresh
- **Dark Mode**: Automatically adapts to system preference

## Usage

- Type your message and press **Enter** to send
- Press **Shift+Enter** for a new line
- Click the trash icon to clear the conversation

## Browser Automation Selectors

For Chrome extension / automation testing:

| Element | Selector |
|---------|----------|
| Message container | `#messages-container` |
| Input field | `#message-input` |
| Send button | `#send-button` |
| Clear button | `#clear-chat` |
| Typing indicator | `#typing-indicator` |
| User messages | `.message--user` |
| AI messages | `.message--ai` |

## Configuration

### Change Port

```bash
python server.py 3000
```

### API Endpoint

The Flowise API endpoint is configured in `server.py`:

```python
FLOWISE_API = "https://app.c1elly.ai/api/v1/prediction/5f1fa57c-e6fd-463c-ac6e-c73fd5fb578b"
```

## Troubleshooting

### "Connection refused" error
- Make sure the server is running (`python server.py`)
- Check if another process is using port 8080

### API errors
- The c1elly.ai API must be accessible
- Check browser console for detailed error messages

### Messages not persisting
- Session history is stored in `sessionStorage`
- History clears when you close the browser tab
- Use the Clear button to intentionally reset

## File Structure

```
chat-ui/
├── index.html      # Main HTML structure
├── css/
│   └── styles.css  # All styling
├── js/
│   ├── app.js      # Main entry point
│   ├── api.js      # API communication
│   ├── chat.js     # Chat logic
│   ├── session.js  # Session management
│   └── utils.js    # Utility functions
├── server.py       # HTTP server with API proxy
└── README.md       # This file
```
