'use client';

import { cn } from '@/lib/utils';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({ width, height, className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-stone-200',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}
