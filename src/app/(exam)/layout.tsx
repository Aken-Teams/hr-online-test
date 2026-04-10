'use client';

import { type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';

export default function ExamLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-gradient-to-br from-amber-50/40 via-white to-teal-50/30">
        {children}
      </div>
    </ToastProvider>
  );
}
