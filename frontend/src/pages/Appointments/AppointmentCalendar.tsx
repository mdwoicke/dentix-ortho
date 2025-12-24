/**
 * Appointment Calendar Page
 * Calendar view of appointments with scheduling
 */

import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/layout';
import { Modal, Button } from '../../components/ui';
import { CalendarView, AppointmentCard } from '../../components/features';
import { AppointmentWizard } from '../../components/features/appointments/wizard';
import { useAppointments } from '../../hooks';
import type { Appointment } from '../../types';

export function AppointmentCalendar() {
  const {
    appointments,
    loading,
    fetchAppointments,
    createAppointment,
    confirmAppointment,
    cancelAppointment,
  } = useAppointments();

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(
    null
  );
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<{ start: Date; end: Date } | null>(
    null
  );

  // Helper to get current month date range
  const getCurrentMonthRange = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0],
    };
  };

  useEffect(() => {
    // Fetch appointments for the current month
    fetchAppointments(getCurrentMonthRange());
  }, []);

  const handleEventClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsDetailModalOpen(true);
  };

  const handleDateSelect = (start: Date, end: Date) => {
    setSelectedDate({ start, end });
    setIsScheduleModalOpen(true);
  };

  const handleAppointmentCreated = async () => {
    setIsScheduleModalOpen(false);
    setSelectedDate(null);
    // Refresh appointments
    fetchAppointments(getCurrentMonthRange());
  };

  const handleConfirmAppointment = async () => {
    if (!selectedAppointment) return;
    await confirmAppointment({
      appointmentGuid: selectedAppointment.appointment_guid,
    });
    setIsDetailModalOpen(false);
    fetchAppointments(getCurrentMonthRange());
  };

  const handleCancelAppointment = async () => {
    if (!selectedAppointment) return;
    await cancelAppointment({
      appointmentGuid: selectedAppointment.appointment_guid,
    });
    setIsDetailModalOpen(false);
    fetchAppointments(getCurrentMonthRange());
  };

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="View and manage appointments in calendar format"
        actions={
          <Button onClick={() => setIsScheduleModalOpen(true)}>
            Schedule Appointment
          </Button>
        }
      />

      {/* Calendar */}
      <CalendarView
        appointments={appointments}
        onEventClick={handleEventClick}
        onDateSelect={handleDateSelect}
      />

      {/* Appointment Detail Modal */}
      {selectedAppointment && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title="Appointment Details"
          size="md"
        >
          <AppointmentCard
            appointment={selectedAppointment}
            onConfirm={handleConfirmAppointment}
            onCancel={handleCancelAppointment}
            showPatientName={true}
            isLoading={loading}
          />
        </Modal>
      )}

      {/* Schedule Appointment Wizard */}
      <AppointmentWizard
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setSelectedDate(null);
        }}
        onSuccess={handleAppointmentCreated}
      />
    </div>
  );
}
