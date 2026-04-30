'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  title?: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, actions, className, children }: CardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm',
        className
      )}
    >
      {(title || description || actions) && (
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 sm:px-6 sm:py-4">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-stone-800">{title}</h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-stone-500">{description}</p>
            )}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div className="px-4 py-3 sm:px-6 sm:py-4">{children}</div>
    </div>
  );
}
