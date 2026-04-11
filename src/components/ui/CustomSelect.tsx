'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
}

export interface CustomSelectProps {
  label?: string;
  error?: string;
  options: CustomSelectOption[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function CustomSelect({
  label,
  error,
  options,
  placeholder = '请选择',
  value,
  onChange,
  className,
  disabled,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const handleClose = useCallback(() => setOpen(false), []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, handleClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleClose]);

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm text-left',
          'bg-white transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          'disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500',
          open
            ? 'border-teal-500 ring-2 ring-teal-500 ring-offset-0'
            : error
              ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500'
              : 'border-stone-300 text-stone-800 focus:border-teal-500 focus:ring-teal-500',
        )}
      >
        <span className={cn(!selectedOption && 'text-stone-400')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-stone-400 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          <ul className="max-h-60 overflow-auto">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                      isSelected
                        ? 'bg-teal-50 font-medium text-teal-700'
                        : 'text-stone-700 hover:bg-stone-50',
                    )}
                    onClick={() => {
                      onChange(option.value);
                      handleClose();
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isSelected ? 'text-teal-600' : 'invisible',
                      )}
                    />
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
