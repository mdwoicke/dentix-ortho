/**
 * PatientForm Component
 * Form for creating and editing patients with validation
 */

import React, { useMemo } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from './FormField';
import { Button } from '../ui';
import { patientFormSchema } from '../../utils/validation';
import { useReference } from '../../hooks';
import type { PatientFormData, Patient } from '../../types';

export interface PatientFormProps {
  initialData?: Patient | null;
  onSubmit: (data: PatientFormData) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function PatientForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: PatientFormProps) {
  const { locations, providers } = useReference();

  const methods = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: initialData
      ? {
          firstName: initialData.first_name || '',
          lastName: initialData.last_name || '',
          birthdate: initialData.birthdate || '',
          email: initialData.email || '',
          phoneNumber: initialData.phone_number || '',
          address: {
            street: initialData.address_street || '',
            city: initialData.address_city || '',
            state: initialData.address_state || '',
            postalCode: initialData.address_postal_code || '',
          },
        }
      : {
          firstName: '',
          lastName: '',
          birthdate: '',
          email: '',
          phoneNumber: '',
          providerGuid: '',
          locationGuid: '',
          address: {
            street: '',
            city: '',
            state: '',
            postalCode: '',
          },
        },
  });

  // Memoize options to prevent unnecessary re-renders
  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: loc.guid,
        label: loc.name || 'Unknown Location',
      })),
    [locations]
  );

  const providerOptions = useMemo(
    () =>
      providers.map((prov) => ({
        value: prov.guid,
        label: `${prov.scheduleViewDescription || 'Unknown'} - ${
          prov.scheduleColumnDescription || 'Unknown Provider'
        }`,
      })),
    [providers]
  );

  const handleSubmit = async (data: PatientFormData) => {
    try {
      await onSubmit(data);
    } catch (error) {
      // Error handling is done in the hook
      console.error('Form submission error:', error);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Personal Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Personal Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              name="firstName"
              label="First Name"
              required
              placeholder="John"
              disabled={isLoading}
            />
            <FormField
              name="lastName"
              label="Last Name"
              required
              placeholder="Doe"
              disabled={isLoading}
            />
          </div>

          <FormField
            name="birthdate"
            label="Date of Birth"
            type="date"
            required
            disabled={isLoading}
          />
        </div>

        {/* Provider and Location */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Provider & Location</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              name="providerGuid"
              label="Provider"
              type="select"
              required
              placeholder="Select a provider"
              options={providerOptions}
              disabled={isLoading}
              helperText="Select the primary provider for this patient"
            />
            <FormField
              name="locationGuid"
              label="Location"
              type="select"
              required
              placeholder="Select a location"
              options={locationOptions}
              disabled={isLoading}
              helperText="Select the primary location for this patient"
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Contact Information</h3>
          <FormField
            name="email"
            label="Email"
            type="email"
            placeholder="john.doe@example.com"
            disabled={isLoading}
          />
          <FormField
            name="phoneNumber"
            label="Phone Number"
            type="tel"
            placeholder="(555) 123-4567"
            disabled={isLoading}
          />
        </div>

        {/* Address */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Address</h3>
          <FormField
            name="address.street"
            label="Street Address"
            placeholder="123 Main St"
            disabled={isLoading}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              name="address.city"
              label="City"
              placeholder="Springfield"
              disabled={isLoading}
            />
            <FormField
              name="address.state"
              label="State"
              placeholder="IL"
              maxLength={2}
              disabled={isLoading}
            />
            <FormField
              name="address.postalCode"
              label="ZIP Code"
              placeholder="62701"
              maxLength={10}
              disabled={isLoading}
            />
          </div>
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
            {initialData ? 'Update Patient' : 'Create Patient'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
