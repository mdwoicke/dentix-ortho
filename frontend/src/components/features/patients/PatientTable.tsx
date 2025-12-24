/**
 * PatientTable Component
 * Sortable table for displaying patients
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Table } from '../../ui';
import { formatPhoneNumber, formatDate } from '../../../utils/formatters';
import { ROUTES } from '../../../utils/constants';
import type { Patient, TableColumn } from '../../../types';

export interface PatientTableProps {
  patients: Patient[];
  isLoading?: boolean;
}

export function PatientTable({ patients, isLoading = false }: PatientTableProps) {
  const navigate = useNavigate();

  const columns: TableColumn<Patient>[] = [
    {
      key: 'patient_id',
      header: 'Patient #',
      sortable: true,
      render: (value) => value || 'N/A',
    },
    {
      key: 'first_name',
      header: 'First Name',
      sortable: true,
    },
    {
      key: 'last_name',
      header: 'Last Name',
      sortable: true,
    },
    {
      key: 'birthdate',
      header: 'Date of Birth',
      sortable: true,
      render: (value) => (value ? formatDate(value as string, 'MMM d, yyyy') : 'N/A'),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: false,
      render: (value) => value || 'N/A',
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: false,
      render: (value) => formatPhoneNumber(value as string),
    },
  ];

  const handleRowClick = (patient: Patient) => {
    // Navigate to appointments page with patient GUID to show their appointments
    navigate(`${ROUTES.APPOINTMENTS}?patientGuid=${patient.patient_guid}&patientName=${patient.first_name} ${patient.last_name}`);
  };

  return (
    <Table
      data={patients}
      columns={columns}
      onRowClick={handleRowClick}
      isLoading={isLoading}
      emptyMessage="No patients found. Try adjusting your search criteria."
    />
  );
}
