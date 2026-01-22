/**
 * Patient Detail Page
 * View patient information with appointments
 * Note: Edit patient feature is disabled - Cloud 9 API SetPatientDemographicInfo procedure not authorized
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Button, Card, Spinner } from '../../components/ui';
import { PatientCard, AppointmentList } from '../../components/features';
import { AppointmentWizard } from '../../components/features/appointments/wizard';
import { CancellationProgressModal } from '../../components/features/testMonitor';
import { usePatients, useAppointments } from '../../hooks';
import { ROUTES } from '../../utils/constants';
import { setCurrentEnvironment, getCurrentEnvironment } from '../../services/api/client';
import {
  getLocalAppointmentsByPatientGuid,
  importTracesByPatientGuid,
  type StreamingCancellationSummary,
} from '../../services/api/testMonitorApi';
import type { Environment } from '../../types';

export function PatientDetail() {
  const { patientGuid } = useParams<{ patientGuid: string }>();
  const [searchParams] = useSearchParams();
  const { selectedPatient, loading: patientLoading, fetchPatient } = usePatients();
  const {
    appointments: cloudAppointments,
    loading: cloudAppointmentsLoading,
    fetchPatientAppointments,
    confirmAppointment,
    cancelAppointment,
  } = useAppointments();

  // Local database appointments (fast load)
  const [localAppointments, setLocalAppointments] = useState<any[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [appointmentSource, setAppointmentSource] = useState<'local' | 'cloud9'>('local');
  const [importingFromCloud9, setImportingFromCloud9] = useState(false);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const originalEnvironmentRef = useRef<Environment | null>(null);

  // Cancellation modal state
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [cancellationAppointment, setCancellationAppointment] = useState<any | null>(null);

  // Use cloud appointments if available, otherwise local
  const appointments = appointmentSource === 'cloud9' && cloudAppointments.length > 0
    ? cloudAppointments
    : localAppointments;
  const appointmentsLoading = appointmentSource === 'cloud9' ? cloudAppointmentsLoading : localLoading;

  // Fetch from local database (fast)
  const fetchLocalAppointments = useCallback(async (guid: string) => {
    setLocalLoading(true);
    try {
      const result = await getLocalAppointmentsByPatientGuid(guid);
      setLocalAppointments(result.appointments);
      setAppointmentSource('local');
    } catch (error) {
      console.error('Failed to fetch local appointments:', error);
      setLocalAppointments([]);
    } finally {
      setLocalLoading(false);
    }
  }, []);

  // Import from Cloud9 API (imports traces + enriches local records with Cloud9 data)
  // This updates the local database with full appointment details (location, provider, type, notes)
  const handleImportFromCloud9 = async () => {
    if (!patientGuid) return;
    setImportingFromCloud9(true);
    try {
      // Import Langfuse traces AND enrich from Cloud9 (combined in one call)
      // This updates local records with notes from traces + full details from Cloud9
      console.log('Importing and enriching data for patient:', patientGuid);
      const traceResult = await importTracesByPatientGuid(patientGuid);
      console.log('Import result:', traceResult);

      // Refresh local appointments (now has full data from enrichment)
      await fetchLocalAppointments(patientGuid);
      // Keep showing local data - it's now enriched with Cloud9 details
      setAppointmentSource('local');
    } catch (error) {
      console.error('Failed to import from Cloud9:', error);
    } finally {
      setImportingFromCloud9(false);
    }
  };

  // Handle environment override from URL query param (e.g., from Prod Tracker)
  useEffect(() => {
    const envParam = searchParams.get('environment');
    if (envParam === 'production' || envParam === 'sandbox') {
      const current = getCurrentEnvironment();
      if (current !== envParam) {
        // Store original environment to restore on cleanup
        originalEnvironmentRef.current = current;
        setCurrentEnvironment(envParam as Environment);
      }
    }
    // Cleanup: restore original environment when leaving
    return () => {
      if (originalEnvironmentRef.current) {
        setCurrentEnvironment(originalEnvironmentRef.current);
        originalEnvironmentRef.current = null;
      }
    };
  }, [searchParams]);

  useEffect(() => {
    if (patientGuid) {
      fetchPatient(patientGuid);
      // Load from local database first (fast) - user can click Import button for fresh Cloud9 data
      fetchLocalAppointments(patientGuid);
    }
  }, [patientGuid, searchParams, fetchLocalAppointments]);

  const handleAppointmentCreated = async () => {
    setIsScheduleModalOpen(false);
    if (patientGuid) {
      // After creating, import from Cloud9 to get fresh data
      await handleImportFromCloud9();
    }
  };

  const handleConfirmAppointment = async (appointment: any) => {
    await confirmAppointment({
      appointmentGuid: appointment.appointment_guid,
    });
    // Refresh appointments from Cloud9 to show updated status
    if (patientGuid) {
      await handleImportFromCloud9();
    }
  };

  const handleCancelAppointment = (appointment: any) => {
    // For local appointments, use the modal with prod_test_record ID
    // For cloud appointments, check if we have a _raw.id
    if (appointment._raw?.id) {
      setCancellationAppointment(appointment);
      setShowCancellationModal(true);
    } else {
      // Fallback: direct cancel via Cloud9 API (for cloud-sourced appointments)
      cancelAppointment({ appointmentGuid: appointment.appointment_guid })
        .then(() => {
          if (patientGuid) {
            handleImportFromCloud9();
          }
        });
    }
  };

  // Handle cancellation modal completion
  const handleCancellationComplete = async (summary: StreamingCancellationSummary) => {
    // Refresh appointments to show updated status
    if (patientGuid) {
      await handleImportFromCloud9();
    }
  };

  // Handle cancellation modal close
  const handleCancellationModalClose = () => {
    setShowCancellationModal(false);
    setCancellationAppointment(null);
    // Refresh data in case operation completed in background
    if (patientGuid) {
      fetchLocalAppointments(patientGuid);
    }
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Appointments</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImportFromCloud9}
            disabled={importingFromCloud9}
          >
            {importingFromCloud9 ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Importing...
              </>
            ) : (
              'Import from Cloud9'
            )}
          </Button>
        </div>
        <AppointmentList
          appointments={appointments}
          onConfirm={handleConfirmAppointment}
          onCancel={handleCancelAppointment}
          showPatientName={true}
          isLoading={appointmentsLoading}
          emptyMessage="No appointments scheduled for this patient."
          patientComment={(selectedPatient as any)?.comment}
        />
      </div>

      {/* Schedule Appointment Wizard */}
      <AppointmentWizard
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialPatient={selectedPatient || undefined}
        onSuccess={handleAppointmentCreated}
      />

      {/* Cancellation Progress Modal */}
      {cancellationAppointment && (
        <CancellationProgressModal
          isOpen={showCancellationModal}
          onClose={handleCancellationModalClose}
          records={[{
            id: cancellationAppointment._raw?.id,
            appointmentGuid: cancellationAppointment.appointment_guid,
            patientFirstName: cancellationAppointment.patient_first_name,
            patientLastName: cancellationAppointment.patient_last_name,
            appointmentDatetime: cancellationAppointment.appointment_date_time,
          }]}
          onComplete={handleCancellationComplete}
        />
      )}
    </div>
  );
}
