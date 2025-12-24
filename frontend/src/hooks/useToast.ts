/**
 * useToast Hook
 * Simplified toast notification helpers
 */

import { useAppDispatch } from '../store/hooks';
import { showToast } from '../store/slices/uiSlice';
import type { ToastType } from '../types';

export function useToast() {
  const dispatch = useAppDispatch();

  const show = (type: ToastType, message: string, duration?: number) => {
    dispatch(showToast({ type, message, duration }));
  };

  return {
    showSuccess: (message: string, duration?: number) => show('success', message, duration),
    showError: (message: string, duration?: number) => show('error', message, duration),
    showWarning: (message: string, duration?: number) => show('warning', message, duration),
    showInfo: (message: string, duration?: number) => show('info', message, duration),
  };
}
