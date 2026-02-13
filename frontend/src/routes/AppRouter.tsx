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
import { TenantManagement } from '../pages/Admin/TenantManagement';
import { NewTenantWizard } from '../pages/Admin/NewTenantWizard';
import { Dashboard } from '../pages/Dashboard';
import { PatientList } from '../pages/Patients/PatientList';
import { PatientDetail } from '../pages/Patients/PatientDetail';
import { AppointmentList } from '../pages/Appointments/AppointmentList';
import { AppointmentCalendar } from '../pages/Appointments/AppointmentCalendar';
import { Settings } from '../pages/Settings/Settings';
import {
  DominosLayout,
  DominosDashboard,
  DominosOrders,
  DominosHealth,
  DominosMenu,
  DominosSessions,
  DominosErrors,
  DominosCallTracing,
} from '../pages/Dominos';
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
  TestsPage,
  AnalysisPage,
  SandboxLabPage,
  CallTracePage,
  SkillsRunnerPage,
  ProdTestTrackerPage,
  AlertsPage,
  QueueActivityPage,
  CacheHealthPage,
  TraceAnalysisPage,
} from '../pages/TestMonitor';
import { NotFound } from '../pages/NotFound';
import { ROUTES } from '../utils/constants';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { initializeAuth } from '../store/slices/authSlice';
import { selectEnabledTabs } from '../store/slices/tenantSlice';

/** Smart home route: shows Dashboard if enabled, otherwise redirects to first available tab */
function SmartHome() {
  const enabledTabs = useAppSelector(selectEnabledTabs);

  // If dashboard is enabled (or no tabs configured yet), show Dashboard
  if (enabledTabs.length === 0 || enabledTabs.includes('dashboard')) {
    return <Dashboard />;
  }

  // Redirect to the first enabled tab's route
  const tabRouteMap: Record<string, string> = {
    dominos_dashboard: ROUTES.DOMINOS_DASHBOARD,
    test_monitor: ROUTES.TEST_MONITOR,
    patients: ROUTES.PATIENTS,
    appointments: ROUTES.APPOINTMENTS,
    calendar: ROUTES.CALENDAR,
    settings: ROUTES.SETTINGS,
  };

  for (const tab of enabledTabs) {
    if (tabRouteMap[tab]) {
      return <Navigate to={tabRouteMap[tab]} replace />;
    }
  }

  // Fallback: show Dashboard anyway
  return <Dashboard />;
}

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
          {/* Smart Home - shows Dashboard or redirects to tenant's default tab */}
          <Route
            index
            element={
              <ProtectedRoute>
                <SmartHome />
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
          <Route
            path="admin/tenants/new"
            element={
              <ProtectedRoute requireAdmin>
                <NewTenantWizard />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/tenants/:id"
            element={
              <ProtectedRoute requireAdmin>
                <TenantManagement />
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
              <ProtectedRoute>
                {/* No tabKey - accessible from Prod Tracker and direct links */}
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
            {/* New unified pages (Sprint 2+) */}
            <Route path="tests" element={<TestsPage />} />
            <Route path="analysis" element={<AnalysisPage />} />
            <Route path="call-trace" element={<CallTracePage />} />
            <Route path="sandbox-lab" element={<SandboxLabPage />} />
            <Route path="experiments" element={<ABTestingDashboard />} />
            <Route path="skills-runner" element={<SkillsRunnerPage />} />
            <Route path="prod-tracker" element={<ProdTestTrackerPage />} />
            <Route path="queue-activity" element={<QueueActivityPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="cache-health" element={<CacheHealthPage />} />
            <Route path="trace-analysis" element={<TraceAnalysisPage />} />
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

          {/* Dominos - Nested Routes */}
          <Route
            path="dominos"
            element={
              <ProtectedRoute tabKey="dominos_dashboard">
                <DominosLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DominosDashboard />} />
            <Route path="orders" element={<DominosOrders />} />
            <Route path="health" element={<DominosHealth />} />
            <Route path="menu" element={<DominosMenu />} />
            <Route path="sessions" element={<DominosSessions />} />
            <Route path="errors" element={<DominosErrors />} />
            <Route path="call-tracing" element={<DominosCallTracing />} />
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
