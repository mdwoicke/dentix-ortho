/**
 * SSH Config Modal Component
 * Modal for managing SSH target configurations
 */

import { useState, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';

export interface SSHTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'key' | 'password';
  privateKeyPath?: string;
  password?: string;
  workDir?: string;
}

interface SSHConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  targets: SSHTarget[];
  defaultTarget: string;
  onSave: (target: SSHTarget) => Promise<void>;
  onDelete: (targetId: string) => Promise<void>;
  onSetDefault: (targetId: string) => Promise<void>;
  onTest: (targetId: string) => Promise<{ success: boolean; message: string; latency?: number }>;
}

export function SSHConfigModal({
  isOpen,
  onClose,
  targets,
  defaultTarget,
  onSave,
  onDelete,
  onSetDefault,
  onTest
}: SSHConfigModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<SSHTarget | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedTargetId(null);
      setEditingTarget(null);
      setIsEditing(false);
      setTestResult(null);
    }
  }, [isOpen]);

  const handleAddNew = () => {
    setEditingTarget({
      id: `target-${Date.now()}`,
      name: '',
      host: '',
      port: 22,
      username: '',
      authType: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
      workDir: ''
    });
    setIsEditing(true);
    setTestResult(null);
  };

  const handleEdit = (target: SSHTarget) => {
    setEditingTarget({ ...target });
    setIsEditing(true);
    setTestResult(null);
  };

  const handleCancel = () => {
    setEditingTarget(null);
    setIsEditing(false);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!editingTarget) return;

    setIsSaving(true);
    try {
      await onSave(editingTarget);
      setEditingTarget(null);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving target:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    const targetId = editingTarget?.id || selectedTargetId;
    if (!targetId) return;

    // If editing, need to save first
    if (isEditing && editingTarget) {
      setIsSaving(true);
      try {
        await onSave(editingTarget);
      } catch (error) {
        console.error('Error saving before test:', error);
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(targetId);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: (error as Error).message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async (targetId: string) => {
    if (!confirm('Are you sure you want to delete this SSH target?')) return;
    try {
      await onDelete(targetId);
    } catch (error) {
      console.error('Error deleting target:', error);
    }
  };

  const baseInputClass = `
    w-full px-3 py-2 rounded-md border
    bg-white dark:bg-gray-700
    border-gray-300 dark:border-gray-600
    text-gray-900 dark:text-white
    placeholder-gray-500 dark:placeholder-gray-400
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
  `;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SSH Targets">
      <div className="space-y-4">
        {!isEditing ? (
          <>
            {/* Target List */}
            <div className="space-y-2">
              {targets.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No SSH targets configured
                </p>
              ) : (
                targets.map(target => (
                  <div
                    key={target.id}
                    className={`
                      p-3 rounded-md border cursor-pointer transition-colors
                      ${selectedTargetId === target.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }
                    `}
                    onClick={() => setSelectedTargetId(target.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {target.name}
                          </span>
                          {target.id === defaultTarget && (
                            <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {target.username}@{target.host}:{target.port}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleEdit(target); }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleDelete(target.id); }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button onClick={handleAddNew} variant="primary">
                Add Target
              </Button>
              {selectedTargetId && selectedTargetId !== defaultTarget && (
                <Button
                  onClick={() => onSetDefault(selectedTargetId)}
                  variant="secondary"
                >
                  Set as Default
                </Button>
              )}
              {selectedTargetId && (
                <Button
                  onClick={handleTest}
                  variant="secondary"
                  disabled={isTesting}
                >
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </Button>
              )}
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-3 rounded-md ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'}`}>
                <p className="font-medium">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</p>
                <p className="text-sm">{testResult.message}</p>
                {testResult.latency && <p className="text-sm">Latency: {testResult.latency}ms</p>}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Edit Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={editingTarget?.name || ''}
                  onChange={(e) => setEditingTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="My Server"
                  className={baseInputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Host *
                  </label>
                  <input
                    type="text"
                    value={editingTarget?.host || ''}
                    onChange={(e) => setEditingTarget(prev => prev ? { ...prev, host: e.target.value } : null)}
                    placeholder="192.168.1.1 or hostname"
                    className={baseInputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={editingTarget?.port || 22}
                    onChange={(e) => setEditingTarget(prev => prev ? { ...prev, port: parseInt(e.target.value) || 22 } : null)}
                    className={baseInputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={editingTarget?.username || ''}
                  onChange={(e) => setEditingTarget(prev => prev ? { ...prev, username: e.target.value } : null)}
                  placeholder="root"
                  className={baseInputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Authentication Type
                </label>
                <select
                  value={editingTarget?.authType || 'key'}
                  onChange={(e) => setEditingTarget(prev => prev ? { ...prev, authType: e.target.value as 'key' | 'password' } : null)}
                  className={baseInputClass}
                >
                  <option value="key">SSH Key</option>
                  <option value="password">Password</option>
                </select>
              </div>

              {editingTarget?.authType === 'key' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Private Key Path
                  </label>
                  <input
                    type="text"
                    value={editingTarget?.privateKeyPath || ''}
                    onChange={(e) => setEditingTarget(prev => prev ? { ...prev, privateKeyPath: e.target.value } : null)}
                    placeholder="~/.ssh/id_rsa"
                    className={baseInputClass}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={editingTarget?.password || ''}
                    onChange={(e) => setEditingTarget(prev => prev ? { ...prev, password: e.target.value } : null)}
                    placeholder="Enter password"
                    className={baseInputClass}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Working Directory
                </label>
                <input
                  type="text"
                  value={editingTarget?.workDir || ''}
                  onChange={(e) => setEditingTarget(prev => prev ? { ...prev, workDir: e.target.value } : null)}
                  placeholder="/home/user/project"
                  className={baseInputClass}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Default directory for running commands
                </p>
              </div>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-3 rounded-md ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'}`}>
                <p className="font-medium">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</p>
                <p className="text-sm">{testResult.message}</p>
                {testResult.latency && <p className="text-sm">Latency: {testResult.latency}ms</p>}
              </div>
            )}

            {/* Form Actions */}
            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button onClick={handleCancel} variant="secondary">
                Cancel
              </Button>
              <Button
                onClick={handleTest}
                variant="secondary"
                disabled={isTesting || !editingTarget?.host || !editingTarget?.username}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button
                onClick={handleSave}
                variant="primary"
                disabled={isSaving || !editingTarget?.name || !editingTarget?.host || !editingTarget?.username}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default SSHConfigModal;
