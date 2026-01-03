/**
 * Change Password Modal
 * Modal for changing user password (required on first login with temp password)
 */

import { useState } from 'react';
import { Modal, Button, Input } from '../../ui';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  changePassword,
  selectAuthLoading,
  selectAuthError,
  clearError
} from '../../../store/slices/authSlice';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isForced?: boolean; // If true, user cannot close the modal
}

export function ChangePasswordModal({ isOpen, onClose, isForced = false }: ChangePasswordModalProps) {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectAuthLoading);
  const error = useAppSelector(selectAuthError);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleClose = () => {
    if (isForced) return; // Cannot close if forced
    dispatch(clearError());
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setValidationError('');
    onClose?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setValidationError('All fields are required');
      return;
    }

    if (newPassword.length < 8) {
      setValidationError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setValidationError('New password must be different from current password');
      return;
    }

    const result = await dispatch(changePassword({ currentPassword, newPassword }));

    if (changePassword.fulfilled.match(result)) {
      // Password changed successfully
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      handleClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Password"
      size="sm"
      closeOnBackdrop={!isForced}
      showCloseButton={!isForced}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Forced message */}
        {isForced && (
          <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              You must change your temporary password before continuing.
            </p>
          </div>
        )}

        {/* Error Message */}
        {(error || validationError) && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">
              {validationError || error}
            </p>
          </div>
        )}

        {/* Current Password */}
        <Input
          label="Current Password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter your current password"
          required
          autoComplete="current-password"
          autoFocus
        />

        {/* New Password */}
        <Input
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password (min 8 characters)"
          required
          autoComplete="new-password"
          helperText="Minimum 8 characters"
        />

        {/* Confirm Password */}
        <Input
          label="Confirm New Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          required
          autoComplete="new-password"
        />

        {/* Actions */}
        <Modal.Footer>
          {!isForced && (
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
          >
            {isLoading ? 'Changing...' : 'Change Password'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default ChangePasswordModal;
