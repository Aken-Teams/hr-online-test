'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { ToastProvider } from '@/components/ui/Toast';
import { LogOut, CircleUserRound, LayoutDashboard, Users, ClipboardList, Database, BarChart3, Menu, X } from 'lucide-react';

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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

  // Desktop sidebar navigation renderer
  const renderNavItems = () => (
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
  );

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-stone-50">
        {/* ===== Desktop sidebar ===== */}
        <aside className="hidden w-60 flex-col border-r border-stone-200 bg-white md:flex">
          <div className="flex h-16 shrink-0 items-center border-b border-stone-100 px-5">
            <Logo size="sm" />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {renderNavItems()}
          </nav>
          <div className="border-t border-stone-100 px-3 py-3">
            <a href="https://www.zh-aoi.com/" target="_blank" rel="noopener noreferrer" className="block text-xs text-stone-400 text-center hover:text-teal-600 transition-colors">Powered by 智合科技 © 2026</a>
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 md:h-16 md:px-6">
            <div className="flex items-center gap-3">
              {/* Hamburger (mobile only) */}
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-700 md:hidden"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <h2 className="text-base font-semibold text-stone-800 md:text-lg">考核管理后台</h2>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <div className="hidden items-center gap-2 sm:flex">
                <CircleUserRound className="h-7 w-7 text-stone-400" />
                <span className="text-sm font-medium text-stone-600">管理员</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">退出登录</span>
              </Button>
            </div>
          </header>

          {/* ===== Mobile dropdown nav (slides down from top bar) ===== */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 top-14 z-40 bg-black/30 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <div
            className={`absolute left-0 right-0 z-50 border-b border-stone-200 bg-white shadow-lg transition-all duration-300 ease-out md:hidden ${
              sidebarOpen
                ? 'max-h-80 opacity-100'
                : 'max-h-0 opacity-0 overflow-hidden border-b-0'
            }`}
            style={{ top: '3.5rem' }}
          >
            <nav className="px-3 py-2">
              <ul className="space-y-0.5">
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
          </div>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
