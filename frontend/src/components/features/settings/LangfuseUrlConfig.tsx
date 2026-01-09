/**
 * LangfuseUrlConfig Component
 * Configure the Langfuse host URL and API keys in app settings
 */

import { useState, useEffect } from 'react';
import { Spinner } from '../../ui';
import { cn } from '../../../utils/cn';
import {
  getAppSettings,
  updateAppSettings,
  testLangfuseConnection,
} from '../../../services/api/appSettingsApi';
import type { AppSettings } from '../../../types/appSettings.types';

interface LangfuseUrlConfigProps {
  className?: string;
}

export function LangfuseUrlConfig({ className }: LangfuseUrlConfigProps) {
  const [host, setHost] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalHost, setOriginalHost] = useState('');
  const [originalPublicKey, setOriginalPublicKey] = useState('');
  const [originalProjectId, setOriginalProjectId] = useState('');
  const [originalSecretKeySet, setOriginalSecretKeySet] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const settings: AppSettings = await getAppSettings();
      const hostValue = settings.langfuseHost?.value || '';
      const publicKeyValue = settings.langfusePublicKey?.value || '';
      const projectIdValue = settings.langfuseProjectId?.value || '';
      setHost(hostValue);
      setPublicKey(publicKeyValue);
      setProjectId(projectIdValue);
      setOriginalHost(hostValue);
      setOriginalPublicKey(publicKeyValue);
      setOriginalProjectId(projectIdValue);
      setOriginalSecretKeySet(settings.langfuseSecretKey?.hasValue || false);
      // Secret key is masked, so we don't set it - only show if it has a value
      if (settings.langfuseSecretKey?.hasValue) {
        setSecretKey('********');
      }
    } catch (error) {
      console.error('Failed to load app settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkForChanges = (newHost: string, newPublicKey: string, newSecretKey: string, newProjectId: string) => {
    const hostChanged = newHost !== originalHost;
    const publicKeyChanged = newPublicKey !== originalPublicKey;
    const projectIdChanged = newProjectId !== originalProjectId;
    const secretKeyChanged = newSecretKey !== '********' && newSecretKey !== '';
    setHasChanges(hostChanged || publicKeyChanged || projectIdChanged || secretKeyChanged);
  };

  const handleHostChange = (value: string) => {
    setHost(value);
    checkForChanges(value, publicKey, secretKey, projectId);
    setTestResult(null);
  };

  const handlePublicKeyChange = (value: string) => {
    setPublicKey(value);
    checkForChanges(host, value, secretKey, projectId);
    setTestResult(null);
  };

  const handleSecretKeyChange = (value: string) => {
    setSecretKey(value);
    checkForChanges(host, publicKey, value, projectId);
    setTestResult(null);
  };

  const handleProjectIdChange = (value: string) => {
    setProjectId(value);
    checkForChanges(host, publicKey, secretKey, value);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    try {
      const updates: Record<string, string> = {};

      if (host !== originalHost) {
        updates.langfuseHost = host;
      }

      if (publicKey !== originalPublicKey) {
        updates.langfusePublicKey = publicKey;
      }

      if (projectId !== originalProjectId) {
        updates.langfuseProjectId = projectId;
      }

      // Only update secret key if it's not the masked placeholder
      if (secretKey !== '********' && secretKey !== '') {
        updates.langfuseSecretKey = secretKey;
      }

      await updateAppSettings(updates);
      setOriginalHost(host);
      setOriginalPublicKey(publicKey);
      setOriginalProjectId(projectId);
      if (secretKey !== '********') {
        setOriginalSecretKeySet(!!secretKey);
      }
      setHasChanges(false);
      setTestResult({ success: true, message: 'Settings saved successfully' });
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (isTesting) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      // If there are unsaved changes, save first
      if (hasChanges) {
        await handleSave();
      }

      const result = await testLangfuseConnection();
      setTestResult({
        success: result.success,
        message: result.success
          ? (result.responseTimeMs ? `Connection successful (${result.responseTimeMs}ms)` : 'Connection successful')
          : (result.message || 'Connection failed'),
      });
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <Spinner size="md" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading settings...</span>
      </div>
    );
  }

  const isConfigured = originalHost && originalPublicKey && originalSecretKeySet;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Langfuse Configuration
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure Langfuse for prompt management and tracing
          </p>
        </div>
        {isConfigured && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Configured
          </span>
        )}
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
        {/* Host URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Host URL
          </label>
          <input
            type="url"
            value={host}
            onChange={(e) => handleHostChange(e.target.value)}
            placeholder="https://langfuse.example.com"
            disabled={isSaving}
            className={cn(
              'w-full px-3 py-2 text-sm border rounded-lg transition-colors',
              'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'border-gray-300 dark:border-gray-600',
              'focus:outline-none focus:ring-2 focus:ring-purple-500',
              isSaving && 'opacity-50 cursor-not-allowed'
            )}
          />
        </div>

        {/* Public Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Public Key
          </label>
          <input
            type="text"
            value={publicKey}
            onChange={(e) => handlePublicKeyChange(e.target.value)}
            placeholder="pk-lf-..."
            disabled={isSaving}
            className={cn(
              'w-full px-3 py-2 text-sm border rounded-lg transition-colors',
              'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'border-gray-300 dark:border-gray-600',
              'focus:outline-none focus:ring-2 focus:ring-purple-500',
              isSaving && 'opacity-50 cursor-not-allowed'
            )}
          />
        </div>

        {/* Secret Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Secret Key
          </label>
          <div className="relative">
            <input
              type={showSecretKey ? 'text' : 'password'}
              value={secretKey}
              onChange={(e) => handleSecretKeyChange(e.target.value)}
              placeholder="sk-lf-..."
              disabled={isSaving}
              className={cn(
                'w-full px-3 py-2 pr-10 text-sm border rounded-lg transition-colors',
                'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
                'placeholder-gray-400 dark:placeholder-gray-500',
                'border-gray-300 dark:border-gray-600',
                'focus:outline-none focus:ring-2 focus:ring-purple-500',
                isSaving && 'opacity-50 cursor-not-allowed'
              )}
            />
            <button
              type="button"
              onClick={() => setShowSecretKey(!showSecretKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showSecretKey ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Project ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Project ID
          </label>
          <input
            type="text"
            value={projectId}
            onChange={(e) => handleProjectIdChange(e.target.value)}
            placeholder="cmk2l64ij000npc065mawjmyr"
            disabled={isSaving}
            className={cn(
              'w-full px-3 py-2 text-sm border rounded-lg transition-colors',
              'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'border-gray-300 dark:border-gray-600',
              'focus:outline-none focus:ring-2 focus:ring-purple-500',
              isSaving && 'opacity-50 cursor-not-allowed'
            )}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Found in Langfuse URL: /project/<span className="font-mono text-purple-600 dark:text-purple-400">[project-id]</span>/...
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleTest}
            disabled={!host || !publicKey || isTesting || isSaving}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
              'hover:bg-gray-300 dark:hover:bg-gray-600',
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
              'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              hasChanges
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
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
            'px-4 py-3 text-sm rounded-lg flex items-center gap-2',
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          )}>
            {testResult.success ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
            {testResult.message}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Langfuse is used for prompt versioning, tracing, and analytics. The sync hook uses these credentials to sync V1 files.
      </p>
    </div>
  );
}
