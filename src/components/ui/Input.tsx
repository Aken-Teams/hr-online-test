'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full rounded-lg border px-3 py-2 text-sm',
            'transition-colors duration-150',
            'placeholder:text-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error && inputId ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={inputId ? `${inputId}-error` : undefined}
            className="mt-1.5 text-sm text-red-600"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
