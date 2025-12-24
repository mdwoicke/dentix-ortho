/**
 * AppointmentForm Component
 * Form for creating appointments with validation
 */

import React, { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from './FormField';
import { Button } from '../ui';
import { appointmentFormSchema } from '../../utils/validation';
import { useReference } from '../../hooks';
import type { AppointmentFormData } from '../../types';

export interface AppointmentFormProps {
  patientGuid?: string;
  onSubmit: (data: AppointmentFormData) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function AppointmentForm({
  patientGuid,
  onSubmit,
  onCancel,
  isLoading = false,
}: AppointmentFormProps) {
  const { locations, appointmentTypes, providers, loading: referenceLoading } = useReference();

  const methods = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      patientGuid: patientGuid || '',
      locationGuid: '',
      appointmentTypeGuid: '',
      providerGuid: '',
      startTime: '',
      duration: 30,
      notes: '',
    },
  });

  // Set patient GUID if provided
  useEffect(() => {
    if (patientGuid) {
      methods.setValue('patientGuid', patientGuid);
    }
  }, [patientGuid, methods]);

  const handleSubmit = async (data: AppointmentFormData) => {
    try {
      await onSubmit(data);
    } catch (error) {
      // Error handling is done in the hook
      console.error('Form submission error:', error);
    }
  };

  // Convert reference data to select options
  const locationOptions = locations.map((loc) => ({
    value: loc.location_guid,
    label: loc.location_name || 'Unknown Location',
  }));

  const appointmentTypeOptions = appointmentTypes.map((type) => ({
    value: type.appointment_type_guid,
    label: type.appointment_type_name || 'Unknown Type',
  }));

  const providerOptions = providers.map((prov) => ({
    value: prov.provider_guid,
    label: prov.provider_name || 'Unknown Provider',
  }));

  const durationOptions = [
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 45, label: '45 minutes' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1.5 hours' },
    { value: 120, label: '2 hours' },
  ];

  if (referenceLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Appointment Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Appointment Details</h3>

          {!patientGuid && (
            <FormField
              name="patientGuid"
              label="Patient GUID"
              required
              placeholder="Enter patient GUID"
              disabled={isLoading}
              helperText="You can search for patients and select from the list"
            />
          )}

          <FormField
            name="locationGuid"
            label="Location"
            type="select"
            required
            placeholder="Select location"
            options={locationOptions}
            disabled={isLoading}
          />

          <FormField
            name="appointmentTypeGuid"
            label="Appointment Type"
            type="select"
            required
            placeholder="Select appointment type"
            options={appointmentTypeOptions}
            disabled={isLoading}
          />

          <FormField
            name="providerGuid"
            label="Provider"
            type="select"
            required
            placeholder="Select provider"
            options={providerOptions}
            disabled={isLoading}
          />
        </div>

        {/* Date & Time */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Date & Time</h3>

          <FormField
            name="startTime"
            label="Date & Time"
            type="date"
            required
            disabled={isLoading}
            helperText="Select the appointment date and time"
          />

          <FormField
            name="duration"
            label="Duration"
            type="select"
            required
            options={durationOptions}
            disabled={isLoading}
          />
        </div>

        {/* Additional Notes */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Additional Notes</h3>
          <FormField
            name="notes"
            label="Notes"
            placeholder="Any special instructions or notes..."
            disabled={isLoading}
          />
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" isLoading={isLoading}>
            Schedule Appointment
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
