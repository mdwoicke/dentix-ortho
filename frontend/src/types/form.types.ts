/**
 * Form Types
 * Types for form state and form component props
 */

import type { UseFormRegister, FieldErrors, Control } from 'react-hook-form';

/**
 * Patient form data (for create/edit)
 */
export interface PatientFormData {
  firstName: string;
  lastName: string;
  birthdate: string;
  email: string;
  phoneNumber: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  providerGuid?: string;
  locationGuid?: string;
  note?: string;
}

/**
 * Appointment form data (for create)
 */
export interface AppointmentFormData {
  patientGuid: string;
  appointmentTypeGuid: string;
  scheduleViewGuid: string;
  scheduleColumnGuid: string;
  startTime: string;
  durationMinutes: number;
  note?: string;
}

/**
 * Form field props
 */
export interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'tel' | 'password' | 'date' | 'number';
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  register?: UseFormRegister<any>;
  className?: string;
}

/**
 * Form state
 */
export interface FormState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  success: boolean;
}

/**
 * Wizard step definition
 */
export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  isComplete: boolean;
  isValid: boolean;
}

/**
 * Appointment wizard data (multi-step form)
 */
export interface AppointmentWizardData {
  // Step 1: Patient Selection
  patientGuid: string;
  patientName?: string;

  // Step 2: Slot Selection (with filters)
  locationGuid: string;
  providerGuid?: string;
  appointmentTypeGuid: string;
  selectedDateTime?: string;
  scheduleViewGuid?: string;
  scheduleColumnGuid?: string;

  // Step 3: Appointment Details
  durationMinutes: number;
  notes?: string;

  // Metadata
  currentStep: number;
  totalSteps: number;
}
