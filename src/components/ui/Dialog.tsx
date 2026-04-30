'use client';

import { useEffect, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Dialog({ open, onClose, title, children, footer, className, contentClassName }: DialogProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          'w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-xl',
          className
        )}
      >
        <div className="border-b border-stone-100 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-base sm:text-lg font-semibold text-stone-800">{title}</h2>
        </div>
        <div className={cn('max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-6 sm:py-4', contentClassName)}>
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 sm:gap-3 border-t border-stone-100 px-4 py-3 sm:px-6 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
