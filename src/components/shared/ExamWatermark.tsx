'use client';

import { useState, useEffect } from 'react';

/**
 * Full-screen watermark overlay for exam pages.
 *
 * Renders the employee's name and employee number in a repeating diagonal
 * pattern across the entire viewport. The overlay is purely visual and does
 * not intercept any pointer events.
 *
 * If the employee cannot be identified, the watermark is not rendered.
 */
export function ExamWatermark() {
  const [label, setLabel] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('exam-employee');
      if (!raw) return;
      const emp = JSON.parse(raw);
      const parts: string[] = [];
      if (emp.name) parts.push(emp.name);
      if (emp.employeeNo) parts.push(emp.employeeNo);
      if (parts.length > 0) setLabel(parts.join(' '));
    } catch {
      // ignore
    }
  }, []);

  if (!label) return null;

  // Generate a grid of watermark text — enough to fill any screen size
  const rows = 12;
  const cols = 6;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none"
    >
      <div
        className="absolute inset-[-50%] flex flex-col items-center justify-center gap-16"
        style={{ transform: 'rotate(-24deg)' }}
      >
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex shrink-0 gap-12 whitespace-nowrap">
            {Array.from({ length: cols }, (_, c) => (
              <span
                key={c}
                className="text-sm font-medium text-stone-900/[0.06] sm:text-base"
              >
                {label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
