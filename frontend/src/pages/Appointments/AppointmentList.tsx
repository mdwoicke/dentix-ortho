/**
 * Appointment List Page
 * View and manage appointments with filtering
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Button, Select, DatePicker } from '../../components/ui';
import { AppointmentList as AppointmentListComponent } from '../../components/features';
import { CopyToPostmanButton } from '../../components/features/postman/CopyToPostmanButton';
import { AppointmentWizard } from '../../components/features/appointments/wizard';
import { useAppointments, useReference } from '../../hooks';
import type { GetAppointmentsParams } from '../../types';

export function AppointmentList() {
  const {
    appointments,
    loading,
    fetchAppointments,
    fetchPatientAppointments,
    createAppointment,
    confirmAppointment,
    cancelAppointment,
  } = useAppointments();
  const { locations, providers } = useReference();
  const [searchParams] = useSearchParams();

  // Get patient GUID from URL query parameters
  const urlPatientGuid = searchParams.get('patientGuid');
  const urlPatientName = searchParams.get('patientName');

  // Local state for patient filter (overrides URL params when set)
  const [localPatientGuid, setLocalPatientGuid] = useState<string | null>(null);
  const [localPatientName, setLocalPatientName] = useState<string | null>(null);

  // Use local patient filter if set, otherwise fall back to URL params
  const patientGuid = localPatientGuid || urlPatientGuid;
  const patientName = localPatientName || urlPatientName;

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [filters, setFilters] = useState<GetAppointmentsParams>(() => {
    // Default to current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0],
    };
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    // If patient GUID is provided, fetch appointments for that patient
    if (patientGuid) {
      fetchPatientAppointments(patientGuid, filters);
    } else {
      fetchAppointments(filters);
    }
  }, [filters, patientGuid]);

  const handleAppointmentCreated = async (appointment: any) => {
    setIsScheduleModalOpen(false);

    // Extract patient info from the created appointment
    const createdPatientGuid = appointment.patient_guid || appointment.patientGuid;
    const createdPatientName =
      appointment.patient_first_name && appointment.patient_last_name
        ? `${appointment.patient_first_name} ${appointment.patient_last_name}`
        : appointment.patientName || 'Unknown Patient';

    // Update local patient filter to show all appointments for this patient
    setLocalPatientGuid(createdPatientGuid);
    setLocalPatientName(createdPatientName);

    // Fetch appointments for this patient
    if (createdPatientGuid) {
      fetchPatientAppointments(createdPatientGuid, filters);
    }
  };

  const handleConfirmAppointment = async (appointment: any) => {
    await confirmAppointment({
      appointmentGuid: appointment.appointment_guid,
    });
    fetchAppointments(filters);
  };

  const handleCancelAppointment = async (appointment: any) => {
    await cancelAppointment({
      appointmentGuid: appointment.appointment_guid,
    });
    fetchAppointments(filters);
  };

  const handleClearFilters = () => {
    // Reset to current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setFilters({
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0],
    });
    // Clear local patient filter
    setLocalPatientGuid(null);
    setLocalPatientName(null);
  };

  const hasFilters =
    filters.startDate ||
    filters.endDate ||
    filters.locationGuid ||
    filters.providerGuid ||
    localPatientGuid;

  const locationOptions = locations.map((loc) => ({
    value: loc.location_guid,
    label: loc.location_name || 'Unknown Location',
  }));

  const providerOptions = providers.map((prov) => ({
    value: prov.provider_guid,
    label: prov.provider_name || 'Unknown Provider',
  }));

  // Determine Postman procedure and parameters based on context
  const postmanProcedure = patientGuid
    ? 'GetAppointmentListByPatient'
    : 'GetOnlineReservations';

  const postmanParameters = patientGuid
    ? { patGUID: patientGuid }
    : {
        startDate: `${filters.startDate} 8:00:00 AM`,
        endDate: `${filters.endDate} 5:00:00 PM`,
        morning: 'True',
        afternoon: 'True',
        ...(filters.locationGuid && { locationGUID: filters.locationGuid }),
        ...(filters.providerGuid && { schdvwGUIDs: filters.providerGuid }),
      };

  return (
    <div>
      <PageHeader
        title={patientName ? `Appointments for ${patientName}` : "Appointments"}
        subtitle={patientName ? "View appointments for this patient" : "View and manage appointments"}
        actions={
          <div className="flex gap-2">
            <CopyToPostmanButton
              procedure={postmanProcedure}
              parameters={postmanParameters}
              variant="icon"
              size="md"
            />
            <Button onClick={() => setIsScheduleModalOpen(true)}>
              Schedule Appointment
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
          <div className="flex gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="space-y-4">
            {/* Patient Filter Indicator */}
            {localPatientGuid && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-blue-900">
                    Showing appointments for: <strong>{localPatientName}</strong>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setLocalPatientGuid(null);
                    setLocalPatientName(null);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View All Patients
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <DatePicker
                label="Start Date"
                value={filters.startDate || ''}
                onChange={(value) => setFilters({ ...filters, startDate: value })}
              />
              <DatePicker
                label="End Date"
                value={filters.endDate || ''}
                onChange={(value) => setFilters({ ...filters, endDate: value })}
              />
              <Select
                label="Location"
                value={filters.locationGuid || ''}
                onChange={(value) =>
                  setFilters({ ...filters, locationGuid: value as string })
                }
                options={locationOptions}
                placeholder="All Locations"
              />
              <Select
                label="Provider"
                value={filters.providerGuid || ''}
                onChange={(value) =>
                  setFilters({ ...filters, providerGuid: value as string })
                }
                options={providerOptions}
                placeholder="All Providers"
              />
            </div>
          </div>
        )}
      </div>

      {/* Appointments List */}
      <AppointmentListComponent
        appointments={appointments}
        onConfirm={handleConfirmAppointment}
        onCancel={handleCancelAppointment}
        showPatientName={true}
        isLoading={loading}
        emptyMessage="No appointments found. Try adjusting your filters or schedule a new appointment."
      />

      {/* Schedule Appointment Wizard */}
      <AppointmentWizard
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialPatientGuid={patientGuid || undefined}
        onSuccess={handleAppointmentCreated}
      />
    </div>
  );
}
