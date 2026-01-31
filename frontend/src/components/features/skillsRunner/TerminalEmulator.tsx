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

export interface AgentReport {
  agent: string;
  sessionId: string;
  timestamp: string;
  status: 'success' | 'failure' | 'warning';
  summary: {
    toolCalls: number;
    errors: number;
    duration: string;
    [key: string]: unknown;
  };
  failurePatterns?: Array<{
    code: string;
    name: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    evidence: string;
    confidence?: string;
  }>;
  timeline?: Array<{
    time: string;
    action: string;
    status: 'ok' | 'error' | 'warning';
    detail?: string;
  }>;
  rootCause?: string;
  recommendations?: string[];
  actionableSteps?: Array<{
    step: number;
    action: string;
    detail: string;
    command?: string;
  }>;
  diagnostics?: {
    toolCalls?: Array<{
      name: string;
      timestamp: string;
      status: 'ok' | 'error';
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      issue?: string;
    }>;
    dataIssues?: Array<{
      field: string;
      expected: string;
      actual: string;
      source: string;
    }>;
    conversationExcerpts?: Array<{
      role: string;
      content: string;
      issue?: string;
    }>;
  };
}

export interface AgentReportData {
  json: AgentReport;
  markdown?: string;
}

interface TerminalEmulatorProps {
  sessionId: string | null;
  onSessionEnd?: (exitCode: number) => void;
  onReportReady?: (report: AgentReportData) => void;
  className?: string;
}

export function TerminalEmulator({ sessionId, onSessionEnd, onReportReady, className = '' }: TerminalEmulatorProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const outputBufferRef = useRef<string>('');

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
    outputBufferRef.current = '';

    const REPORT_JSON_START = '<!-- AGENT_REPORT_JSON -->';
    const REPORT_JSON_END = '<!-- END_AGENT_REPORT -->';
    const REPORT_MD_START = '<!-- AGENT_REPORT_MD -->';
    const REPORT_MD_END = '<!-- END_AGENT_REPORT_MD -->';

    let reportJson: AgentReport | null = null;
    let reportMd: string | undefined;

    const extractReport = (buffer: string) => {
      // Extract JSON report
      const jsonStart = buffer.indexOf(REPORT_JSON_START);
      const jsonEnd = buffer.indexOf(REPORT_JSON_END);
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = buffer.substring(jsonStart + REPORT_JSON_START.length, jsonEnd);
        try {
          reportJson = JSON.parse(jsonStr);
        } catch { /* ignore parse errors */ }
      }

      // Extract markdown report
      const mdStart = buffer.indexOf(REPORT_MD_START);
      const mdEnd = buffer.indexOf(REPORT_MD_END);
      if (mdStart !== -1 && mdEnd !== -1) {
        reportMd = buffer.substring(mdStart + REPORT_MD_START.length, mdEnd);
      }
    };

    const eventSource = new EventSource(
      `${API_CONFIG.BASE_URL}/skills-runner/sessions/${sessionId}/stream`
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            break;
          case 'data':
            outputBufferRef.current += data.content;
            // Don't render report markers to terminal
            if (!data.content.includes('<!-- AGENT_REPORT')) {
              terminal.write(data.content);
            }
            break;
          case 'status':
            if (data.status === 'failed' && data.error) {
              terminal.writeln(`\r\n\x1b[31m[Error: ${data.error}]\x1b[0m`);
            }
            break;
          case 'end':
            // Check for report in buffered output
            extractReport(outputBufferRef.current);
            if (reportJson && onReportReady) {
              onReportReady({ json: reportJson, markdown: reportMd });
            }
            if (onSessionEnd) {
              onSessionEnd(data.exitCode);
            }
            break;
          case 'error':
            terminal.writeln(`\r\n\x1b[31m[${data.message}]\x1b[0m`);
            break;
        }
      } catch {
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
