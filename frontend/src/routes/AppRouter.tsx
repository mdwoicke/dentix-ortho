/**
 * AppRouter Component
 * Main application routing configuration with authentication
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../components/layout';
import { ProtectedRoute } from '../components/features/auth';
import { LoginPage } from '../pages/Auth/LoginPage';
import { AdminPage } from '../pages/Admin/AdminPage';
import { Dashboard } from '../pages/Dashboard';
import { PatientList } from '../pages/Patients/PatientList';
import { PatientDetail } from '../pages/Patients/PatientDetail';
import { AppointmentList } from '../pages/Appointments/AppointmentList';
import { AppointmentCalendar } from '../pages/Appointments/AppointmentCalendar';
import { Settings } from '../pages/Settings/Settings';
import {
  TestMonitorLayout,
  TestMonitorDashboard,
  TestRunDetail,
  TestRunHistory,
  AgentTuning,
  TestCasesPage,
  GoalTestsDashboard,
  CreateGoalTestPage,
  ABTestingDashboard,
  ABTestingSandbox,
  AIPromptingPage,
  APITestingPage,
} from '../pages/TestMonitor';
import { NotFound } from '../pages/NotFound';
import { ROUTES } from '../utils/constants';
import { useAppDispatch } from '../store/hooks';
import { initializeAuth } from '../store/slices/authSlice';

export function AppRouter() {
  const dispatch = useAppDispatch();

  // Initialize auth state on app load
  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Login route - outside protected area */}
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />

        {/* Main layout with nested protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route
            index
            element={
              <ProtectedRoute tabKey="dashboard">
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Admin */}
          <Route
            path="admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* Patients */}
          <Route
            path={ROUTES.PATIENTS}
            element={
              <ProtectedRoute tabKey="patients">
                <PatientList />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.PATIENT_DETAIL}
            element={
              <ProtectedRoute tabKey="patients">
                <PatientDetail />
              </ProtectedRoute>
            }
          />

          {/* Appointments */}
          <Route
            path={ROUTES.APPOINTMENTS}
            element={
              <ProtectedRoute tabKey="appointments">
                <AppointmentList />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.CALENDAR}
            element={
              <ProtectedRoute tabKey="calendar">
                <AppointmentCalendar />
              </ProtectedRoute>
            }
          />

          {/* Settings */}
          <Route
            path={ROUTES.SETTINGS}
            element={
              <ProtectedRoute tabKey="settings">
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Test Monitor - Nested Routes */}
          <Route
            path="test-monitor"
            element={
              <ProtectedRoute tabKey="test_monitor">
                <TestMonitorLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<TestMonitorDashboard />} />
            <Route path="cases" element={<TestCasesPage />} />
            <Route path="goal-cases" element={<GoalTestsDashboard />} />
            <Route path="create" element={<CreateGoalTestPage />} />
            <Route path="history" element={<TestRunHistory />} />
            <Route path="tuning" element={<AgentTuning />} />
            <Route path="ab-testing" element={<ABTestingDashboard />} />
            <Route path="sandbox" element={<ABTestingSandbox />} />
            <Route path="ai-prompting" element={<AIPromptingPage />} />
            <Route path="api-testing" element={<APITestingPage />} />
            <Route path="run/:runId" element={<TestRunDetail />} />
          </Route>

          {/* Catch-all redirect to home for unknown routes within layout */}
          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Route>

        {/* 404 page outside of layout */}
        <Route path="/404" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
