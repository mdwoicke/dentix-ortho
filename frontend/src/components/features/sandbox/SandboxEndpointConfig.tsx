/**
 * SandboxEndpointConfig Component
 * Configure the Flowise endpoint URL and API key for a sandbox
 */

import { useState, useEffect } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';
import { testFlowiseConnection } from '../../../services/api/sandboxApi';
import type { Sandbox, SelectedSandbox } from '../../../types/sandbox.types';

interface SandboxEndpointConfigProps {
  sandbox: Sandbox | undefined;
  selectedSandbox: SelectedSandbox;
  onSave: (endpoint: string, apiKey: string) => Promise<void>;
  loading?: boolean;
}

export function SandboxEndpointConfig({
  sandbox,
  selectedSandbox,
  onSave,
  loading = false,
}: SandboxEndpointConfigProps) {
  const [endpoint, setEndpoint] = useState(sandbox?.flowiseEndpoint || '');
  const [apiKey, setApiKey] = useState(sandbox?.flowiseApiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Update fields when sandbox changes
  useEffect(() => {
    setEndpoint(sandbox?.flowiseEndpoint || '');
    setApiKey(sandbox?.flowiseApiKey || '');
    setHasChanges(false);
    setTestResult(null);
  }, [sandbox?.flowiseEndpoint, sandbox?.flowiseApiKey, selectedSandbox]);

  const checkForChanges = (newEndpoint: string, newApiKey: string) => {
    const endpointChanged = newEndpoint !== (sandbox?.flowiseEndpoint || '');
    const apiKeyChanged = newApiKey !== (sandbox?.flowiseApiKey || '');
    setHasChanges(endpointChanged || apiKeyChanged);
  };

  const handleEndpointChange = (value: string) => {
    setEndpoint(value);
    checkForChanges(value, apiKey);
    setTestResult(null);
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    checkForChanges(endpoint, value);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(endpoint, apiKey);
      setHasChanges(false);
      setTestResult({ success: true, message: 'Configuration saved successfully' });
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to save configuration' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!endpoint || isTesting) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testFlowiseConnection(endpoint, apiKey || undefined);
      setTestResult({
        success: result.success,
        message: result.success
          ? (result.responseTimeMs ? `Endpoint reachable (${result.responseTimeMs}ms)` : 'Endpoint is reachable')
          : (result.message || 'Connection failed'),
      });
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const sandboxColor = selectedSandbox === 'sandbox_a' ? 'blue' : 'purple';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-2 h-2 rounded-full',
          sandboxColor === 'blue' ? 'bg-blue-500' : 'bg-purple-500'
        )} />
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Flowise Endpoint
        </h3>
        {sandbox?.flowiseEndpoint && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Configured
          </span>
        )}
      </div>

      {/* Endpoint URL */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Prediction API URL
        </label>
        <input
          type="url"
          value={endpoint}
          onChange={(e) => handleEndpointChange(e.target.value)}
          placeholder="https://flowise.example.com/api/v1/prediction/..."
          disabled={loading || isSaving}
          className={cn(
            'w-full px-3 py-2 text-sm border rounded-lg transition-colors',
            'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
            'placeholder-gray-400 dark:placeholder-gray-500',
            'border-gray-300 dark:border-gray-600',
            'focus:outline-none focus:ring-2',
            sandboxColor === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-purple-500',
            (loading || isSaving) && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          API Key (optional)
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder="Enter API key if required..."
            disabled={loading || isSaving}
            className={cn(
              'w-full px-3 py-2 pr-10 text-sm border rounded-lg transition-colors',
              'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'border-gray-300 dark:border-gray-600',
              'focus:outline-none focus:ring-2',
              sandboxColor === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-purple-500',
              (loading || isSaving) && 'opacity-50 cursor-not-allowed'
            )}
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showApiKey ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={!endpoint || isTesting || isSaving}
          className={cn(
            'flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
            'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
            'hover:bg-gray-200 dark:hover:bg-gray-600',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2'
          )}
        >
          {isTesting ? (
            <>
              <Spinner size="sm" />
              Testing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Test Connection
            </>
          )}
        </button>

        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={cn(
            'flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
            hasChanges
              ? sandboxColor === 'blue'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2'
          )}
        >
          {isSaving ? (
            <>
              <Spinner size="sm" />
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save
            </>
          )}
        </button>
      </div>

      {/* Test/Save Result */}
      {testResult && (
        <div className={cn(
          'px-3 py-2 text-sm rounded-lg flex items-center gap-2',
          testResult.success
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        )}>
          {testResult.success ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {testResult.message}
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Enter the Flowise prediction API URL and optional API key for authentication.
      </p>
    </div>
  );
}
