'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { EXAM_STATUS_LABELS } from '@/lib/constants';
import { Pencil, Send, Eye, ClipboardCheck, BarChart3 } from 'lucide-react';
import type { ExamListItem, ExamStatus } from '@/types/exam';

// ---------------------------------------------------------------------------
// Status badge variant mapping
// ---------------------------------------------------------------------------

const STATUS_BADGE_VARIANT: Record<ExamStatus, 'default' | 'info' | 'success' | 'danger' | 'warning' | 'purple'> = {
  DRAFT: 'default',
  PUBLISHED: 'info',
  ACTIVE: 'success',
  CLOSED: 'danger',
  ARCHIVED: 'default',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ExamListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [publishId, setPublishId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '10');

      const res = await fetch(`/api/admin/exams?${params.toString()}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      const data = json.data;
      setExams(data?.items ?? []);
      setTotal(data?.total ?? 0);
      setTotalPages(data?.totalPages ?? 1);
    } catch {
      toast('加载考试列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handlePublish = useCallback(async () => {
    if (!publishId) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/exams/${publishId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('发布失败');
      toast('考试已发布', 'success');
      setPublishId(null);
      fetchExams();
    } catch {
      toast('发布考试失败', 'error');
    } finally {
      setPublishing(false);
    }
  }, [publishId, toast, fetchExams]);

  function formatDateTime(dateStr: string | Date | null | undefined) {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="考试管理" />
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="考试管理"
        description="管理所有考试及其配置"
        actions={
          <Button onClick={() => router.push('/admin/exams/new')}>创建考试</Button>
        }
      />

      {exams.length === 0 ? (
        <EmptyState
          title="暂无考试"
          description="创建第一场考试以开始使用系统"
          action={
            <Button onClick={() => router.push('/admin/exams/new')}>创建考试</Button>
          }
        />
      ) : (
        <>
          <Card>
            {/* Mobile: card list */}
            <div className="space-y-3 md:hidden">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-800">{exam.title}</span>
                    <Badge variant={STATUS_BADGE_VARIANT[exam.status] ?? 'default'}>
                      {EXAM_STATUS_LABELS[exam.status] ?? exam.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {exam.questionCount ?? '--'} 题 · {exam.timeLimitMinutes} 分钟 · {exam.sessionCount ?? 0} 人参考
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {formatDateTime(exam.openAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                      onClick={() => router.push(`/admin/exams/${exam.id}`)}
                    >
                      <Pencil className="h-3 w-3" />
                      编辑
                    </button>
                    {exam.status === 'DRAFT' && (
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                        onClick={() => setPublishId(exam.id)}
                      >
                        <Send className="h-3 w-3" />
                        发布
                      </button>
                    )}
                    {(exam.status === 'ACTIVE' || exam.status === 'PUBLISHED') && (
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => router.push(`/admin/exams/${exam.id}/monitor`)}
                      >
                        <Eye className="h-3 w-3" />
                        监控
                      </button>
                    )}
                    {(exam.status === 'ACTIVE' || exam.status === 'CLOSED') && (
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                        onClick={() => router.push(`/admin/exams/${exam.id}/grading`)}
                      >
                        <ClipboardCheck className="h-3 w-3" />
                        阅卷
                      </button>
                    )}
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
                      onClick={() => router.push(`/admin/exams/${exam.id}/results`)}
                    >
                      <BarChart3 className="h-3 w-3" />
                      成绩
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>标题</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>题目数</TableHead>
                    <TableHead>时长</TableHead>
                    <TableHead>参考人数</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((exam) => (
                    <TableRow key={exam.id}>
                      <TableCell className="font-medium">{exam.title}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE_VARIANT[exam.status] ?? 'default'}>
                          {EXAM_STATUS_LABELS[exam.status] ?? exam.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{exam.questionCount ?? '--'}</TableCell>
                      <TableCell>{exam.timeLimitMinutes} 分钟</TableCell>
                      <TableCell>{exam.sessionCount ?? 0}</TableCell>
                      <TableCell className="text-sm text-stone-500">
                        {formatDateTime(exam.openAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                            onClick={() => router.push(`/admin/exams/${exam.id}`)}
                          >
                            <Pencil className="h-3 w-3" />
                            编辑
                          </button>
                          {exam.status === 'DRAFT' && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                              onClick={() => setPublishId(exam.id)}
                            >
                              <Send className="h-3 w-3" />
                              发布
                            </button>
                          )}
                          {(exam.status === 'ACTIVE' || exam.status === 'PUBLISHED') && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                              onClick={() => router.push(`/admin/exams/${exam.id}/monitor`)}
                            >
                              <Eye className="h-3 w-3" />
                              监控
                            </button>
                          )}
                          {(exam.status === 'ACTIVE' || exam.status === 'CLOSED') && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                              onClick={() => router.push(`/admin/exams/${exam.id}/grading`)}
                            >
                              <ClipboardCheck className="h-3 w-3" />
                              阅卷
                            </button>
                          )}
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
                            onClick={() => router.push(`/admin/exams/${exam.id}/results`)}
                          >
                            <BarChart3 className="h-3 w-3" />
                            成绩
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              <p className="text-xs text-stone-500 sm:text-sm">
                第 {page} / {totalPages} 页，共 {total} 条
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={publishId !== null}
        onClose={() => setPublishId(null)}
        onConfirm={handlePublish}
        title="发布考试"
        message="发布后考试将对指定员工可见。确认发布此考试？"
        confirmText="确认发布"
        loading={publishing}
      />
    </div>
  );
}
