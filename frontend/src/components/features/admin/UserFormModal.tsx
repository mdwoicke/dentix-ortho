/**
 * User Form Modal
 * Modal for adding or editing users
 */

import { useState, useEffect } from 'react';
import { Modal, Button, Input } from '../../ui';
import type { User, TabPermission } from '../../../types/auth.types';

const ALL_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'test_monitor', label: 'Test Monitor' },
  { key: 'settings', label: 'Settings' },
  { key: 'goal_tests', label: 'Goal Tests' },
  { key: 'goal_test_generator', label: 'Goal Test Generator' },
  { key: 'history', label: 'History' },
  { key: 'tuning', label: 'Tuning' },
  { key: 'ab_testing_sandbox', label: 'A/B Testing' },
  { key: 'ai_prompting', label: 'AI Prompting' },
  { key: 'api_testing', label: 'API Testing' },
  { key: 'advanced', label: 'Advanced' },
] as const;

interface UserFormData {
  email: string;
  display_name?: string;
  is_admin: boolean;
  is_active: boolean;
  permissions: TabPermission[];
}

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UserFormData) => Promise<void>;
  user: User | null; // null for new user, User for edit
}

export function UserFormModal({ isOpen, onClose, onSubmit, user }: UserFormModalProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens/closes or user changes
  useEffect(() => {
    if (isOpen) {
      if (user) {
        setEmail(user.email);
        setDisplayName(user.display_name || '');
        setIsAdmin(user.is_admin);
        setIsActive(user.is_active);
        // Build permissions object
        const perms: Record<string, boolean> = {};
        ALL_TABS.forEach(tab => {
          const perm = user.permissions.find(p => p.tab_key === tab.key);
          perms[tab.key] = perm?.can_access ?? false;
        });
        setPermissions(perms);
      } else {
        setEmail('');
        setDisplayName('');
        setIsAdmin(false);
        setIsActive(true);
        // Default all permissions to true for new users
        const perms: Record<string, boolean> = {};
        ALL_TABS.forEach(tab => {
          perms[tab.key] = true;
        });
        setPermissions(perms);
      }
      setError('');
    }
  }, [isOpen, user]);

  const handlePermissionChange = (tabKey: string, checked: boolean) => {
    setPermissions(prev => ({ ...prev, [tabKey]: checked }));
  };

  const handleSelectAll = () => {
    const perms: Record<string, boolean> = {};
    ALL_TABS.forEach(tab => {
      perms[tab.key] = true;
    });
    setPermissions(perms);
  };

  const handleSelectNone = () => {
    const perms: Record<string, boolean> = {};
    ALL_TABS.forEach(tab => {
      perms[tab.key] = false;
    });
    setPermissions(perms);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email
    if (!email) {
      setError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return;
    }

    // Build permissions array
    const permissionsList: TabPermission[] = ALL_TABS.map(tab => ({
      tab_key: tab.key,
      can_access: permissions[tab.key] ?? false,
    }));

    setIsSubmitting(true);
    try {
      await onSubmit({
        email,
        display_name: displayName || undefined,
        is_admin: isAdmin,
        is_active: isActive,
        permissions: permissionsList,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={user ? 'Edit User' : 'Add User'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error */}
        {error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Email */}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
          autoFocus
        />

        {/* Display Name */}
        <Input
          label="Display Name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="John Doe (optional)"
        />

        {/* Admin & Active Toggles */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Admin</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
        </div>

        {/* Tab Permissions */}
        {!isAdmin && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Tab Permissions
              </label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Select All
                </button>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  onClick={handleSelectNone}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Select None
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
              {ALL_TABS.map(tab => (
                <label key={tab.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions[tab.key] ?? false}
                    onChange={(e) => handlePermissionChange(tab.key, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{tab.label}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Admin users automatically have access to all tabs
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Admin users have access to all tabs automatically
            </p>
          </div>
        )}

        {/* Actions */}
        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : user ? 'Update User' : 'Add User'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default UserFormModal;
