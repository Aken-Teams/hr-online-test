'use client';

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** 返回路径；设定后会在标题左上方显示「返回」按钮 */
  backHref?: string;
  /** 返回按钮文字，预设「返回列表」 */
  backLabel?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
  backHref,
  backLabel = '返回列表',
}: PageHeaderProps) {
  const router = useRouter();
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        {backHref && (
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="mb-1.5 inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-stone-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        )}
        <h1 className="text-xl font-bold tracking-tight text-stone-800 sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-stone-500 sm:mt-1.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">{actions}</div>
      )}
    </div>
  );
}
