'use client';

import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Info card data
// ---------------------------------------------------------------------------

const INFO_CARDS = [
  {
    title: '综合题型',
    value: '选择 + 判断 + 简答',
    description: '涵盖多种题型，全面考核专业技能',
    icon: (
      <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    title: '限时作答',
    value: '计时考核',
    description: '考试全程计时，到时自动交卷',
    icon: (
      <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: '即时出分',
    value: '客观题即时评分',
    description: '提交后客观题立即出分，主观题人工阅卷',
    icon: (
      <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
] as const;

// ---------------------------------------------------------------------------
// Welcome page
// ---------------------------------------------------------------------------

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Branding */}
      <div className="mb-10 flex flex-col items-center text-center">
        <Logo size="lg" className="mb-6" />
        <h1 className="text-2xl font-bold tracking-tight text-stone-800 sm:text-3xl">
          2026年度技能考核
        </h1>
        <p className="mt-2 text-sm text-stone-500 sm:text-base">
          强茂半导体员工在线测试平台
        </p>
      </div>

      {/* Info cards */}
      <div className="mb-10 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {INFO_CARDS.map((card) => (
          <div
            key={card.title}
            className="flex flex-col items-center rounded-xl border border-stone-200 bg-white px-6 py-6 text-center shadow-sm"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
              {card.icon}
            </div>
            <h3 className="text-sm font-semibold text-stone-800">{card.title}</h3>
            <p className="mt-1 text-lg font-bold text-teal-600">{card.value}</p>
            <p className="mt-1 text-xs text-stone-500">{card.description}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Button
        size="lg"
        className="w-full max-w-xs text-base"
        onClick={() => router.push('/verify')}
      >
        开始测试
      </Button>

      {/* Footer note */}
      <p className="mt-6 text-xs text-stone-400">
        如遇问题请联系人力资源部
      </p>
    </div>
  );
}
