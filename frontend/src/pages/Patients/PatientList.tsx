/**
 * Patient List Page
 * Search and view all patients with full CRUD functionality
 */

import { useState } from 'react';
import { PageHeader } from '../../components/layout';
import { Button, Modal } from '../../components/ui';
import { PatientSearchBar, PatientSearchResultGrid } from '../../components/features';
import { AppointmentWizard } from '../../components/features/appointments/wizard/AppointmentWizard';
import { CopyToPostmanButton } from '../../components/features/postman/CopyToPostmanButton';
import { PatientForm } from '../../components/forms';
import { usePatients } from '../../hooks';
import { useAppSelector } from '../../store/hooks';
import { selectLastSearchParams, selectHasSearchResults } from '../../store/slices/patientSlice';
import type { PatientFormData, PatientSearchParams, Patient } from '../../types';

export function PatientList() {
  const { searchResults, loading, search, createPatient } = usePatients();
  const lastSearchParams = useAppSelector(selectLastSearchParams);
  const hasSearchResults = useAppSelector(selectHasSearchResults);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedPatientForSchedule, setSelectedPatientForSchedule] = useState<Patient | null>(null);

  const handleSearch = (params: PatientSearchParams) => {
    search(params);
  };

  const handleCreatePatient = async (data: PatientFormData) => {
    await createPatient({
      firstName: data.firstName,
      lastName: data.lastName,
      birthdate: data.birthdate,
      email: data.email,
      phoneNumber: data.phoneNumber,
      providerGuid: data.providerGuid || '',
      locationGuid: data.locationGuid || '',
      note: data.note,
      address: data.address,
    });
    setIsCreateModalOpen(false);
  };

  const handleSchedule = (patient: Patient) => {
    setSelectedPatientForSchedule(patient);
    setWizardOpen(true);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setSelectedPatientForSchedule(null);
  };

  // Construct query string for cURL (same logic as patientApi)
  const getCurlQueryString = (): string => {
    if (!lastSearchParams) return '';

    const queryParts: string[] = [];

    if (lastSearchParams.lastName && lastSearchParams.firstName) {
      queryParts.push(`${lastSearchParams.lastName}, ${lastSearchParams.firstName}`);
    } else if (lastSearchParams.lastName) {
      queryParts.push(lastSearchParams.lastName);
    } else if (lastSearchParams.firstName) {
      queryParts.push(lastSearchParams.firstName);
    }

    if (lastSearchParams.email) queryParts.push(lastSearchParams.email);
    if (lastSearchParams.phoneNumber) queryParts.push(lastSearchParams.phoneNumber);
    if (lastSearchParams.birthdate) queryParts.push(lastSearchParams.birthdate);

    return queryParts.join(' ').trim();
  };

  const curlQueryString = getCurlQueryString();
  const patients = searchResults?.data || [];

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle="Search and manage patient records"
        actions={
          <div className="flex gap-2">
            {curlQueryString && (
              <CopyToPostmanButton
                procedure="GetPortalPatientLookup"
                parameters={{
                  filter: curlQueryString,
                  lookupByPatient: '1',
                  pageIndex: lastSearchParams?.pageIndex?.toString() || '1',
                  pageSize: '25',
                }}
                variant="icon"
                size="md"
              />
            )}
            <Button onClick={() => setIsCreateModalOpen(true)}>
              Add New Patient
            </Button>
          </div>
        }
      />

      {/* Search Bar */}
      <div className="mb-6">
        <PatientSearchBar onSearch={handleSearch} isLoading={loading} initialValues={lastSearchParams || undefined} />
      </div>

      {/* Results */}
      {hasSearchResults && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-xl border border-gray-200 dark:border-slate-700 transition-colors">
          {searchResults && (
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 transition-colors">
              <p className="text-sm font-medium text-gray-600 dark:text-slate-300">
                Found {searchResults.pagination?.totalCount || patients.length} patient
                {patients.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
          <div className="p-4">
            <PatientSearchResultGrid
              patients={patients}
              isLoading={loading}
              onSchedule={handleSchedule}
            />
          </div>
        </div>
      )}

      {!hasSearchResults && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-xl border border-gray-200 dark:border-slate-700 p-12 text-center transition-colors">
          <p className="text-gray-500 dark:text-slate-400">
            Enter search criteria above to find patients
          </p>
        </div>
      )}

      {/* Create Patient Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Patient"
        size="lg"
      >
        <PatientForm
          onSubmit={handleCreatePatient}
          onCancel={() => setIsCreateModalOpen(false)}
          isLoading={loading}
        />
      </Modal>

      {/* Appointment Wizard Modal */}
      <AppointmentWizard
        isOpen={wizardOpen}
        onClose={handleWizardClose}
        initialPatient={selectedPatientForSchedule || undefined}
      />
    </div>
  );
}
