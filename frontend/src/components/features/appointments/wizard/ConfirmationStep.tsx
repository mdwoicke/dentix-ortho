/**
 * Confirmation Step
 * Step 4 of the appointment wizard - Final review and confirmation
 */

import React from 'react';
import { useReference } from '../../../../hooks/useReference';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Spinner } from '../../../ui/Spinner';
import { cn } from '../../../../utils/cn';
import type { AppointmentWizardData } from '../../../../types';
import { CopyToPostmanButton } from '../../postman/CopyToPostmanButton';

export interface ConfirmationStepProps {
  wizardData: AppointmentWizardData;
  onConfirm: () => void;
  onBack: () => void;
  onEditStep: (stepIndex: number) => void;
  isSubmitting: boolean;
  className?: string;
}

export function ConfirmationStep({
  wizardData,
  onConfirm,
  onBack,
  onEditStep,
  isSubmitting,
  className,
}: ConfirmationStepProps) {
  const { locations, appointmentTypes, providers } = useReference();

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

  const endDateTime = selectedDateTime
    ? new Date(selectedDateTime.getTime() + wizardData.durationMinutes * 60000)
    : null;

  return (
    <div className={cn('space-y-10', className)}>
      {/* Header */}
      <div className="text-center pb-6">
        <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">Review & Confirm</h3>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Please review all appointment details before confirming
        </p>
      </div>

      {/* Summary Cards */}
      <div className="space-y-6">
        {/* Patient Card */}
        <Card className="border-2 border-blue-200 dark:border-blue-800 shadow-lg">
          <Card.Header className="bg-blue-50 dark:bg-blue-900/30 py-4 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Patient</h4>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEditStep(0)}
                disabled={isSubmitting}
                className="text-base"
              >
                Edit
              </Button>
            </div>
          </Card.Header>
          <Card.Body className="py-6 px-6">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{wizardData.patientName}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">ID: {wizardData.patientGuid.substring(0, 8)}...</p>
          </Card.Body>
        </Card>

        {/* Date & Time Card */}
        {selectedDateTime && (
          <Card className="border-2 border-green-200 dark:border-green-800 shadow-lg">
            <Card.Header className="bg-green-50 dark:bg-green-900/30 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Date & Time</h4>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEditStep(1)}
                  disabled={isSubmitting}
                  className="text-base"
                >
                  Edit
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="py-6 px-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {selectedDateTime.toLocaleString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {selectedDateTime.toLocaleString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}{' '}
                      -{' '}
                      {endDateTime?.toLocaleString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </p>
                    <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
                      Duration: {wizardData.durationMinutes} minutes
                    </p>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        )}

        {/* Location & Provider Card */}
        <Card className="border-2 border-purple-200 dark:border-purple-800 shadow-lg">
          <Card.Header className="bg-purple-50 dark:bg-purple-900/30 py-4 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-7 h-7 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Location & Provider</h4>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEditStep(1)}
                disabled={isSubmitting}
                className="text-base"
              >
                Edit
              </Button>
            </div>
          </Card.Header>
          <Card.Body className="py-6 px-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Location</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedLocation?.name || 'Not selected'}</p>
                  {selectedLocation?.code && (
                    <p className="text-base text-gray-600 dark:text-gray-400 mt-1">Code: {selectedLocation.code}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Provider</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {selectedProvider?.scheduleColumnDescription || 'Any Available Provider'}
                  </p>
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>

        {/* Appointment Type Card */}
        <Card className="border-2 border-orange-200 dark:border-orange-800 shadow-lg">
          <Card.Header className="bg-orange-50 dark:bg-orange-900/30 py-4 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-7 h-7 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Appointment Type</h4>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEditStep(2)}
                disabled={isSubmitting}
                className="text-base"
              >
                Edit
              </Button>
            </div>
          </Card.Header>
          <Card.Body className="py-6 px-6">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {selectedAppointmentType?.description || 'Not selected'}
            </p>
            {selectedAppointmentType?.code && (
              <p className="text-base text-gray-600 dark:text-gray-400">
                Code: {selectedAppointmentType.code}
              </p>
            )}
          </Card.Body>
        </Card>

        {/* Notes Card */}
        {wizardData.notes && (
          <Card className="border-2 border-gray-200 dark:border-gray-700 shadow-lg">
            <Card.Header className="bg-gray-50 dark:bg-gray-800 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-7 h-7 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notes</h4>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEditStep(2)}
                  disabled={isSubmitting}
                  className="text-base"
                >
                  Edit
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="py-6 px-6">
              <p className="text-lg text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{wizardData.notes}</p>
            </Card.Body>
          </Card>
        )}
      </div>

      {/* Warning/Info Message */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-300 dark:border-blue-700 rounded-xl p-6 shadow-md">
        <div className="flex items-start gap-4">
          <svg
            className="w-8 h-8 text-blue-600 dark:text-blue-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="text-base font-semibold text-blue-900 dark:text-blue-200 mb-2">Important Information</p>
            <p className="text-base text-blue-800 dark:text-blue-300 leading-relaxed">
              By confirming this appointment, you acknowledge that all information is correct. The
              patient will be notified of their upcoming appointment.
            </p>
          </div>
        </div>
      </div>

      {/* API Request - Copy as cURL */}
      <Card className="border-2 border-indigo-200 dark:border-indigo-800 shadow-lg">
        <Card.Header className="bg-indigo-50 dark:bg-indigo-900/30 py-4 px-6">
          <div className="flex items-center gap-3">
            <svg className="w-7 h-7 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">API Request</h4>
          </div>
        </Card.Header>
        <Card.Body className="py-6 px-6">
          <div className="space-y-4">
            <p className="text-base text-gray-700 dark:text-gray-300">
              Copy this appointment request as a cURL command for testing in Postman or terminal.
            </p>
            <div className="flex items-center gap-3">
              <CopyToPostmanButton
                procedure="SetAppointment"
                parameters={{
                  PatientGUID: wizardData.patientGuid,
                  StartTime: wizardData.selectedDateTime,
                  ScheduleViewGUID: wizardData.scheduleViewGuid,
                  ScheduleColumnGUID: wizardData.scheduleColumnGuid,
                  AppointmentTypeGUID: wizardData.appointmentTypeGuid,
                  Minutes: wizardData.durationMinutes,
                }}
                variant="button"
                size="lg"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Copies the exact API request with all current values
              </span>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-8 mt-8 border-t-2 border-gray-200 dark:border-gray-700">
        <Button variant="secondary" onClick={onBack} disabled={isSubmitting} size="lg" className="min-w-[140px]">
          <svg className="mr-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          <span>Back</span>
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting} size="lg" className="min-w-[220px] text-lg font-bold">
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-3" />
              Creating Appointment...
            </>
          ) : (
            <>
              <span>Confirm Appointment</span>
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
