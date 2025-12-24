/**
 * PatientSearchResultGrid Component
 * Display patient search results in a responsive grid layout
 */

import React from 'react';
import { PatientCard } from './PatientCard';
import type { Patient } from '../../../types';

export interface PatientSearchResultGridProps {
  patients: Patient[];
  isLoading?: boolean;
  onSchedule: (patient: Patient) => void;
}

export function PatientSearchResultGrid({
  patients,
  isLoading,
  onSchedule
}: PatientSearchResultGridProps) {

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-slate-400">
        No patients found. Try adjusting your search criteria.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {patients.map((patient) => (
        <PatientCard
          key={patient.patient_guid}
          patient={patient}
          onSchedule={onSchedule}
        />
      ))}
    </div>
  );
}
