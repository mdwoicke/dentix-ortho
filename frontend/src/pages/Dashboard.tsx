/**
 * Dashboard Page
 * Main dashboard with stats and quick actions
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout';
import { Card, Button } from '../components/ui';
import { AppointmentList } from '../components/features';
import { useAppointments, useAppSelector } from '../hooks';
import { selectUpcomingAppointments } from '../store/slices/appointmentSlice';
import { ROUTES } from '../utils/constants';

export function Dashboard() {
  const navigate = useNavigate();
  const { loading, fetchAppointments, confirmAppointment, cancelAppointment } =
    useAppointments();
  const upcomingAppointments = useAppSelector(selectUpcomingAppointments);

  useEffect(() => {
    // Fetch upcoming appointments
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    fetchAppointments({
      startDate: today.toISOString().split('T')[0],
      endDate: nextWeek.toISOString().split('T')[0],
    });
  }, []);

  const handleConfirmAppointment = async (appointment: any) => {
    await confirmAppointment({
      appointmentGuid: appointment.appointment_guid,
    });
    // Refresh appointments
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    fetchAppointments({
      startDate: today.toISOString().split('T')[0],
      endDate: nextWeek.toISOString().split('T')[0],
    });
  };

  const handleCancelAppointment = async (appointment: any) => {
    await cancelAppointment({
      appointmentGuid: appointment.appointment_guid,
    });
    // Refresh appointments
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    fetchAppointments({
      startDate: today.toISOString().split('T')[0],
      endDate: nextWeek.toISOString().split('T')[0],
    });
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome to your Cloud9 Ortho practice management dashboard"
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="text-center py-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Search Patients
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Find and manage patient records
            </p>
            <Button onClick={() => navigate(ROUTES.PATIENTS)}>
              Go to Patients
            </Button>
          </div>
        </Card>

        <Card>
          <div className="text-center py-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              View Appointments
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage and schedule appointments
            </p>
            <Button onClick={() => navigate(ROUTES.APPOINTMENTS)}>
              Go to Appointments
            </Button>
          </div>
        </Card>

        <Card>
          <div className="text-center py-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Calendar View
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              See appointments in calendar format
            </p>
            <Button onClick={() => navigate(ROUTES.CALENDAR)}>
              Go to Calendar
            </Button>
          </div>
        </Card>
      </div>

      {/* Upcoming Appointments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Upcoming Appointments
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(ROUTES.APPOINTMENTS)}
          >
            View All
          </Button>
        </div>
        <AppointmentList
          appointments={upcomingAppointments.slice(0, 5)}
          onConfirm={handleConfirmAppointment}
          onCancel={handleCancelAppointment}
          showPatientName={true}
          isLoading={loading}
          emptyMessage="No upcoming appointments in the next 7 days."
        />
      </div>
    </div>
  );
}
