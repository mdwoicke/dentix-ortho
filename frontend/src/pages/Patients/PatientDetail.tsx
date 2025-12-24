/**
 * Patient Detail Page
 * View patient information with appointments
 * Note: Edit patient feature is disabled - Cloud 9 API SetPatientDemographicInfo procedure not authorized
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Button, Card, Spinner } from '../../components/ui';
import { PatientCard, AppointmentList } from '../../components/features';
import { AppointmentWizard } from '../../components/features/appointments/wizard';
import { usePatients, useAppointments } from '../../hooks';
import { ROUTES } from '../../utils/constants';

export function PatientDetail() {
  const { patientGuid } = useParams<{ patientGuid: string }>();
  const { selectedPatient, loading: patientLoading, fetchPatient } = usePatients();
  const {
    appointments,
    loading: appointmentsLoading,
    fetchPatientAppointments,
    confirmAppointment,
    cancelAppointment,
  } = useAppointments();

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  useEffect(() => {
    if (patientGuid) {
      fetchPatient(patientGuid);
      fetchPatientAppointments(patientGuid);
    }
  }, [patientGuid]);

  const handleAppointmentCreated = async () => {
    setIsScheduleModalOpen(false);
    if (patientGuid) {
      fetchPatientAppointments(patientGuid);
    }
  };

  const handleConfirmAppointment = async (appointment: any) => {
    await confirmAppointment({
      appointmentGuid: appointment.appointment_guid,
    });
  };

  const handleCancelAppointment = async (appointment: any) => {
    await cancelAppointment({
      appointmentGuid: appointment.appointment_guid,
    });
  };

  if (patientLoading && !selectedPatient) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!selectedPatient) {
    return (
      <div>
        <PageHeader title="Patient Not Found" />
        <Card>
          <p className="text-gray-600">
            The patient you're looking for could not be found.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Patient Details"
        breadcrumbs={[
          { label: 'Patients', path: ROUTES.PATIENTS },
          { label: `${selectedPatient.first_name} ${selectedPatient.last_name}` },
        ]}
        actions={
          <Button onClick={() => setIsScheduleModalOpen(true)}>
            Schedule Appointment
          </Button>
        }
      />

      {/* Patient Information */}
      <div className="mb-6">
        <PatientCard
          patient={selectedPatient}
          onSchedule={() => setIsScheduleModalOpen(true)}
        />
      </div>

      {/* Appointments */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Appointments</h2>
        <AppointmentList
          appointments={appointments}
          onConfirm={handleConfirmAppointment}
          onCancel={handleCancelAppointment}
          isLoading={appointmentsLoading}
          emptyMessage="No appointments scheduled for this patient."
        />
      </div>

      {/* Schedule Appointment Wizard */}
      <AppointmentWizard
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialPatient={selectedPatient || undefined}
        onSuccess={handleAppointmentCreated}
      />
    </div>
  );
}
