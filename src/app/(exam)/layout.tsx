'use client';

import { type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';

export default function ExamLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50">
        {children}
      </div>
    </ToastProvider>
  );
}
