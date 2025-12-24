/**
 * PatientSearchResultCard Component
 * Expandable card for displaying patient search results
 */

import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { fetchPatient, selectSelectedPatient, selectPatientLoading } from '../../../store/slices/patientSlice';
import { Card } from '../../ui';
import { formatDate, formatPhoneNumber } from '../../../utils/formatters';
import type { Patient } from '../../../types';

export interface PatientSearchResultCardProps {
  patient: Patient;
  onSchedule: (patient: Patient) => void;
  onViewDetails?: (patient: Patient) => void;
}

// Inline SVG icons
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function PatientSearchResultCard({ patient, onSchedule, onViewDetails }: PatientSearchResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [detailsFetched, setDetailsFetched] = useState(false);
  const dispatch = useAppDispatch();

  const selectedPatient = useAppSelector(selectSelectedPatient);
  const isLoading = useAppSelector(selectPatientLoading);

  // Check if this patient is currently loaded in selectedPatient
  const isCurrentPatient = selectedPatient?.patient_guid === patient.patient_guid;
  const fullPatient = isCurrentPatient ? selectedPatient : patient;

  // Loading state specific to this card's expansion
  const isLoadingDetails = isLoading && isCurrentPatient && isExpanded && !detailsFetched;

  const handleExpand = () => {
    if (!isExpanded && !detailsFetched && !isCurrentPatient) {
      // Fetch details when expanding for the first time
      dispatch(fetchPatient(patient.patient_guid)).then(() => {
        setDetailsFetched(true);
      });
    }
    setIsExpanded(!isExpanded);
  };

  const handleScheduleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card expansion
    onSchedule(fullPatient);
  };

  const formatAddress = (p: Patient): string => {
    const parts = [p.address_street, p.address_city, p.address_state, p.address_postal_code].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'No address available';
  };

  return (
    <Card padding="none" className="transition-all duration-200 hover:shadow-lg dark:hover:shadow-xl cursor-pointer">
      {/* Collapsed Header - Always visible */}
      <div className="p-4" onClick={handleExpand}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {patient.first_name} {patient.last_name}
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500 dark:text-slate-400">
              <span>ID: {patient.patient_id || 'N/A'}</span>
              {patient.birthdate && (
                <span>DOB: {formatDate(patient.birthdate, 'MMM d, yyyy')}</span>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleScheduleClick}
              title="Schedule Appointment"
              className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors"
            >
              <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </button>
            <ChevronDownIcon
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-slate-700">
          {isLoadingDetails ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="pt-4 space-y-3">
              {/* Email */}
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-gray-500 dark:text-slate-400 w-20">Email:</span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {fullPatient.email || 'Not available'}
                </span>
              </div>

              {/* Phone */}
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-gray-500 dark:text-slate-400 w-20">Phone:</span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {fullPatient.phone ? formatPhoneNumber(fullPatient.phone) : 'Not available'}
                </span>
              </div>

              {/* Address */}
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-gray-500 dark:text-slate-400 w-20">Address:</span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {formatAddress(fullPatient)}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-3">
                <button
                  onClick={handleScheduleClick}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Schedule Appointment
                </button>
                {onViewDetails && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewDetails(fullPatient); }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    View Details
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
