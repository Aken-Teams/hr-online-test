'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const FEATURES = [
  {
    title: '员工管理',
    desc: '批量导入员工信息，管理考试权限',
    icon: (
      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    title: '试卷配置',
    desc: '灵活组卷、设置考试时间与评分规则',
    icon: (
      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    title: '数据报表',
    desc: '考试成绩统计、排名分析一目了然',
    icon: (
      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role: 'admin' }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '登录失败，请检查用户名和密码');
        return;
      }

      router.replace('/admin');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* ===== Left: Introduction ===== */}
      <div className="relative flex flex-col justify-center overflow-hidden bg-gradient-to-br from-teal-600 via-teal-700 to-teal-800 px-6 py-12 md:w-[55%] md:px-12 lg:px-20">
        {/* Decorative shapes */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute bottom-1/3 right-10 h-24 w-24 rounded-full bg-white/5" />

        <div className="relative mx-auto w-full max-w-lg">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <span className="text-lg font-bold text-white">P</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-white leading-tight">
                PANJIT
              </span>
              <span className="text-xs leading-tight text-white/60" style={{ fontFamily: 'var(--font-serif)' }}>
                强茂科技
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            HR 管理后台
          </h1>
          <p className="mt-2 text-sm text-amber-50/70 sm:text-base">
            考试管理 · 成绩统计 · 员工管理
          </p>

          {/* Divider */}
          <div className="mt-8 h-px w-12 bg-amber-100/40" />

          {/* Feature list */}
          <div className="mt-6 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50/20">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-50">{f.title}</h3>
                  <p className="text-xs text-white/60 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-12 text-xs text-amber-100/30">
            仅限授权管理员使用
          </p>
        </div>
      </div>

      {/* ===== Right: Login ===== */}
      <div className="flex flex-col items-center justify-center px-6 py-10 md:w-[45%] md:px-10 lg:px-16">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
            {/* Card header */}
            <div className="border-b border-stone-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-stone-800">管理员登录</h2>
              <p className="mt-1 text-xs text-stone-400">
                请使用管理员账号登录系统
              </p>
            </div>

            {/* Form */}
            <div className="px-6 py-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="用户名"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  disabled={loading}
                />

                <Input
                  label="密码"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  disabled={loading}
                />

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  loading={loading}
                >
                  登录
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
