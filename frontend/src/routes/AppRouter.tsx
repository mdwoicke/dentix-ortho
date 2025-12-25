/**
 * AppRouter Component
 * Main application routing configuration
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../components/layout';
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
  GoalTestCasesPage,
} from '../pages/TestMonitor';
import { NotFound } from '../pages/NotFound';
import { ROUTES } from '../utils/constants';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main layout with nested routes */}
        <Route path="/" element={<MainLayout />}>
          {/* Dashboard */}
          <Route index element={<Dashboard />} />

          {/* Patients */}
          <Route path={ROUTES.PATIENTS} element={<PatientList />} />
          <Route path={ROUTES.PATIENT_DETAIL} element={<PatientDetail />} />

          {/* Appointments */}
          <Route path={ROUTES.APPOINTMENTS} element={<AppointmentList />} />
          <Route path={ROUTES.CALENDAR} element={<AppointmentCalendar />} />

          {/* Settings */}
          <Route path={ROUTES.SETTINGS} element={<Settings />} />

          {/* Test Monitor - Nested Routes */}
          <Route path="test-monitor" element={<TestMonitorLayout />}>
            <Route index element={<TestMonitorDashboard />} />
            <Route path="cases" element={<TestCasesPage />} />
            <Route path="goal-cases" element={<GoalTestCasesPage />} />
            <Route path="history" element={<TestRunHistory />} />
            <Route path="tuning" element={<AgentTuning />} />
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
