/**
 * Create Goal Test Wizard
 * Main wizard container component with stepper and step content
 */

import React from 'react';
import { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  selectCurrentStep,
  selectFormData,
  selectValidation,
  selectSource,
  selectCanProceed,
  generateCaseId,
} from '../../../store/slices/createGoalTestSlice';
import { WizardStep, WIZARD_STEPS } from '../../../types/goalTestWizard.types';
import { WizardNavigation } from './WizardNavigation';
import { AIAnalyzerStep } from './steps/AIAnalyzerStep';
import { BasicInfoStep } from './steps/BasicInfoStep';
import { PersonaStep } from './steps/PersonaStep';
import { GoalsStep } from './steps/GoalsStep';
import { ConfigStep } from './steps/ConfigStep';
import { ReviewStep } from './steps/ReviewStep';
import { TemplateLibrary } from './templates/TemplateLibrary';

interface CreateGoalTestWizardProps {
  templateId?: string | null;
}

export function CreateGoalTestWizard({ templateId }: CreateGoalTestWizardProps) {
  // Note: templateId is available for future use with template loading
  const dispatch = useAppDispatch();
  const currentStep = useAppSelector(selectCurrentStep);
  const formData = useAppSelector(selectFormData);
  const validation = useAppSelector(selectValidation);
  const source = useAppSelector(selectSource);
  const canProceed = useAppSelector(selectCanProceed);
  // Note: canProceed and templateId are available for future navigation logic

  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);

  // Generate case ID when category changes
  useEffect(() => {
    if (formData.basicInfo.category) {
      dispatch(generateCaseId(formData.basicInfo.category));
    }
  }, [dispatch, formData.basicInfo.category]);

  // Render the current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case WizardStep.Analyzer:
        return <AIAnalyzerStep />;
      case WizardStep.BasicInfo:
        return <BasicInfoStep />;
      case WizardStep.Persona:
        return <PersonaStep />;
      case WizardStep.Goals:
        return <GoalsStep />;
      case WizardStep.Config:
        return <ConfigStep />;
      case WizardStep.Review:
        return <ReviewStep />;
      default:
        return <AIAnalyzerStep />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Goal Test Generator
              </h1>
              {source.type !== 'blank' && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {source.type === 'clone' && `Cloned from: ${source.name}`}
                  {source.type === 'template' && `Template: ${source.name}`}
                  {source.type === 'ai-analyzed' && `AI Generated: ${source.name}`}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowTemplateLibrary(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20
                         text-primary-700 dark:text-primary-300 rounded-lg
                         hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              Browse Templates
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between">
            {WIZARD_STEPS.map((step, index) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              const stepValidation = validation[step.id as WizardStep];
              const hasError = stepValidation?.touched && !stepValidation?.isValid;

              return (
                <React.Fragment key={step.id}>
                  {/* Step indicator */}
                  <div className="flex items-center">
                    <div
                      className={`
                        flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors
                        ${isActive
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : isCompleted
                            ? hasError
                              ? 'border-red-500 bg-red-500 text-white'
                              : 'border-green-500 bg-green-500 text-white'
                            : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                        }
                      `}
                    >
                      {isCompleted ? (
                        hasError ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )
                      ) : (
                        <span className="text-sm font-semibold">{index + 1}</span>
                      )}
                    </div>
                    <div className="ml-3 hidden sm:block">
                      <p
                        className={`text-sm font-medium ${
                          isActive
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Connector line */}
                  {index < WIZARD_STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-4 ${
                        currentStep > step.id
                          ? 'bg-green-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {renderStepContent()}
        </div>
      </div>

      {/* Navigation */}
      <WizardNavigation />

      {/* Template Library Modal */}
      <TemplateLibrary
        isOpen={showTemplateLibrary}
        onClose={() => setShowTemplateLibrary(false)}
      />
    </div>
  );
}
