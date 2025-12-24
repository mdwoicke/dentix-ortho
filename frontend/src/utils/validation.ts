/**
 * Validation Schemas
 * Zod schemas for form validation
 */

import { z } from 'zod';

/**
 * Phone number validation regex
 * Accepts formats: (555) 123-4567, 555-123-4567, 5551234567, etc.
 */
const phoneRegex = /^[\d\s()+-]+$/;

/**
 * Email validation schema
 */
export const emailSchema = z.string().email('Invalid email address');

/**
 * Phone number validation schema
 */
export const phoneSchema = z
  .string()
  .min(10, 'Phone number must be at least 10 digits')
  .regex(phoneRegex, 'Invalid phone number format');

/**
 * Patient form validation schema
 */
export const patientFormSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters'),

  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters'),

  birthdate: z
    .string()
    .min(1, 'Birthdate is required')
    .refine(
      (date) => {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime()) && parsed < new Date();
      },
      { message: 'Invalid birthdate' }
    ),

  email: emailSchema,

  phoneNumber: phoneSchema,

  providerGuid: z
    .string()
    .min(1, 'Provider is required')
    .uuid('Invalid provider GUID format'),

  locationGuid: z
    .string()
    .min(1, 'Location is required')
    .uuid('Invalid location GUID format'),

  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      postalCode: z.string().max(10).optional(),
    })
    .optional(),

  note: z.string().max(500).optional(),
});

/**
 * Appointment form validation schema
 */
export const appointmentFormSchema = z.object({
  patientGuid: z
    .string()
    .min(1, 'Patient is required'),

  appointmentTypeGuid: z
    .string()
    .min(1, 'Appointment type is required'),

  scheduleViewGuid: z
    .string()
    .min(1, 'Schedule view is required'),

  scheduleColumnGuid: z
    .string()
    .min(1, 'Provider is required'),

  startTime: z
    .string()
    .min(1, 'Start time is required')
    .refine(
      (date) => {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime()) && parsed > new Date();
      },
      { message: 'Start time must be in the future' }
    ),

  durationMinutes: z
    .number()
    .min(15, 'Duration must be at least 15 minutes')
    .max(240, 'Duration must be less than 4 hours'),

  note: z.string().max(500).optional(),
});

/**
 * Patient search schema
 */
export const patientSearchSchema = z.object({
  query: z
    .string()
    .min(2, 'Search query must be at least 2 characters')
    .max(100, 'Search query must be less than 100 characters'),
});

/**
 * Date range schema
 */
export const dateRangeSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
}).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return start <= end;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

// Export types inferred from schemas
export type PatientFormData = z.infer<typeof patientFormSchema>;
export type AppointmentFormData = z.infer<typeof appointmentFormSchema>;
export type PatientSearchData = z.infer<typeof patientSearchSchema>;
export type DateRangeData = z.infer<typeof dateRangeSchema>;
