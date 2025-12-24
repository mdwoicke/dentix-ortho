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
import { TestMonitor } from '../pages/TestMonitor/TestMonitor';
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

          {/* Test Monitor */}
          <Route path={ROUTES.TEST_MONITOR} element={<TestMonitor />} />

          {/* Catch-all redirect to home for unknown routes within layout */}
          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Route>

        {/* 404 page outside of layout */}
        <Route path="/404" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
