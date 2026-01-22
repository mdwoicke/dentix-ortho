/**
 * AppointmentList Component
 * List display for appointments with filtering
 */

import { AppointmentCard } from './AppointmentCard';
import { Spinner } from '../../ui';
import type { Appointment } from '../../../types';

export interface AppointmentListProps {
  appointments: Appointment[];
  onConfirm?: (appointment: Appointment) => void;
  onCancel?: (appointment: Appointment) => void;
  showPatientName?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  patientComment?: string; // Optional patient comment (may contain child info)
}

export function AppointmentList({
  appointments,
  onConfirm,
  onCancel,
  showPatientName = false,
  isLoading = false,
  emptyMessage = 'No appointments found.',
  patientComment,
}: AppointmentListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {appointments.map((appointment) => (
        <AppointmentCard
          key={appointment.appointment_guid}
          appointment={appointment}
          onConfirm={onConfirm}
          onCancel={onCancel}
          showPatientName={showPatientName}
          patientComment={patientComment}
        />
      ))}
    </div>
  );
}
