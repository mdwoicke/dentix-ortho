/**
 * Terminal Emulator Component
 * Real-time terminal output using xterm.js
 */

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { API_CONFIG } from '../../../utils/constants';

interface TerminalEmulatorProps {
  sessionId: string | null;
  onSessionEnd?: (exitCode: number) => void;
  className?: string;
}

export function TerminalEmulator({ sessionId, onSessionEnd, className = '' }: TerminalEmulatorProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff'
      },
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      convertEol: true
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial message
    terminal.writeln('\x1b[90m[Terminal ready - waiting for session...]\x1b[0m');

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, []);

  // Connect to SSE stream when sessionId changes
  useEffect(() => {
    if (!sessionId || !xtermRef.current) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const terminal = xtermRef.current;
    terminal.clear();
    terminal.writeln('\x1b[90m[Connecting to session...]\x1b[0m\r\n');

    const eventSource = new EventSource(
      `${API_CONFIG.BASE_URL}/skills-runner/sessions/${sessionId}/stream`
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            // Connection established
            break;
          case 'data':
            terminal.write(data.content);
            break;
          case 'status':
            if (data.status === 'failed' && data.error) {
              terminal.writeln(`\r\n\x1b[31m[Error: ${data.error}]\x1b[0m`);
            }
            break;
          case 'end':
            if (onSessionEnd) {
              onSessionEnd(data.exitCode);
            }
            break;
          case 'error':
            terminal.writeln(`\r\n\x1b[31m[${data.message}]\x1b[0m`);
            break;
        }
      } catch {
        // Raw data, write directly
        terminal.write(event.data);
      }
    };

    eventSource.onerror = () => {
      terminal.writeln('\r\n\x1b[31m[Connection lost]\x1b[0m');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, onSessionEnd]);

  // Clear terminal
  const clear = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, []);

  // Write to terminal (for external use)
  const write = useCallback((text: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(text);
    }
  }, []);

  // Expose methods via ref if needed
  useEffect(() => {
    // Store methods on the component for external access if needed
  }, [clear, write]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={terminalRef}
        className="h-full w-full rounded-lg overflow-hidden"
        style={{ minHeight: '400px' }}
      />
      {!sessionId && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 rounded-lg">
          <span className="text-gray-400">Select a skill and click Run to start</span>
        </div>
      )}
    </div>
  );
}

export default TerminalEmulator;
