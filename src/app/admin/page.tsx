'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardData {
  stats: {
    totalExams: number;
    totalQuestions: number;
    totalEmployees: number;
    activeSessions: number;
    pendingGrading: number;
    averagePassRate: number;
  };
  recentSessions: {
    id: string;
    employeeName: string;
    department: string;
    examTitle: string;
    status: string;
    score: number | null;
    submittedAt: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Stat card helper
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
      <p className="text-xs font-medium text-stone-500 sm:text-sm">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-stone-800 sm:mt-1 sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge mapping
// ---------------------------------------------------------------------------

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple'> = {
  NOT_STARTED: 'default',
  IN_PROGRESS: 'info',
  SUBMITTED: 'success',
  AUTO_SUBMITTED: 'warning',
  GRADING: 'purple',
  COMPLETED: 'success',
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  SUBMITTED: '已提交',
  AUTO_SUBMITTED: '自动提交',
  GRADING: '待阅卷',
  COMPLETED: '已完成',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AdminDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard');
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      setData(json.data);
    } catch {
      toast('加载仪表盘数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="仪表盘" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stats = data?.stats;
  const recentSessions = data?.recentSessions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="仪表盘" description="系统运行概览" />

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="考试总数" value={stats?.totalExams ?? 0} />
        <StatCard label="题库总量" value={stats?.totalQuestions ?? 0} />
        <StatCard label="员工数量" value={stats?.totalEmployees ?? 0} />
        <StatCard label="当前在线" value={stats?.activeSessions ?? 0} />
        <StatCard label="待阅卷" value={stats?.pendingGrading ?? 0} />
        <StatCard
          label="平均通过率"
          value={stats?.averagePassRate != null ? `${stats.averagePassRate}%` : '--'}
        />
      </div>

      {/* Quick actions */}
      <Card title="快捷操作">
        <div className="flex flex-wrap gap-3">
          <Button size="sm" onClick={() => router.push('/admin/exams/new')}>
            创建考试
          </Button>
          <Button size="sm" variant="secondary" onClick={() => router.push('/admin/questions/import')}>
            导入题库
          </Button>
          <Button size="sm" variant="secondary" onClick={() => router.push('/admin/employees/import')}>
            导入员工
          </Button>
        </div>
      </Card>

      {/* Recent sessions */}
      <Card title="最近考试记录">
        {recentSessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">暂无考试记录</p>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="space-y-3 md:hidden">
              {recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-800">{session.employeeName}</span>
                    <Badge variant={STATUS_BADGE_VARIANT[session.status] ?? 'default'}>
                      {SESSION_STATUS_LABELS[session.status] ?? session.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {session.department} · {session.examTitle}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-stone-400">
                    <span>得分: <span className="font-medium text-stone-700">{session.score != null ? session.score : '--'}</span></span>
                    <span>
                      {session.submittedAt
                        ? new Date(session.submittedAt).toLocaleString('zh-CN')
                        : '--'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>考试</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>得分</TableHead>
                    <TableHead>提交时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.employeeName}</TableCell>
                      <TableCell>{session.department}</TableCell>
                      <TableCell>{session.examTitle}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE_VARIANT[session.status] ?? 'default'}>
                          {SESSION_STATUS_LABELS[session.status] ?? session.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{session.score != null ? session.score : '--'}</TableCell>
                      <TableCell className="text-stone-500 text-sm">
                        {session.submittedAt
                          ? new Date(session.submittedAt).toLocaleString('zh-CN')
                          : '--'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
