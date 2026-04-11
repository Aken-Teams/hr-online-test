'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { ToastProvider } from '@/components/ui/Toast';
import { LogOut, CircleUserRound, LayoutDashboard, Users, ClipboardList, Database, BarChart3 } from 'lucide-react';

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
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    key: 'employees',
    label: '员工管理',
    href: '/admin/employees',
    icon: <Users className="h-5 w-5" />,
  },
  {
    key: 'exams',
    label: '考试管理',
    href: '/admin/exams',
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    key: 'questions',
    label: '题库管理',
    href: '/admin/questions',
    icon: <Database className="h-5 w-5" />,
  },
  {
    key: 'reports',
    label: '数据报表',
    href: '/admin/reports',
    icon: <BarChart3 className="h-5 w-5" />,
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
