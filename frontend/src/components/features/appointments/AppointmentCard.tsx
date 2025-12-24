/**
 * AppointmentCard Component
 * Modern, stylish card for appointment display with action buttons
 */

import React from 'react';
import { Button } from '../../ui';
import { formatDate, formatTime } from '../../../utils/formatters';
import type { Appointment } from '../../../types';

export interface AppointmentCardProps {
  appointment: Appointment;
  onConfirm?: (appointment: Appointment) => void;
  onCancel?: (appointment: Appointment) => void;
  showPatientName?: boolean;
  isLoading?: boolean;
}

export function AppointmentCard({
  appointment,
  onConfirm,
  onCancel,
  showPatientName = false,
  isLoading = false,
}: AppointmentCardProps) {
  // Build patient full name
  const patientFullName = [
    appointment.patient_title,
    appointment.patient_first_name,
    appointment.patient_middle_name,
    appointment.patient_last_name,
    appointment.patient_suffix,
  ]
    .filter(Boolean)
    .join(' ');

  const isConfirmed = appointment.status_description?.toLowerCase().includes('confirm');
  const isCancelled = appointment.status_description?.toLowerCase().includes('cancel');
  const isPast =
    appointment.appointment_date_time && new Date(appointment.appointment_date_time) < new Date();

  // Enhanced status styling
  const getStatusStyle = () => {
    if (isConfirmed) {
      return {
        badge: 'bg-gradient-to-r from-green-500 to-emerald-500 text-white',
        border: 'border-l-4 border-green-500',
        bg: 'bg-gradient-to-br from-green-50 to-emerald-50'
      };
    }
    if (isCancelled) {
      return {
        badge: 'bg-gradient-to-r from-red-500 to-rose-500 text-white',
        border: 'border-l-4 border-red-500',
        bg: 'bg-gradient-to-br from-red-50 to-rose-50'
      };
    }
    return {
      badge: 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white',
      border: 'border-l-4 border-blue-500',
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50'
    };
  };

  const statusStyle = getStatusStyle();

  return (
    <div className={`rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden ${statusStyle.border} bg-white`}>
      {/* Header with gradient background */}
      <div className={`${statusStyle.bg} px-6 py-4 border-b border-gray-200`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold text-gray-900">
                {appointment.appointment_type_description || 'Appointment'}
              </h3>
              {appointment.status_description && (
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${statusStyle.badge} shadow-md`}>
                  {appointment.status_description}
                </span>
              )}
            </div>
            {showPatientName && patientFullName && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white shadow-sm text-xs font-semibold text-gray-600">
                  👤
                </span>
                <span className="font-semibold">{patientFullName}</span>
                {appointment.patient_gender && (
                  <span className="text-xs bg-white px-2 py-1 rounded-full shadow-sm">
                    {appointment.patient_gender}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-4">
        {/* Date & Time Section */}
        {appointment.appointment_date_time && (
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center text-lg">
                  📅
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase">Date</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatDate(appointment.appointment_date_time, 'EEEE, MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center text-lg">
                  🕐
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase">Time</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatTime(appointment.appointment_date_time)}
                    {appointment.appointment_minutes && (
                      <span className="ml-2 text-xs text-gray-600">
                        ({appointment.appointment_minutes} min)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Location & Orthodontist Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {appointment.location_name && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                📍
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium uppercase mb-1">Location</p>
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {appointment.location_name}
                </p>
                {appointment.location_code && (
                  <p className="text-xs text-gray-600 font-mono">{appointment.location_code}</p>
                )}
              </div>
            </div>
          )}

          {appointment.orthodontist_name && (
            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                👨‍⚕️
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium uppercase mb-1">Orthodontist</p>
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {appointment.orthodontist_name}
                </p>
                {appointment.orthodontist_code && (
                  <p className="text-xs text-gray-600 font-mono">{appointment.orthodontist_code}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Confirmation Status */}
        {appointment.appointment_confirmation && (
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg mb-4">
            <div className="flex-shrink-0 w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
              ✓
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase mb-1">Confirmation</p>
              <p className="text-sm font-semibold text-green-700">
                {appointment.appointment_confirmation}
              </p>
            </div>
          </div>
        )}

        {/* Notes */}
        {appointment.appointment_note && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg mb-4">
            <div className="flex-shrink-0 w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
              📝
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 font-medium uppercase mb-1">Notes</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {appointment.appointment_note}
              </p>
            </div>
          </div>
        )}

        {/* Past Appointment Indicator */}
        {isPast && (
          <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg mb-4">
            <span className="text-lg">⏱️</span>
            <p className="text-sm text-gray-600 font-medium italic">
              This appointment has passed
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {!isCancelled && !isPast && (
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            {!isConfirmed && onConfirm && (
              <Button
                size="sm"
                onClick={() => onConfirm(appointment)}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all"
              >
                ✓ Confirm Appointment
              </Button>
            )}
            {onCancel && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => onCancel(appointment)}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-semibold shadow-md hover:shadow-lg transition-all"
              >
                ✕ Cancel Appointment
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
