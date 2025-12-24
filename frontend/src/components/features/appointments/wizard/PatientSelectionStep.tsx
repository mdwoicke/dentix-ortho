/**
 * Patient Selection Step
 * Step 1 of the appointment wizard - Select a patient
 */

import React, { useState } from 'react';
import { usePatients } from '../../../../hooks/usePatients';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Spinner } from '../../../ui/Spinner';
import { cn } from '../../../../utils/cn';
import type { Patient } from '../../../../types';

export interface PatientSelectionStepProps {
  selectedPatientGuid?: string;
  onPatientSelect: (patientGuid: string, patientName: string) => void;
  onNext: () => void;
  className?: string;
  initialPatient?: Patient;
}

export function PatientSelectionStep({
  selectedPatientGuid,
  onPatientSelect,
  onNext,
  className,
  initialPatient,
}: PatientSelectionStepProps) {
  const { searchResults, loading, search, clearSearch } = usePatients();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initialPatient || null);

  // If initialPatient is provided, the patient selection is locked
  const isPatientLocked = !!initialPatient;

  // Extract patients from searchResults.data (same as PatientList)
  const patients = searchResults?.data || [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      const term = searchTerm.trim();

      // Parse search term to match PatientSearchBar format
      // If it contains a comma, treat as "LastName, FirstName"
      // If it's two words, treat as "FirstName LastName" and convert to "LastName, FirstName"
      let searchParams;

      if (term.includes(',')) {
        // Format: "LastName, FirstName"
        const [lastName, firstName] = term.split(',').map(s => s.trim());
        searchParams = { lastName, firstName };
      } else {
        // Check if it's two words
        const words = term.split(/\s+/);
        if (words.length === 2) {
          // Assume "FirstName LastName" format, convert to "LastName, FirstName"
          searchParams = { firstName: words[0], lastName: words[1] };
        } else if (words.length === 1) {
          // Single word - search as lastName (most common)
          searchParams = { lastName: term };
        } else {
          // Multiple words - use as raw query
          searchParams = { query: term };
        }
      }

      search(searchParams);
    }
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    const fullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
    onPatientSelect(patient.patient_guid, fullName);
  };

  const handleClearSelection = () => {
    setSelectedPatient(null);
    clearSearch();
  };

  const canProceed = selectedPatientGuid || selectedPatient;

  return (
    <div className={cn('space-y-10', className)}>
      {/* Header */}
      <div className="text-center pb-6">
        <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">Select Patient</h3>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Search for and select the patient for this appointment
        </p>
      </div>

      {/* Selected Patient Display */}
      {selectedPatient && (
        <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-semibold text-green-900 dark:text-green-100 uppercase tracking-wide">
                  {isPatientLocked ? 'Scheduling for' : 'Selected Patient'}
                </p>
              </div>
              <p className="text-xl font-bold text-green-800 dark:text-green-200 mt-2">
                {selectedPatient.first_name} {selectedPatient.last_name}
              </p>
              <div className="mt-3 space-y-1.5">
                {selectedPatient.patient_id && (
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                    <span className="font-medium">Patient ID:</span> {selectedPatient.patient_id}
                  </p>
                )}
                {selectedPatient.birthdate && (
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                    <span className="font-medium">DOB:</span> {new Date(selectedPatient.birthdate).toLocaleDateString()}
                  </p>
                )}
                {selectedPatient.email && (
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                    <span className="font-medium">Email:</span> {selectedPatient.email}
                  </p>
                )}
                {selectedPatient.phone && (
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                    <span className="font-medium">Phone:</span> {selectedPatient.phone}
                  </p>
                )}
              </div>
            </div>
            {!isPatientLocked && (
              <Button variant="ghost" size="sm" onClick={handleClearSelection} className="ml-4">
                Change
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Patient Search Form */}
      {!selectedPatient && (
        <>
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 text-base"
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !searchTerm.trim()} size="lg">
                {loading ? <Spinner size="sm" /> : 'Search'}
              </Button>
            </div>
          </form>

          {/* Search Results */}
          {patients.length > 0 && (
            <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-gray-100 dark:bg-gray-800 px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {patients.length} patient{patients.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto scrollbar-thin">
                {patients.map((patient) => (
                  <div
                    key={patient.patient_guid}
                    className="p-5 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-all duration-150 group"
                    onClick={() => handleSelectPatient(patient)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-base mb-2">
                          {patient.first_name} {patient.last_name}
                        </p>
                        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                          {patient.birthdate && (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(patient.birthdate).toLocaleDateString()}
                            </span>
                          )}
                          {patient.email && (
                            <span className="flex items-center gap-1.5 truncate">
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {patient.email}
                            </span>
                          )}
                          {patient.phone && (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {patient.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" className="group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-500 transition-colors">
                        Select
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && searchTerm && patients.length === 0 && (
            <div className="text-center py-12 px-4 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600">
              <svg className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mt-4">No patients found matching "{searchTerm}"</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Try a different search term or check the spelling</p>
            </div>
          )}

          {/* Initial State */}
          {!loading && !searchTerm && patients.length === 0 && (
            <div className="text-center py-16 px-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-800">
              <svg
                className="mx-auto h-20 w-20 text-blue-400 dark:text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="mt-6 text-lg font-semibold text-gray-800 dark:text-gray-200">Search for a patient</p>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">Enter a patient's name, email, or phone number to get started</p>
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-6 mt-6 border-t-2 border-gray-200 dark:border-gray-700">
        <Button onClick={onNext} disabled={!canProceed} size="lg" className="min-w-[180px]">
          <span>Next: Choose Time</span>
          <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
