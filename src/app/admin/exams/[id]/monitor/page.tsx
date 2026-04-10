'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonitorSession {
  id: string;
  employeeName: string;
  department: string;
  answeredCount: number;
  totalQuestions: number;
  status: string;
  tabSwitchCount: number;
  lastActiveAt: string | null;
}

interface AlertEvent {
  id: string;
  time: string;
  employeeName: string;
  type: string;
  message: string;
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  SUBMITTED: '已交卷',
  AUTO_SUBMITTED: '自动提交',
  COMPLETED: '已完成',
};

const STATUS_VARIANT: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  NOT_STARTED: 'default',
  IN_PROGRESS: 'info',
  SUBMITTED: 'success',
  AUTO_SUBMITTED: 'warning',
  COMPLETED: 'success',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ExamMonitorPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;

  const [sessions, setSessions] = useState<MonitorSession[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const alertIdRef = useRef(0);

  // Connect to SSE
  useEffect(() => {
    const url = `/api/admin/monitoring/sessions?examId=${examId}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setLoading(false);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'sessions') {
          setSessions(data.sessions ?? []);
        } else if (data.type === 'alert') {
          setAlerts((prev) => [
            {
              id: String(++alertIdRef.current),
              time: new Date().toLocaleTimeString('zh-CN'),
              employeeName: data.employeeName ?? '--',
              type: data.alertType ?? 'warning',
              message: data.message ?? '',
            },
            ...prev.slice(0, 49), // keep last 50
          ]);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, [examId]);

  // Derived stats
  const onlineCount = sessions.filter((s) => s.status === 'IN_PROGRESS').length;
  const submittedCount = sessions.filter(
    (s) => s.status === 'SUBMITTED' || s.status === 'AUTO_SUBMITTED' || s.status === 'COMPLETED'
  ).length;
  const abnormalCount = sessions.filter((s) => s.tabSwitchCount > 0).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="实时监控" />
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="实时监控"
        description={connected ? '已连接' : '连接断开，尝试重连中...'}
        actions={
          <Button variant="ghost" onClick={() => router.push('/admin/exams')}>
            返回列表
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-stone-500">在线人数</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{onlineCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-stone-500">已交卷</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{submittedCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-stone-500">异常行为</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{abnormalCount}</p>
        </div>
      </div>

      {/* Session table */}
      <Card title="考生状态">
        {sessions.length === 0 ? (
          <EmptyState title="暂无考生数据" description="等待考生开始考试" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>进度</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>切屏次数</TableHead>
                <TableHead>最后活动</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.employeeName}</TableCell>
                  <TableCell>{s.department}</TableCell>
                  <TableCell>
                    {s.answeredCount}/{s.totalQuestions}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[s.status] ?? 'default'}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={s.tabSwitchCount > 0 ? 'text-red-600 font-medium' : ''}>
                      {s.tabSwitchCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-stone-500">
                    {s.lastActiveAt
                      ? new Date(s.lastActiveAt).toLocaleTimeString('zh-CN')
                      : '--'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Alert feed */}
      <Card title="异常事件">
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">暂无异常事件</p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50/50 px-4 py-2.5"
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-800">
                    <span className="font-medium">{alert.employeeName}</span>
                    {' - '}
                    {alert.message}
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">{alert.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
