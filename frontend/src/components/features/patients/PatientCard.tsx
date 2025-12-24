/**
 * PatientCard Component
 * Display card for patient information
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from '../../ui';
import { formatPhoneNumber, formatDate } from '../../../utils/formatters';
import { ROUTES } from '../../../utils/constants';
import type { Patient } from '../../../types';

export interface PatientCardProps {
  patient: Patient;
  onSchedule?: (patient: Patient) => void;
}

export function PatientCard({ patient, onSchedule }: PatientCardProps) {
  const navigate = useNavigate();

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

          {/* Provider & Location Info */}
          {(patient.provider_guid || patient.location_guid) && (
            <div className="pt-2 border-t border-gray-200 dark:border-slate-600">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {patient.provider_guid && (
                  <div className="text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Provider:</span>
                    <span className="ml-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {patient.provider_guid.slice(0, 8)}...
                    </span>
                  </div>
                )}
                {patient.location_guid && (
                  <div className="text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Location:</span>
                    <span className="ml-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {patient.location_guid.slice(0, 8)}...
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

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
