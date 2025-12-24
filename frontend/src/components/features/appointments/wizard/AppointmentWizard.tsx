/**
 * Appointment Wizard
 * Main wizard container for multi-step appointment booking
 */

import React, { useState } from 'react';
import { useAppDispatch } from '../../../../store/hooks';
import { createAppointment } from '../../../../store/slices/appointmentSlice';
import { Modal } from '../../../ui/Modal';
import { Stepper } from '../../../ui/Stepper';
import { PatientSelectionStep } from './PatientSelectionStep';
import { SlotSelectionStep } from './SlotSelectionStep';
import { AppointmentDetailsStep } from './AppointmentDetailsStep';
import { ConfirmationStep } from './ConfirmationStep';
import { useToast } from '../../../../hooks/useToast';
import type { WizardStep, AppointmentWizardData } from '../../../../types';
import type { AvailableSlot, Appointment, Patient } from '../../../../types';
import { format } from 'date-fns';

export interface AppointmentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  initialPatient?: Patient;
  initialPatientGuid?: string;
  onSuccess?: (appointment: Appointment) => void;
}

const TOTAL_STEPS = 4;

export function AppointmentWizard({
  isOpen,
  onClose,
  initialPatient,
  initialPatientGuid,
  onSuccess,
}: AppointmentWizardProps) {
  const dispatch = useAppDispatch();
  const toast = useToast();

  // Derive initial patient guid from either initialPatient or initialPatientGuid
  const effectivePatientGuid = initialPatient?.patient_guid || initialPatientGuid || '';
  const effectivePatientName = initialPatient
    ? `${initialPatient.first_name || ''} ${initialPatient.last_name || ''}`.trim()
    : '';

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wizardData, setWizardData] = useState<AppointmentWizardData>({
    patientGuid: effectivePatientGuid,
    patientName: effectivePatientName,
    locationGuid: '',
    providerGuid: '',
    appointmentTypeGuid: '',
    selectedDateTime: '',
    scheduleViewGuid: '',
    scheduleColumnGuid: '',
    durationMinutes: 30,
    notes: '',
    currentStep: 0,
    totalSteps: TOTAL_STEPS,
  });

  const [steps, setSteps] = useState<WizardStep[]>([
    {
      id: 'patient',
      title: 'Patient',
      description: '',
      isComplete: !!effectivePatientGuid,
      isValid: !!effectivePatientGuid,
    },
    {
      id: 'slot',
      title: 'Time Slot',
      description: '',
      isComplete: false,
      isValid: false,
    },
    {
      id: 'details',
      title: 'Details',
      description: '',
      isComplete: false,
      isValid: false,
    },
    {
      id: 'confirm',
      title: 'Confirm',
      description: '',
      isComplete: false,
      isValid: false,
    },
  ]);

  const updateWizardData = (data: Partial<AppointmentWizardData>) => {
    setWizardData((prev) => ({
      ...prev,
      ...data,
    }));
  };

  const markStepComplete = (stepIndex: number, isValid: boolean = true) => {
    setSteps((prev) =>
      prev.map((step, index) => {
        if (index === stepIndex) {
          return { ...step, isComplete: true, isValid };
        }
        return step;
      })
    );
  };

  const handleNext = () => {
    // Mark current step as complete
    markStepComplete(currentStep);

    // Move to next step
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((prev) => prev + 1);
      setWizardData((prev) => ({ ...prev, currentStep: currentStep + 1 }));
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setWizardData((prev) => ({ ...prev, currentStep: currentStep - 1 }));
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Only allow navigation to completed steps
    if (steps[stepIndex].isComplete) {
      setCurrentStep(stepIndex);
      setWizardData((prev) => ({ ...prev, currentStep: stepIndex }));
    }
  };

  const handlePatientSelect = (patientGuid: string, patientName: string) => {
    updateWizardData({ patientGuid, patientName });
  };

  const handleSlotSelect = (slot: AvailableSlot) => {
    updateWizardData({
      selectedDateTime: slot.dateTime,
      scheduleViewGuid: slot.scheduleViewGuid,
      scheduleColumnGuid: slot.scheduleColumnGuid,
      durationMinutes: slot.durationMinutes,
    });
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (
        !wizardData.patientGuid ||
        !wizardData.selectedDateTime ||
        !wizardData.scheduleViewGuid ||
        !wizardData.scheduleColumnGuid ||
        !wizardData.appointmentTypeGuid
      ) {
        toast.showError('Missing required appointment information. Please review all steps.');
        setIsSubmitting(false);
        return;
      }

      // Format the date/time for the API
      const appointmentDateTime = new Date(wizardData.selectedDateTime);
      const formattedDateTime = format(appointmentDateTime, 'MM/dd/yyyy hh:mm:ss a');

      // Create appointment
      const result = await dispatch(
        createAppointment({
          patientGuid: wizardData.patientGuid,
          startTime: formattedDateTime,
          scheduleViewGuid: wizardData.scheduleViewGuid,
          scheduleColumnGuid: wizardData.scheduleColumnGuid,
          appointmentTypeGuid: wizardData.appointmentTypeGuid,
          durationMinutes: wizardData.durationMinutes,
        })
      ).unwrap();

      // Success!
      toast.showSuccess('Appointment created successfully!');

      if (onSuccess) {
        onSuccess(result);
      }

      // Close the wizard
      handleClose();
    } catch (error) {
      toast.showError(
        error instanceof Error ? error.message : 'Failed to create appointment'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Check if there's unsaved data
    const hasData =
      wizardData.patientGuid ||
      wizardData.selectedDateTime ||
      wizardData.locationGuid ||
      wizardData.appointmentTypeGuid;

    if (hasData && currentStep > 0 && !isSubmitting) {
      const confirmClose = window.confirm(
        'Are you sure you want to close? Your progress will be lost.'
      );
      if (!confirmClose) return;
    }

    // Reset wizard state
    setCurrentStep(0);
    setWizardData({
      patientGuid: effectivePatientGuid,
      patientName: effectivePatientName,
      locationGuid: '',
      providerGuid: '',
      appointmentTypeGuid: '',
      selectedDateTime: '',
      scheduleViewGuid: '',
      scheduleColumnGuid: '',
      durationMinutes: 30,
      notes: '',
      currentStep: 0,
      totalSteps: TOTAL_STEPS,
    });
    setSteps([
      {
        id: 'patient',
        title: 'Patient',
        description: '',
        isComplete: !!effectivePatientGuid,
        isValid: !!effectivePatientGuid,
      },
      {
        id: 'slot',
        title: 'Time Slot',
        description: '',
        isComplete: false,
        isValid: false,
      },
      {
        id: 'details',
        title: 'Details',
        description: '',
        isComplete: false,
        isValid: false,
      },
      {
        id: 'confirm',
        title: 'Confirm',
        description: '',
        isComplete: false,
        isValid: false,
      },
    ]);

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" title="Schedule New Appointment">
      <div className="space-y-4">
        {/* Stepper */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 -mx-8 -mt-8 px-8 pt-4 pb-3 border-b border-blue-200 dark:border-blue-800">
          <Stepper
            steps={steps}
            currentStep={currentStep}
            onStepClick={handleStepClick}
            allowStepNavigation={true}
          />
        </div>

        {/* Step Content */}
        <div className="min-h-[500px]">
          {currentStep === 0 && (
            <PatientSelectionStep
              selectedPatientGuid={wizardData.patientGuid}
              onPatientSelect={handlePatientSelect}
              onNext={handleNext}
              initialPatient={initialPatient}
            />
          )}

          {currentStep === 1 && (
            <SlotSelectionStep
              wizardData={wizardData}
              onSlotSelect={handleSlotSelect}
              onFilterChange={updateWizardData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 2 && (
            <AppointmentDetailsStep
              wizardData={wizardData}
              onUpdate={updateWizardData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 3 && (
            <ConfirmationStep
              wizardData={wizardData}
              onConfirm={handleConfirm}
              onBack={handleBack}
              onEditStep={handleStepClick}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
