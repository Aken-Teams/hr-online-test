'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { ToastProvider } from '@/components/ui/Toast';
import { LogOut, CircleUserRound } from 'lucide-react';

// ---------------------------------------------------------------------------
// Sidebar navigation items
// ---------------------------------------------------------------------------

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: '仪表盘',
    href: '/admin',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    key: 'exams',
    label: '考试管理',
    href: '/admin/exams',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    key: 'questions',
    label: '题库管理',
    href: '/admin/questions',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    key: 'employees',
    label: '员工管理',
    href: '/admin/employees',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    key: 'reports',
    label: '数据报表',
    href: '/admin/reports',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Helper: read cookie
// ---------------------------------------------------------------------------

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const isLoginPage = pathname === '/admin/login';

  // Auth guard (skip for login page)
  useEffect(() => {
    if (isLoginPage) {
      setReady(true);
      return;
    }
    const token = getCookie('admin_token');
    if (!token) {
      router.replace('/admin/login');
    } else {
      setReady(true);
    }
  }, [router, isLoginPage]);

  const handleLogout = useCallback(() => {
    deleteCookie('admin_token');
    router.replace('/admin/login');
  }, [router]);

  // Determine which nav item is active
  const getIsActive = (item: NavItem) => {
    if (item.href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(item.href);
  };

  // Login page: render without sidebar
  if (isLoginPage) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="animate-pulse text-stone-400 text-sm">载入中...</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-stone-50">
        {/* Sidebar */}
        <aside className="flex w-60 flex-col border-r border-stone-200 bg-white">
          {/* Sidebar header */}
          <div className="flex h-16 shrink-0 items-center border-b border-stone-100 px-5">
            <Logo size="sm" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = getIsActive(item);
                return (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      onClick={(e) => {
                        e.preventDefault();
                        router.push(item.href);
                      }}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-teal-50 text-teal-700'
                          : 'text-stone-600 hover:bg-stone-50 hover:text-stone-800'
                      }`}
                    >
                      <span className={active ? 'text-teal-600' : 'text-stone-400'}>
                        {item.icon}
                      </span>
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sidebar footer */}
          <div className="border-t border-stone-100 px-3 py-3">
            <div className="text-xs text-stone-400 text-center">HR 考试管理系统 v1.0</div>
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-6">
            <h2 className="text-lg font-semibold text-stone-800">HR管理后台</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CircleUserRound className="h-7 w-7 text-stone-400" />
                <span className="text-sm font-medium text-stone-600">管理员</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                退出登录
              </Button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
