'use client';

import { cn } from '@/lib/utils';

const sizeConfig = {
  sm: { icon: 'h-7 w-7', text: 'text-lg', sub: 'text-[10px]' },
  md: { icon: 'h-9 w-9', text: 'text-xl', sub: 'text-xs' },
  lg: { icon: 'h-12 w-12', text: 'text-2xl', sub: 'text-sm' },
} as const;

export interface LogoProps {
  size?: keyof typeof sizeConfig;
  className?: string;
}

export function Logo({ size = 'md', className }: LogoProps) {
  const config = sizeConfig[size];

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center',
          config.icon
        )}
      >
        <span className="font-bold text-white text-[0.6em] leading-none">P</span>
      </div>
      <div className="flex flex-col">
        <span
          className={cn(
            'font-bold tracking-tight text-gray-900 leading-tight',
            config.text
          )}
        >
          PANJIT
        </span>
        <span
          className={cn(
            'text-gray-500 leading-tight',
            config.sub
          )}
        >
          强茂科技
        </span>
      </div>
    </div>
  );
}
