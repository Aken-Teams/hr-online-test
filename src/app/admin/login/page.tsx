'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { ShieldCheck } from 'lucide-react';

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

/** AD 可用网域；预设徐州厂（本案考场） */
const AD_DOMAINS = [
  { code: 'PJXZ', label: '强茂徐州', hint: '本厂' },
  { code: 'PANJIT', label: 'PANJIT 台湾', hint: '' },
  { code: 'PYNMAX', label: '璟茂', hint: '' },
  { code: 'WXPJ', label: '无锡强茂', hint: '' },
  { code: 'PJWS', label: '强茂深圳', hint: '' },
  { code: 'GDPJ', label: '苏州群鑫', hint: '' },
  { code: 'PJSD', label: '山东强茂', hint: '' },
];

const DOMAIN_OPTIONS = AD_DOMAINS.map((d) => ({
  value: d.code,
  label: d.hint ? `${d.label}（${d.hint}）` : d.label,
}));

export default function AdminLoginPage() {
  const router = useRouter();
  /** ad = AD 工号登录（预设）；local = 系统管理员账号 */
  const [mode, setMode] = useState<'ad' | 'local'>('ad');
  const [domain, setDomain] = useState('PJXZ');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false); // 手机版：点登录钮才滑出表单

  function switchMode(next: 'ad' | 'local') {
    setMode(next);
    setError('');
    setPassword('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError(mode === 'ad' ? '请输入工号和密码' : '请输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(mode === 'ad' ? '/api/auth/ad-login' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'ad'
            ? { username: username.trim(), password, domain }
            : { username, password, role: 'admin' }
        ),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '登录失败，请检查账号和密码');
        return;
      }

      // 评卷人仅开放阅卷相关页面，直接导向考试列表
      router.replace(data.data?.role === 'GRADER' ? '/admin/exams' : '/admin');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen md:flex md:flex-row">
      {/* ===== Left: brand image (desktop) ===== */}
      <div className="relative hidden overflow-hidden md:block md:w-[55%]">
        <Image
          src="/login.png"
          alt="智考云 · 考核管理后台"
          fill
          priority
          sizes="55vw"
          className="object-cover"
        />
      </div>

      {/* ===== Mobile: full-screen fixed background image ===== */}
      <div className="fixed inset-0 md:hidden">
        <Image
          src="/login_mobile.png"
          alt="智考云 · 考核管理后台"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* ===== Right: Login ===== */}
      <div className="relative z-10 md:flex md:min-h-screen md:w-[45%] md:items-center md:justify-center md:px-10 md:py-10 lg:px-16">

        {/* Mobile CTA — tap to reveal the login form */}
        {!sheetOpen && (
          <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white/95 via-white/70 to-transparent px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-10 backdrop-blur-[3px] md:hidden">
            <Button className="w-full py-3.5 text-base font-semibold shadow-xl shadow-teal-900/20" onClick={() => setSheetOpen(true)}>
              {mode === 'ad' ? '员工登录' : '管理员登录'}
            </Button>
          </div>
        )}

        {/* Mobile backdrop */}
        {sheetOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/40 md:hidden"
            onClick={() => setSheetOpen(false)}
          />
        )}

        {/* Sheet (mobile slide-up) / card wrapper (desktop) */}
        <div className={`fixed inset-x-0 bottom-0 z-20 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] transition-transform duration-300 ${sheetOpen ? 'translate-y-0' : 'translate-y-full'} md:static md:z-auto md:max-h-none md:w-full md:max-w-sm md:translate-y-0 md:overflow-visible md:rounded-none md:bg-transparent md:p-0 md:shadow-none md:transition-none`}>
          {/* Mobile drag handle */}
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="收起"
            className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-stone-300 md:hidden"
          />

          {/* Mobile-only title */}
          <div className="mb-5 text-center md:hidden">
            <h1 className="text-xl font-bold text-stone-800">
              {mode === 'ad' ? '员工登录' : '管理员登录'}
            </h1>
            <p className="mt-1 text-xs text-stone-400">
              {mode === 'ad' ? '使用 AD 工号登录系统' : '使用系统管理员账号登录'}
            </p>
          </div>

          {/* Login card (bordered on desktop, flat on mobile sheet) */}
          <div className="md:rounded-2xl md:border md:border-stone-200 md:bg-white md:shadow-sm">
            {/* Card header (desktop only) */}
            <div className="hidden border-b border-stone-100 px-6 py-5 md:block">
              <h2 className="text-lg font-semibold text-stone-800">
                {mode === 'ad' ? '员工登录' : '管理员登录'}
              </h2>
              <p className="mt-1 text-xs text-stone-400">
                {mode === 'ad' ? '使用 AD 工号登录系统' : '使用系统管理员账号登录'}
              </p>
            </div>

            {/* Form */}
            <div className="md:px-6 md:py-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'ad' && (
                  <CustomSelect
                    label="组织"
                    options={DOMAIN_OPTIONS}
                    value={domain}
                    onChange={setDomain}
                    disabled={loading}
                  />
                )}

                <Input
                  label={mode === 'ad' ? '工号' : '用户名'}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === 'ad' ? '请输入 AD 工号' : '请输入用户名'}
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
                  {mode === 'ad' ? '登录' : '建立连线'}
                </Button>
              </form>

              {/* 登录方式切换 */}
              <div className="mt-5">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-2 text-xs text-stone-400">其他</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode(mode === 'ad' ? 'local' : 'ad')}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50"
                >
                  {mode === 'ad' ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-teal-600" />
                      管理员账号登录
                    </>
                  ) : (
                    <>返回 AD 登录</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <a href="https://www.zh-aoi.com/" target="_blank" rel="noopener noreferrer" className="mt-6 block text-center text-xs text-stone-400 hover:text-teal-600 transition-colors">
            Powered by 智合科技 © 2026
          </a>
        </div>
      </div>
    </div>
  );
}
