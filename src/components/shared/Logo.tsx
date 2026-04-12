'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

const sizeConfig = {
  sm: { icon: 'h-7 w-7', img: 28, text: 'text-lg', sub: 'text-[10px]' },
  md: { icon: 'h-9 w-9', img: 36, text: 'text-xl', sub: 'text-xs' },
  lg: { icon: 'h-12 w-12', img: 48, text: 'text-2xl', sub: 'text-sm' },
} as const;

export interface LogoProps {
  size?: keyof typeof sizeConfig;
  className?: string;
}

export function Logo({ size = 'md', className }: LogoProps) {
  const config = sizeConfig[size];

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Image
        src="/logo.png"
        alt="智考云"
        width={config.img}
        height={config.img}
        className={cn('shrink-0', config.icon)}
        priority
      />
      <div className="flex flex-col">
        <span
          className={cn(
            'font-bold tracking-tight text-stone-800 leading-tight',
            config.text
          )}
        >
          智考云
        </span>
        <span
          className={cn(
            'leading-tight text-stone-400',
            config.sub
          )}
        >
          企业考核平台
        </span>
      </div>
    </div>
  );
}
