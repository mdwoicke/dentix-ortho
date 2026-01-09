/**
 * LangfuseConnectionsManager Component
 * Modal for managing multiple Langfuse connections (CRUD operations)
 */

import { useState, useEffect } from 'react';
import { Button, Spinner } from '../../ui';
import {
  getLangfuseConfigs,
  createLangfuseConfig,
  updateLangfuseConfig,
  deleteLangfuseConfig,
  setLangfuseConfigDefault,
  testLangfuseConfigConnection,
} from '../../../services/api/appSettingsApi';
import type {
  LangfuseConfigProfile,
  LangfuseConfigRequest,
  ConfigTestResult,
} from '../../../types/appSettings.types';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  X: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Pencil: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Star: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ),
  StarOutline: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  Zap: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  EyeOff: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ),
  Server: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface LangfuseConnectionsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigsChanged?: () => void;
}

type ModalView = 'list' | 'add' | 'edit';

// ============================================================================
// CONNECTION FORM COMPONENT
// ============================================================================

interface ConnectionFormProps {
  initialData?: LangfuseConfigProfile | null;
  onSave: (data: LangfuseConfigRequest) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

function ConnectionForm({ initialData, onSave, onCancel, isSaving }: ConnectionFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [host, setHost] = useState(initialData?.host || '');
  const [publicKey, setPublicKey] = useState(initialData?.publicKey || '');
  const [secretKey, setSecretKey] = useState('');
  const [isDefault, setIsDefault] = useState(initialData?.isDefault || false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!initialData;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!host.trim()) {
      newErrors.host = 'Host URL is required';
    } else {
      try {
        new URL(host);
      } catch {
        newErrors.host = 'Invalid URL format';
      }
    }

    if (!publicKey.trim()) {
      newErrors.publicKey = 'Public key is required';
    }

    if (!isEdit && !secretKey.trim()) {
      newErrors.secretKey = 'Secret key is required for new connections';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data: LangfuseConfigRequest = {
      name: name.trim(),
      host: host.trim().replace(/\/$/, ''), // Remove trailing slash
      publicKey: publicKey.trim(),
      isDefault,
    };

    // Only include secret key if provided (for updates, empty means keep existing)
    if (secretKey.trim()) {
      data.secretKey = secretKey.trim();
    }

    await onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Connection Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Production, Staging, Development"
          disabled={isSaving}
          className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
      </div>

      {/* Host URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Host URL *
        </label>
        <input
          type="url"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="https://langfuse.example.com"
          disabled={isSaving}
          className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.host ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {errors.host && <p className="mt-1 text-xs text-red-500">{errors.host}</p>}
      </div>

      {/* Public Key */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Public Key *
        </label>
        <input
          type="text"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder="pk-lf-..."
          disabled={isSaving}
          className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.publicKey ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {errors.publicKey && <p className="mt-1 text-xs text-red-500">{errors.publicKey}</p>}
      </div>

      {/* Secret Key */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Secret Key {!isEdit && '*'}
          {isEdit && initialData?.hasSecretKey && (
            <span className="ml-2 text-xs text-gray-500">(leave empty to keep existing)</span>
          )}
        </label>
        <div className="relative">
          <input
            type={showSecretKey ? 'text' : 'password'}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={isEdit && initialData?.hasSecretKey ? '********' : 'sk-lf-...'}
            disabled={isSaving}
            className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.secretKey ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowSecretKey(!showSecretKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showSecretKey ? <Icons.EyeOff /> : <Icons.Eye />}
          </button>
        </div>
        {errors.secretKey && <p className="mt-1 text-xs text-red-500">{errors.secretKey}</p>}
      </div>

      {/* Set as Default */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isDefault"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          disabled={isSaving}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="isDefault" className="text-sm text-gray-700 dark:text-gray-300">
          Set as default connection
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Spinner size="sm" />
              Saving...
            </>
          ) : (
            <>
              <Icons.Check />
              {isEdit ? 'Update Connection' : 'Add Connection'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LangfuseConnectionsManager({
  isOpen,
  onClose,
  onConfigsChanged,
}: LangfuseConnectionsManagerProps) {
  const [view, setView] = useState<ModalView>('list');
  const [configs, setConfigs] = useState<LangfuseConfigProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<LangfuseConfigProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: ConfigTestResult } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load configs
  const loadConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getLangfuseConfigs();
      setConfigs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  };

  // Load on mount/open
  useEffect(() => {
    if (isOpen) {
      loadConfigs();
      setView('list');
      setEditingConfig(null);
      setTestResult(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view !== 'list') {
          setView('list');
          setEditingConfig(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, view, onClose]);

  // Handle add new connection
  const handleAdd = async (data: LangfuseConfigRequest) => {
    try {
      setIsSaving(true);
      setError(null);
      await createLangfuseConfig(data);
      await loadConfigs();
      setView('list');
      onConfigsChanged?.();
    } catch (err: any) {
      setError(err.message || 'Failed to create configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle update connection
  const handleUpdate = async (data: LangfuseConfigRequest) => {
    if (!editingConfig) return;

    try {
      setIsSaving(true);
      setError(null);
      await updateLangfuseConfig(editingConfig.id, data);
      await loadConfigs();
      setView('list');
      setEditingConfig(null);
      onConfigsChanged?.();
    } catch (err: any) {
      setError(err.message || 'Failed to update configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete connection
  const handleDelete = async (id: number) => {
    const config = configs.find(c => c.id === id);
    if (!config) return;

    if (!window.confirm(`Are you sure you want to delete "${config.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(id);
      setError(null);
      await deleteLangfuseConfig(id);
      await loadConfigs();
      onConfigsChanged?.();
    } catch (err: any) {
      setError(err.message || 'Failed to delete configuration');
    } finally {
      setDeletingId(null);
    }
  };

  // Handle set default
  const handleSetDefault = async (id: number) => {
    try {
      setError(null);
      await setLangfuseConfigDefault(id);
      await loadConfigs();
      onConfigsChanged?.();
    } catch (err: any) {
      setError(err.message || 'Failed to set default configuration');
    }
  };

  // Handle test connection
  const handleTest = async (id: number) => {
    try {
      setTestingId(id);
      setTestResult(null);
      const result = await testLangfuseConfigConnection(id);
      setTestResult({ id, result });
    } catch (err: any) {
      setTestResult({
        id,
        result: { success: false, message: err.message || 'Connection test failed' },
      });
    } finally {
      setTestingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={view === 'list' ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Icons.Server />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {view === 'list' && 'Manage Langfuse Connections'}
                {view === 'add' && 'Add New Connection'}
                {view === 'edit' && 'Edit Connection'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {view === 'list' && `${configs.length} connection${configs.length !== 1 ? 's' : ''} configured`}
                {view === 'add' && 'Configure a new Langfuse instance'}
                {view === 'edit' && editingConfig?.name}
              </p>
            </div>
          </div>
          <button
            onClick={view === 'list' ? onClose : () => { setView('list'); setEditingConfig(null); }}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Icons.X />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : configs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                    <Icons.Server />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No connections configured
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Add a Langfuse connection to start importing production traces.
                  </p>
                  <Button onClick={() => setView('add')} className="flex items-center gap-2 mx-auto">
                    <Icons.Plus />
                    Add Connection
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {configs.map((config) => (
                    <div
                      key={config.id}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white truncate">
                              {config.name}
                            </h3>
                            {config.isDefault && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                                <Icons.Star />
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                            {config.host}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Public Key: {config.publicKey.slice(0, 12)}...
                          </p>
                        </div>

                        <div className="flex items-center gap-1 ml-4">
                          {/* Test Button */}
                          <button
                            onClick={() => handleTest(config.id)}
                            disabled={testingId === config.id}
                            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                            title="Test connection"
                          >
                            {testingId === config.id ? <Spinner size="sm" /> : <Icons.Zap />}
                          </button>

                          {/* Set Default Button */}
                          {!config.isDefault && (
                            <button
                              onClick={() => handleSetDefault(config.id)}
                              className="p-2 text-gray-400 hover:text-yellow-600 dark:hover:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                              title="Set as default"
                            >
                              <Icons.StarOutline />
                            </button>
                          )}

                          {/* Edit Button */}
                          <button
                            onClick={() => { setEditingConfig(config); setView('edit'); }}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Icons.Pencil />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDelete(config.id)}
                            disabled={deletingId === config.id}
                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === config.id ? <Spinner size="sm" /> : <Icons.Trash />}
                          </button>
                        </div>
                      </div>

                      {/* Test Result */}
                      {testResult?.id === config.id && (
                        <div
                          className={`mt-3 p-2 text-sm rounded-lg flex items-center gap-2 ${
                            testResult.result.success
                              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          }`}
                        >
                          {testResult.result.success ? <Icons.Check /> : <Icons.X />}
                          {testResult.result.message}
                          {testResult.result.responseTimeMs && (
                            <span className="text-xs opacity-75">({testResult.result.responseTimeMs}ms)</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add Button */}
                  <button
                    onClick={() => setView('add')}
                    className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <Icons.Plus />
                    Add New Connection
                  </button>
                </div>
              )}
            </>
          )}

          {/* Add View */}
          {view === 'add' && (
            <ConnectionForm
              onSave={handleAdd}
              onCancel={() => setView('list')}
              isSaving={isSaving}
            />
          )}

          {/* Edit View */}
          {view === 'edit' && editingConfig && (
            <ConnectionForm
              initialData={editingConfig}
              onSave={handleUpdate}
              onCancel={() => { setView('list'); setEditingConfig(null); }}
              isSaving={isSaving}
            />
          )}
        </div>
      </div>
    </div>
  );
}
