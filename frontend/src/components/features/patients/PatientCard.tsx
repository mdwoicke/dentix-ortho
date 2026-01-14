/**
 * PatientCard Component
 * Display card for patient information with all GUIDs
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, GuidCopyButton } from '../../ui';
import { formatPhoneNumber, formatDate } from '../../../utils/formatters';
import { ROUTES } from '../../../utils/constants';
import type { Patient } from '../../../types';

export interface PatientCardProps {
  patient: Patient;
  onSchedule?: (patient: Patient) => void;
}

export function PatientCard({ patient, onSchedule }: PatientCardProps) {
  const navigate = useNavigate();
  const [isGuidsExpanded, setIsGuidsExpanded] = useState(false);

  const handleViewDetails = () => {
    navigate(ROUTES.PATIENT_DETAIL.replace(':patientGuid', patient.patient_guid));
  };

  // Build full address string
  const fullAddress = [
    patient.address_street,
    patient.address_city,
    patient.address_state,
    patient.address_postal_code,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-4">
          {/* Header: Name & ID */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {patient.first_name} {patient.last_name}
            </h3>
            {patient.patient_id && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Patient ID: {patient.patient_id}</p>
            )}
          </div>

          {/* Personal Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {patient.birthdate && (
              <div className="text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Date of Birth:</span>
                <span className="ml-2 text-gray-900 dark:text-white">
                  {formatDate(patient.birthdate, 'MMM d, yyyy')}
                </span>
              </div>
            )}
            {patient.created_at && (
              <div className="text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Created:</span>
                <span className="ml-2 text-gray-900 dark:text-white">
                  {formatDate(patient.created_at, 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            )}
            {patient.email && (
              <div className="text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Email:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{patient.email}</span>
              </div>
            )}
            {patient.phone && (
              <div className="text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Phone:</span>
                <span className="ml-2 text-gray-900 dark:text-white">
                  {formatPhoneNumber(patient.phone)}
                </span>
              </div>
            )}
            {fullAddress && (
              <div className="text-sm md:col-span-2">
                <span className="font-medium text-gray-700 dark:text-gray-300">Address:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{fullAddress}</span>
              </div>
            )}
          </div>

          {/* GUIDs Section - Collapsible */}
          <div className="pt-3 border-t border-gray-200 dark:border-slate-600">
            <button
              type="button"
              onClick={() => setIsGuidsExpanded(!isGuidsExpanded)}
              className="w-full text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
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
            <div className="space-y-2 mt-2">
              {/* Patient GUID */}
              <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-slate-700/50 rounded px-3 py-2">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Patient GUID:</span>
                  <code className="ml-2 text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                    {patient.patient_guid}
                  </code>
                  <span className="ml-2 text-xs text-gray-500">({patient.first_name} {patient.last_name})</span>
                </div>
                <GuidCopyButton label="Patient GUID" guid={patient.patient_guid} />
              </div>

              {/* Patient ID */}
              {patient.patient_id && (
                <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-slate-700/50 rounded px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Patient ID:</span>
                    <code className="ml-2 text-xs font-mono text-gray-600 dark:text-gray-400">
                      {patient.patient_id}
                    </code>
                  </div>
                  <GuidCopyButton label="Patient ID" guid={patient.patient_id} />
                </div>
              )}

              {/* Provider/Orthodontist GUID */}
              {patient.provider_guid && (
                <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-slate-700/50 rounded px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Provider GUID:</span>
                    <code className="ml-2 text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                      {patient.provider_guid}
                    </code>
                    {patient.provider_name && (
                      <span className="ml-2 text-xs text-gray-500">({patient.provider_name})</span>
                    )}
                  </div>
                  <GuidCopyButton label="Provider GUID" guid={patient.provider_guid} />
                </div>
              )}

              {/* Location GUID */}
              {patient.location_guid && (
                <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-slate-700/50 rounded px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Location GUID:</span>
                    <code className="ml-2 text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                      {patient.location_guid}
                    </code>
                    {patient.location_name && (
                      <span className="ml-2 text-xs text-blue-600">({patient.location_name})</span>
                    )}
                  </div>
                  <GuidCopyButton label="Location GUID" guid={patient.location_guid} />
                </div>
              )}
            </div>
            )}
          </div>

          {/* Environment Badge */}
          {patient.environment && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  patient.environment === 'production'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                }`}
              >
                {patient.environment}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={handleViewDetails}>
            View Details
          </Button>
          {onSchedule && (
            <Button size="sm" variant="secondary" onClick={() => onSchedule(patient)}>
              Schedule
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
