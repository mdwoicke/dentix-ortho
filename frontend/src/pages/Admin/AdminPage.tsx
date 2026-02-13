/**
 * Admin Page
 * Tabbed layout with User Management and Tenant Management
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Card, Button, Modal } from '../../components/ui';
import { UserFormModal } from '../../components/features/admin/UserFormModal';
import { TenantManagement } from './TenantManagement';
import * as adminApi from '../../services/api/adminApi';
import { ALL_TABS } from '../../types/auth.types';
import type { User, TabPermission } from '../../types/auth.types';

const ADMIN_TABS = [
  { key: 'users', label: 'Users' },
  { key: 'tenants', label: 'Tenants' },
] as const;

type AdminTab = typeof ADMIN_TABS[number]['key'];

function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showTempPasswordModal, setShowTempPasswordModal] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getUsers();
      setUsers(response.data.users);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = () => {
    setEditingUser(null);
    setIsFormOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.email}?`)) {
      return;
    }

    try {
      await adminApi.deleteUser(user.id);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!confirm(`Reset password for ${user.email}? A new temporary password will be generated.`)) {
      return;
    }

    try {
      const response = await adminApi.resetPassword(user.id);
      setTempPassword(response.data.tempPassword);
      setShowTempPasswordModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
    }
  };

  const handleFormSubmit = async (data: {
    email: string;
    display_name?: string;
    is_admin: boolean;
    is_active: boolean;
    permissions: TabPermission[];
  }) => {
    try {
      if (editingUser) {
        await adminApi.updateUser(editingUser.id, {
          email: data.email,
          display_name: data.display_name,
          is_admin: data.is_admin,
          is_active: data.is_active,
        });
        await adminApi.setUserPermissions(editingUser.id, { permissions: data.permissions });
      } else {
        const response = await adminApi.createUser({
          email: data.email,
          display_name: data.display_name,
          is_admin: data.is_admin,
          is_active: data.is_active,
          permissions: data.permissions,
        });
        setTempPassword(response.data.tempPassword);
        setShowTempPasswordModal(true);
      }

      setIsFormOpen(false);
      fetchUsers();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to save user');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Button onClick={handleAddUser}>Add User</Button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No users found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tabs</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Login</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {user.email}
                      {user.must_change_password && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400">
                          Temp Pass
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {user.display_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {user.is_admin ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {user.is_admin ? (
                        <span className="text-xs">All</span>
                      ) : (
                        <span className="text-xs">
                          {user.permissions.filter(p => p.can_access).length}/{ALL_TABS.length}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(user.last_login_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                          title="Edit user"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleResetPassword(user)}
                          className="p-1 text-gray-500 hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400"
                          title="Reset password"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                          title="Delete user"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* User Form Modal */}
      <UserFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        user={editingUser}
      />

      {/* Temp Password Modal */}
      <Modal
        isOpen={showTempPasswordModal}
        onClose={() => setShowTempPasswordModal(false)}
        title="Temporary Password"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {editingUser ? 'Password has been reset.' : 'User created successfully.'}
            {' '}Please share the temporary password below with the user. They will be prompted to change it on first login.
          </p>
          <div className="p-4 rounded-md bg-gray-100 dark:bg-gray-700 font-mono text-lg text-center">
            {tempPassword}
          </div>
          <Modal.Footer>
            <Button onClick={() => setShowTempPasswordModal(false)}>
              Close
            </Button>
          </Modal.Footer>
        </div>
      </Modal>
    </>
  );
}

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'users') as AdminTab;

  const setTab = (tab: AdminTab) => {
    setSearchParams({ tab });
  };

  return (
    <div>
      <PageHeader
        title="Administration"
        subtitle="Manage users and practice tenants"
      />

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-4 -mb-px">
          {ADMIN_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'users' && <UserManagement />}
      {activeTab === 'tenants' && <TenantManagement />}
    </div>
  );
}

export default AdminPage;
