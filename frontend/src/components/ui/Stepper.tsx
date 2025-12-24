/**
 * Stepper Component
 * Visual progress indicator for multi-step wizards
 */

import React from 'react';
import type { WizardStep } from '../../types';
import { cn } from '../../utils/cn';

export interface StepperProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  allowStepNavigation?: boolean;
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  onStepClick,
  allowStepNavigation = false,
  className,
}: StepperProps) {
  const handleStepClick = (index: number) => {
    if (!allowStepNavigation || !onStepClick) return;

    // Only allow clicking on completed steps or the current step
    if (steps[index].isComplete || index === currentStep) {
      onStepClick(index);
    }
  };

  return (
    <div className={cn('w-full py-2', className)}>
      {/* Desktop: Horizontal stepper */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = step.isComplete;
          const isClickable = allowStepNavigation && (isCompleted || isActive);

          return (
            <React.Fragment key={step.id}>
              {/* Step Circle */}
              <div className="flex flex-col items-center flex-1">
                <button
                  type="button"
                  onClick={() => handleStepClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm transition-all duration-200 shadow-md',
                    {
                      // Completed state
                      'bg-green-500 dark:bg-green-600 text-white': isCompleted && !isActive,
                      'hover:bg-green-600 dark:hover:bg-green-700 hover:shadow-lg hover:scale-105': isCompleted && !isActive && isClickable,

                      // Active state
                      'bg-blue-600 dark:bg-blue-500 text-white ring-2 ring-blue-300 dark:ring-blue-800 shadow-lg scale-110': isActive,

                      // Incomplete state
                      'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400': !isCompleted && !isActive,

                      // Cursor
                      'cursor-pointer': isClickable,
                      'cursor-not-allowed opacity-50': !isClickable,
                    }
                  )}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.title}${isCompleted ? ' (completed)' : ''}${isActive ? ' (current)' : ''}`}
                >
                  {isCompleted && !isActive ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <span className="text-sm">{index + 1}</span>
                  )}
                </button>

                {/* Step Label */}
                <div className="mt-2 text-center max-w-[140px]">
                  <p
                    className={cn('text-xs font-bold leading-tight uppercase tracking-wide', {
                      'text-blue-700 dark:text-blue-300': isActive,
                      'text-green-700 dark:text-green-300': isCompleted && !isActive,
                      'text-gray-600 dark:text-gray-400': !isCompleted && !isActive,
                    })}
                  >
                    {step.title}
                  </p>
                  {step.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">{step.description}</p>
                  )}
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 px-2 pb-6">
                  <div
                    className={cn('h-1 rounded-full transition-all duration-300 shadow-sm', {
                      'bg-green-500 dark:bg-green-600': steps[index].isComplete,
                      'bg-gray-300 dark:bg-gray-700': !steps[index].isComplete,
                    })}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile: Vertical stepper */}
      <div className="flex md:hidden flex-col space-y-3">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = step.isComplete;
          const isClickable = allowStepNavigation && (isCompleted || isActive);

          return (
            <div key={step.id} className="flex items-start">
              {/* Step Circle and Line Container */}
              <div className="flex flex-col items-center mr-3">
                <button
                  type="button"
                  onClick={() => handleStepClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    'flex items-center justify-center w-5 h-5 rounded-full font-semibold text-xs transition-all duration-200 shadow-sm',
                    {
                      'bg-green-500 dark:bg-green-600 text-white': isCompleted && !isActive,
                      'bg-blue-600 dark:bg-blue-500 text-white ring-2 ring-blue-200 dark:ring-blue-900 shadow-md': isActive,
                      'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400': !isCompleted && !isActive,
                      'cursor-pointer': isClickable,
                      'cursor-not-allowed opacity-60': !isClickable,
                    }
                  )}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.title}`}
                >
                  {isCompleted && !isActive ? (
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>

                {/* Vertical connector line */}
                {index < steps.length - 1 && (
                  <div
                    className={cn('w-0.5 h-8 mt-1 rounded-full transition-all duration-300', {
                      'bg-green-500 dark:bg-green-600': steps[index].isComplete,
                      'bg-gray-200 dark:bg-gray-700': !steps[index].isComplete,
                    })}
                  />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 pb-6">
                <p
                  className={cn('text-sm font-semibold leading-tight', {
                    'text-blue-600 dark:text-blue-400': isActive,
                    'text-green-600 dark:text-green-400': isCompleted && !isActive,
                    'text-gray-500 dark:text-gray-400': !isCompleted && !isActive,
                  })}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
