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
  required?: boolean;
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
  required,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 以 fixed 浮层定位，避免被对话框等 overflow 容器裁切
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);

  const selectedOption = options.find((o) => o.value === value);

  const handleClose = useCallback(() => setOpen(false), []);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelH = 260;
    const below = window.innerHeight - r.bottom;
    const up = below < panelH && r.top > below;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width, up });
  }, []);

  // Close on click outside + 重新定位
  useEffect(() => {
    if (!open) return;
    updatePos();
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      handleClose();
    }
    function onScrollResize() {
      updatePos();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('scroll', onScrollResize, true);
    };
  }, [open, handleClose, updatePos]);

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
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
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

      {/* Dropdown：fixed 浮层，z 高于对话框 */}
      {open && pos && (
        <div
          ref={panelRef}
          className="fixed z-[60] rounded-xl border border-stone-200 bg-white py-1 shadow-xl"
          style={{
            top: pos.up ? undefined : pos.top,
            bottom: pos.up ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            minWidth: pos.width,
          }}
        >
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
                    <span className="whitespace-nowrap">{option.label}</span>
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
