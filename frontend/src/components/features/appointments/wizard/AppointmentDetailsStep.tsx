/**
 * Appointment Details Step
 * Step 3 of the appointment wizard - Enter appointment details and notes
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { useReference } from '../../../../hooks/useReference';
import { Button } from '../../../ui/Button';
import { cn } from '../../../../utils/cn';
import type { AppointmentWizardData } from '../../../../types';

export interface AppointmentDetailsStepProps {
  wizardData: AppointmentWizardData;
  onUpdate: (data: Partial<AppointmentWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  className?: string;
}

interface DetailsFormData {
  durationMinutes: number;
  notes: string;
}

export function AppointmentDetailsStep({
  wizardData,
  onUpdate,
  onNext,
  onBack,
  className,
}: AppointmentDetailsStepProps) {
  const { locations, appointmentTypes, providers } = useReference();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DetailsFormData>({
    defaultValues: {
      durationMinutes: wizardData.durationMinutes || 30,
      notes: wizardData.notes || '',
    },
  });

  const onSubmit = (data: DetailsFormData) => {
    onUpdate(data);
    onNext();
  };

  // Get display names from GUIDs
  const selectedLocation = locations.find((l) => l.guid === wizardData.locationGuid);
  const selectedAppointmentType = appointmentTypes.find(
    (t) => t.guid === wizardData.appointmentTypeGuid
  );
  const selectedProvider = providers.find(
    (p) => p.scheduleColumnGuid === wizardData.providerGuid
  );

  const selectedDateTime = wizardData.selectedDateTime
    ? new Date(wizardData.selectedDateTime)
    : null;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Appointment Details</h3>
        <p className="text-sm text-gray-600 mt-1">
          Review your selections and add any additional details
        </p>
      </div>

      {/* Read-Only Summary */}
      <div className="space-y-4">
        {/* Patient */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Patient</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{wizardData.patientName}</p>
        </div>

        {/* Date & Time */}
        {selectedDateTime && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Date & Time
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {selectedDateTime.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <p className="text-md font-medium text-gray-700">
              {selectedDateTime.toLocaleString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Location */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</p>
            <p className="text-md font-semibold text-gray-900 mt-1">
              {selectedLocation?.name || 'Not selected'}
            </p>
            {selectedLocation?.code && (
              <p className="text-sm text-gray-600">Code: {selectedLocation.code}</p>
            )}
          </div>

          {/* Provider */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Provider</p>
            <p className="text-md font-semibold text-gray-900 mt-1">
              {selectedProvider?.scheduleColumnDescription || 'Any Available'}
            </p>
          </div>
        </div>

        {/* Appointment Type */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Appointment Type
          </p>
          <p className="text-md font-semibold text-gray-900 mt-1">
            {selectedAppointmentType?.description || 'Not selected'}
          </p>
          {selectedAppointmentType?.durationMinutes && (
            <p className="text-sm text-gray-600">
              Default Duration: {selectedAppointmentType.durationMinutes} minutes
            </p>
          )}
        </div>
      </div>

      {/* Editable Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Additional Details</h4>

          {/* Duration */}
          <div>
            <label htmlFor="durationMinutes" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Duration *
            </label>
            <select
              id="durationMinutes"
              {...register('durationMinutes', {
                required: 'Duration is required',
                valueAsNumber: true,
              })}
              className={cn(
                'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                errors.durationMinutes && 'border-red-500 dark:border-red-400'
              )}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
            {errors.durationMinutes && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.durationMinutes.message}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              {...register('notes', { maxLength: 500 })}
              rows={4}
              placeholder="Add any special instructions or notes for this appointment..."
              className={cn(
                'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500'
              )}
            />
            {errors.notes && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.notes.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Maximum 500 characters</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t border-gray-200">
          <Button type="button" variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button type="submit">Next: Review & Confirm</Button>
        </div>
      </form>
    </div>
  );
}
