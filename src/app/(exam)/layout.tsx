'use client';

import { type ReactNode, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ToastProvider } from '@/components/ui/Toast';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { LogOut, LayoutDashboard, ClipboardList, BarChart3, Menu, X, CircleUserRound } from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: '儀表板', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: 'my-exams', label: '我的考试', href: '/my-exams', icon: <ClipboardList className="h-5 w-5" /> },
  { key: 'scores', label: '成绩查询', href: '/scores', icon: <BarChart3 className="h-5 w-5" /> },
];

/** Pages that should NOT show the sidebar (full-screen mode) */
const FULL_SCREEN_PATHS = ['/test', '/verify'];
/** Pages that are the public login pages (no auth required) */
const PUBLIC_PATHS = ['/', '/verify'];

export default function ExamLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const isFullScreen = FULL_SCREEN_PATHS.some((p) => pathname.startsWith(p));
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    const token = localStorage.getItem('exam-token');
    if (token) {
      setLoggedIn(true);
      try {
        const emp = JSON.parse(localStorage.getItem('exam-employee') || '{}');
        setEmployeeName(emp.name || '');
      } catch { /* ignore */ }
    }
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('exam-token');
    localStorage.removeItem('exam-employee');
    localStorage.removeItem('exam-result-session');
    localStorage.removeItem('exam-questions-raw');
    localStorage.removeItem('exam-session-id');
    setLoggedIn(false);
    router.replace('/');
  }, [router]);

  const getIsActive = (item: NavItem) => {
    if (item.href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(item.href);
  };

  // Public/login pages or full-screen test: no sidebar
  if (!ready || isPublic || isFullScreen || !loggedIn) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-gradient-to-br from-amber-50/40 via-white to-teal-50/30">
          {children}
        </div>
      </ToastProvider>
    );
  }

  // Logged-in with sidebar
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-stone-50">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 flex-col border-r border-stone-200 bg-white md:flex">
          <div className="flex h-16 shrink-0 items-center border-b border-stone-100 px-5">
            <Logo size="sm" />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = getIsActive(item);
                return (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      onClick={(e) => { e.preventDefault(); router.push(item.href); }}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        active ? 'bg-teal-50 text-teal-700' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-800'
                      }`}
                    >
                      <span className={active ? 'text-teal-600' : 'text-stone-400'}>{item.icon}</span>
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-stone-100 px-3 py-3">
            <a href="https://www.zh-aoi.com/" target="_blank" rel="noopener noreferrer" className="block text-xs text-stone-400 text-center hover:text-teal-600 transition-colors">
              Powered by 智合科技 © 2026
            </a>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 md:h-16 md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-700 md:hidden"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <h2 className="text-base font-semibold text-stone-800 md:text-lg">员工考核系统</h2>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              {employeeName && (
                <div className="hidden items-center gap-2 sm:flex">
                  <CircleUserRound className="h-7 w-7 text-stone-400" />
                  <span className="text-sm font-medium text-stone-600">{employeeName}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">退出登录</span>
              </Button>
            </div>
          </header>

          {/* Mobile nav dropdown */}
          {sidebarOpen && (
            <div className="fixed inset-0 top-14 z-40 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          <div
            className={`absolute left-0 right-0 z-50 border-b border-stone-200 bg-white shadow-lg transition-all duration-300 ease-out md:hidden ${
              sidebarOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 overflow-hidden border-b-0'
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
                        onClick={(e) => { e.preventDefault(); router.push(item.href); }}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          active ? 'bg-teal-50 text-teal-700' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-800'
                        }`}
                      >
                        <span className={active ? 'text-teal-600' : 'text-stone-400'}>{item.icon}</span>
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
