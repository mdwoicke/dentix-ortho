/**
 * MainLayout Component
 * Main application layout with navbar, sidebar, and content area
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectToasts, hideToast } from '../../store/slices/uiSlice';

export function MainLayout() {
  const dispatch = useAppDispatch();
  const toasts = useAppSelector(selectToasts);

  const handleCloseToast = (id: string) => {
    dispatch(hideToast(id));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors">
      {/* Navbar */}
      <Navbar />

      {/* Main content area */}
      <div className="flex">
        {/* Sidebar */}
        <Sidebar />

        {/* Page content */}
        <main className="flex-1 p-6 bg-gray-50 dark:bg-slate-900 transition-colors">
          <Outlet />
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={handleCloseToast} position="top-right" />
    </div>
  );
}
