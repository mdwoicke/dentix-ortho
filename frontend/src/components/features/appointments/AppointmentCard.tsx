/**
 * AppointmentCard Component
 * Modern, stylish card for appointment display with action buttons
 */

import { useState } from 'react';
import { Button, GuidCopyButton } from '../../ui';
import { formatDate, formatTime } from '../../../utils/formatters';
import type { Appointment } from '../../../types';

// Default GUIDs for CDH Allegheny (used when appointment doesn't have values)
const DEFAULT_GUIDS = {
  location: '799d413a-5e1a-46a2-b169-e2108bf517d6',       // CDH - Allegheny 300M
  scheduleView: 'b1946f40-3b0b-4e01-87a9-c5060b88443e',  // Default schedule view
  appointmentType: 'f6c20c35-9abb-47c2-981a-342996016705', // Default appointment type
  scheduleColumn: 'dda0b40c-ace5-4427-8b76-493bf9aa26f1', // Default schedule column
};

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

  // State for collapsible GUIDs section (collapsed by default)
  const [isGuidsExpanded, setIsGuidsExpanded] = useState(false);

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
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h3 className="text-xl font-bold text-gray-900">
                {appointment.appointment_type_description || 'Appointment'}
              </h3>
              {appointment.appointment_type_code && (
                <span className="px-2 py-0.5 text-xs font-mono font-medium rounded bg-gray-200 text-gray-700">
                  {appointment.appointment_type_code}
                </span>
              )}
              {appointment.status_description && (
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${statusStyle.badge} shadow-md`}>
                  {appointment.status_description}
                </span>
              )}
            </div>
            {showPatientName && patientFullName && (
              <div className="flex items-center gap-2 text-sm text-gray-700 flex-wrap">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white shadow-sm text-xs font-semibold text-gray-600">
                  👤
                </span>
                <span className="font-semibold">{patientFullName}</span>
                {appointment.patient_birth_date && (
                  <span className="text-xs bg-white px-2 py-1 rounded-full shadow-sm">
                    DOB: {formatDate(appointment.patient_birth_date, 'MMM d, yyyy')}
                  </span>
                )}
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

        {/* Location, Orthodontist & Chair Grid */}
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
                {(appointment.location_city || appointment.location_state) && (
                  <p className="text-xs text-gray-600">
                    {[appointment.location_city, appointment.location_state].filter(Boolean).join(', ')}
                  </p>
                )}
                {appointment.location_address && (
                  <p className="text-xs text-gray-600">{appointment.location_address}</p>
                )}
                {appointment.location_phone && (
                  <p className="text-xs text-blue-600 font-medium">
                    <a href={`tel:${appointment.location_phone}`} className="hover:underline">
                      {appointment.location_phone}
                    </a>
                  </p>
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

          {appointment.chair && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                🪑
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium uppercase mb-1">Chair</p>
                <p className="text-sm font-semibold text-gray-900">
                  {appointment.chair}
                </p>
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

        {/* Scheduled At */}
        {appointment.scheduled_at && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
            <div className="flex-shrink-0 w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
              📋
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase mb-1">Booked On</p>
              <p className="text-sm font-semibold text-gray-700">
                {formatDate(appointment.scheduled_at, 'MMM d, yyyy')} at {formatTime(appointment.scheduled_at)}
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

        {/* System Identifiers (GUIDs) Section - Collapsible */}
        <div className="pt-4 border-t border-gray-200 mb-4">
          <button
            type="button"
            onClick={() => setIsGuidsExpanded(!isGuidsExpanded)}
            className="w-full text-sm font-semibold text-gray-700 flex items-center gap-2 hover:text-gray-900 transition-colors"
          >
            <span className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs">🔗</span>
            System Identifiers (GUIDs)
            <svg
              className={`w-4 h-4 ml-auto transition-transform duration-200 ${isGuidsExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isGuidsExpanded && (
          <div className="space-y-2 mt-3">
            {/* Appointment GUID */}
            <div className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700">Appointment GUID:</span>
                <code className="ml-2 text-xs font-mono text-gray-600 break-all">
                  {appointment.appointment_guid}
                </code>
              </div>
              <GuidCopyButton label="Appointment GUID" guid={appointment.appointment_guid} />
            </div>

            {/* Patient GUID */}
            <div className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700">Patient GUID:</span>
                <code className="ml-2 text-xs font-mono text-gray-600 break-all">
                  {appointment.patient_guid}
                </code>
                {patientFullName && (
                  <span className="ml-2 text-xs text-gray-500">({patientFullName})</span>
                )}
              </div>
              <GuidCopyButton label="Patient GUID" guid={appointment.patient_guid} />
            </div>

            {/* Location GUID */}
            <div className="flex items-center justify-between text-sm bg-blue-50 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700">Location GUID:</span>
                <code className="ml-2 text-xs font-mono text-gray-600 break-all">
                  {appointment.location_guid || DEFAULT_GUIDS.location}
                </code>
                {appointment.location_name && (
                  <span className="ml-2 text-xs text-blue-600">({appointment.location_name})</span>
                )}
                {!appointment.location_guid && !appointment.location_name && (
                  <span className="ml-2 text-xs text-blue-600">(default)</span>
                )}
              </div>
              <GuidCopyButton
                label="Location GUID"
                guid={appointment.location_guid || DEFAULT_GUIDS.location}
              />
            </div>

            {/* Appointment Type GUID */}
            <div className="flex items-center justify-between text-sm bg-purple-50 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700">Appointment Type GUID:</span>
                <code className="ml-2 text-xs font-mono text-gray-600 break-all">
                  {appointment.appointment_type_guid || DEFAULT_GUIDS.appointmentType}
                </code>
                {appointment.appointment_type_description && (
                  <span className="ml-2 text-xs text-purple-600">({appointment.appointment_type_description})</span>
                )}
                {!appointment.appointment_type_guid && !appointment.appointment_type_description && (
                  <span className="ml-2 text-xs text-purple-600">(default)</span>
                )}
              </div>
              <GuidCopyButton
                label="Appointment Type GUID"
                guid={appointment.appointment_type_guid || DEFAULT_GUIDS.appointmentType}
              />
            </div>

            {/* Orthodontist GUID */}
            {appointment.orthodontist_guid && (
              <div className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-700">Orthodontist GUID:</span>
                  <code className="ml-2 text-xs font-mono text-gray-600 break-all">
                    {appointment.orthodontist_guid}
                  </code>
                  {appointment.orthodontist_name && (
                    <span className="ml-2 text-xs text-gray-500">({appointment.orthodontist_name})</span>
                  )}
                </div>
                <GuidCopyButton label="Orthodontist GUID" guid={appointment.orthodontist_guid} />
              </div>
            )}

            {/* Schedule View GUID (Default Reference) */}
            <div className="flex items-center justify-between text-sm bg-green-50 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700">Schedule View GUID:</span>
                <code className="ml-2 text-xs font-mono text-gray-600 break-all">
                  {DEFAULT_GUIDS.scheduleView}
                </code>
                <span className="ml-2 text-xs text-green-600">(default)</span>
              </div>
              <GuidCopyButton label="Schedule View GUID" guid={DEFAULT_GUIDS.scheduleView} />
            </div>

            {/* Schedule Column GUID (Default Reference) */}
            <div className="flex items-center justify-between text-sm bg-amber-50 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700">Schedule Column GUID:</span>
                <code className="ml-2 text-xs font-mono text-gray-600 break-all">
                  {DEFAULT_GUIDS.scheduleColumn}
                </code>
                <span className="ml-2 text-xs text-amber-600">(default)</span>
              </div>
              <GuidCopyButton label="Schedule Column GUID" guid={DEFAULT_GUIDS.scheduleColumn} />
            </div>
          </div>
          )}
        </div>

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
