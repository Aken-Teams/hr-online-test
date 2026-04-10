'use client';

import { cn } from '@/lib/utils';

const colorStyles = {
  teal: 'bg-teal-600',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  gray: 'bg-stone-500',
} as const;

export interface ProgressProps {
  value: number;
  color?: keyof typeof colorStyles;
  className?: string;
}

export function Progress({ value, color = 'teal', className }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-stone-100', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300 ease-out',
          colorStyles[color]
        )}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
