'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
}

function Select({
  label,
  error,
  options,
  placeholder,
  value,
  onChange,
  disabled,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  function handleSelect(val: string) {
    onChange?.({ target: { value: val } });
    setOpen(false);
  }

  return (
    <div className={cn('w-full', className)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm text-left',
            'transition-colors duration-150 bg-white',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            open
              ? 'border-teal-500 ring-2 ring-teal-500 ring-offset-0'
              : error
                ? 'border-red-300 text-red-900'
                : 'border-stone-300 text-stone-800 hover:border-stone-400',
            'disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500',
          )}
        >
          <span className={cn(!selected && 'text-stone-400')}>
            {selected ? selected.label : placeholder || '请选择'}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-stone-400 transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        </button>

        {open && (
          <ul
            className={cn(
              'absolute z-50 mt-1 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg',
              'max-h-60 scrollbar-thin',
            )}
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm text-stone-400">暂无选项</li>
            )}
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors',
                    isSelected
                      ? 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-stone-700 hover:bg-stone-50',
                  )}
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isSelected ? 'text-teal-600' : 'text-transparent',
                    )}
                  />
                  {option.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

Select.displayName = 'Select';

export { Select };
