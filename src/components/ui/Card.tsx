'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, className, children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-stone-200 bg-white shadow-sm',
        className
      )}
    >
      {(title || description) && (
        <div className="border-b border-stone-100 px-6 py-4">
          {title && (
            <h3 className="text-base font-semibold text-stone-800">{title}</h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-stone-500">{description}</p>
          )}
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}
