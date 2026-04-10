'use client';

import { cn } from '@/lib/utils';

export interface Tab {
  key: string;
  label: string;
}

export interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeKey, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex border-b border-gray-200',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-0',
              isActive
                ? 'text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-600" />
            )}
          </button>
        );
      })}
    </div>
  );
}
