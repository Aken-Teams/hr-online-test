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
          'rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center',
          config.icon
        )}
      >
        <span className="font-bold text-white text-[0.6em] leading-none">P</span>
      </div>
      <div className="flex flex-col">
        <span
          className={cn(
            'font-bold tracking-tight text-stone-800 leading-tight',
            config.text
          )}
        >
          PANJIT
        </span>
        <span
          className={cn(
            'leading-tight text-stone-400',
            config.sub
          )}
        >
          <span style={{ fontFamily: 'var(--font-serif)' }}>强茂科技</span>
        </span>
      </div>
    </div>
  );
}
