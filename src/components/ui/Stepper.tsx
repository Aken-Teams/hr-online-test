'use client';

import { Check } from 'lucide-react';

export interface StepDef {
  key: string;
  label: string;
}

interface StepperProps {
  steps: StepDef[];
  currentStep: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export default function Stepper({ steps, currentStep, onStepClick, className = '' }: StepperProps) {
  return (
    <nav className={`flex items-center ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isCurrent = idx === currentStep;
        const isFuture = idx > currentStep;
        const isClickable = onStepClick && isCompleted;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(idx)}
              className={`flex items-center gap-2 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 transition-colors
                  ${isCompleted ? 'bg-teal-600 text-white' : ''}
                  ${isCurrent ? 'bg-teal-600 text-white ring-2 ring-teal-300' : ''}
                  ${isFuture ? 'bg-gray-200 text-gray-500' : ''}
                `}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`
                  text-sm whitespace-nowrap hidden sm:inline
                  ${isCurrent ? 'text-teal-700 font-medium' : ''}
                  ${isCompleted ? 'text-teal-600' : ''}
                  ${isFuture ? 'text-gray-400' : ''}
                `}
              >
                {step.label}
              </span>
            </button>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={`
                  flex-1 h-0.5 mx-3
                  ${idx < currentStep ? 'bg-teal-400' : 'bg-gray-200'}
                `}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
