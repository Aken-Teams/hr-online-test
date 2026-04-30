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
import { Pencil, Send, Eye, ClipboardCheck, BarChart3, Square, Play, Archive, Trash2, RefreshCw } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import type { ExamListItem } from '@/types/exam';

// ---------------------------------------------------------------------------
// Status badge variant mapping (includes display-only statuses)
// ---------------------------------------------------------------------------

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'info' | 'success' | 'danger' | 'warning' | 'purple'> = {
  DRAFT: 'default',
  PUBLISHED: 'info',
  ACTIVE: 'success',
  NOT_STARTED: 'warning',
  EXPIRED: 'danger',
  CLOSED: 'danger',
  ARCHIVED: 'default',
};

const DISPLAY_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '待开放',
  ACTIVE: '进行中',
  NOT_STARTED: '未开始',
  EXPIRED: '已过期',
  CLOSED: '已结束',
  ARCHIVED: '已归档',
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
  const [statusAction, setStatusAction] = useState<{ id: string; status: string; label: string } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reopenOpenAt, setReopenOpenAt] = useState('');
  const [reopenCloseAt, setReopenCloseAt] = useState('');
  const [reopening, setReopening] = useState(false);

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
      toast('考试已保存，待开放', 'success');
      setPublishId(null);
      fetchExams();
    } catch {
      toast('发布考试失败', 'error');
    } finally {
      setPublishing(false);
    }
  }, [publishId, toast, fetchExams]);

  const handleStatusChange = useCallback(async () => {
    if (!statusAction) return;
    setChangingStatus(true);
    try {
      const res = await fetch(`/api/admin/exams/${statusAction.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusAction.status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '操作失败');
      toast(`考试已${statusAction.label}`, 'success');
      setStatusAction(null);
      fetchExams();
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setChangingStatus(false);
    }
  }, [statusAction, toast, fetchExams]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/exams/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      toast('考试已删除', 'success');
      setDeleteId(null);
      fetchExams();
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteId, toast, fetchExams]);

  function toDatetimeLocal(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openReopenDialog(id: string) {
    const now = new Date();
    const closeDefault = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setReopenOpenAt(toDatetimeLocal(now));
    setReopenCloseAt(toDatetimeLocal(closeDefault));
    setReopenId(id);
  }

  const handleReopen = useCallback(async () => {
    if (!reopenId) return;
    if (!reopenCloseAt) { toast('请设置截止时间', 'error'); return; }
    setReopening(true);
    try {
      const res = await fetch(`/api/admin/exams/${reopenId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE', openAt: reopenOpenAt, closeAt: reopenCloseAt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '操作失败');
      toast('考试已重新开放', 'success');
      setReopenId(null);
      fetchExams();
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setReopening(false);
    }
  }, [reopenId, reopenOpenAt, reopenCloseAt, toast, fetchExams]);

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
                    <Badge variant={STATUS_BADGE_VARIANT[exam.displayStatus ?? exam.status] ?? 'default'}>
                      {DISPLAY_STATUS_LABELS[exam.displayStatus ?? exam.status] ?? exam.status}
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
                      {exam.status === 'ARCHIVED' ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      {exam.status === 'ARCHIVED' ? '查看' : '编辑'}
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
                    {/* 阅卷 button hidden — manual-grade types not used in online exams
                    {(exam.status === 'ACTIVE' || exam.status === 'CLOSED') && (
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                        onClick={() => router.push(`/admin/exams/${exam.id}/grading`)}
                      >
                        <ClipboardCheck className="h-3 w-3" />
                        阅卷
                      </button>
                    )}
                    */}
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
                      onClick={() => router.push(`/admin/exams/${exam.id}/results`)}
                    >
                      <BarChart3 className="h-3 w-3" />
                      成绩
                    </button>
                    {exam.status === 'PUBLISHED' && (
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                        onClick={() => setStatusAction({ id: exam.id, status: 'ACTIVE', label: '开放' })}
                      >
                        <Play className="h-3 w-3" />
                        开放考试
                      </button>
                    )}
                    {exam.status === 'ACTIVE' && (
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setStatusAction({ id: exam.id, status: 'CLOSED', label: '结束' })}
                      >
                        <Square className="h-3 w-3" />
                        结束考试
                      </button>
                    )}
                    {exam.status === 'CLOSED' && (
                      <>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                          onClick={() => openReopenDialog(exam.id)}
                        >
                          <Play className="h-3 w-3" />
                          重新开放
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-100 hover:text-stone-700"
                          onClick={() => setStatusAction({ id: exam.id, status: 'ARCHIVED', label: '归档' })}
                        >
                          <Archive className="h-3 w-3" />
                          归档
                        </button>
                      </>
                    )}
                    {(['DRAFT', 'PUBLISHED'] as string[]).includes(exam.status) && (
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteId(exam.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                        删除
                      </button>
                    )}
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
                        <Badge variant={STATUS_BADGE_VARIANT[exam.displayStatus ?? exam.status] ?? 'default'}>
                          {DISPLAY_STATUS_LABELS[exam.displayStatus ?? exam.status] ?? exam.status}
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
                            {exam.status === 'ARCHIVED' ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                            {exam.status === 'ARCHIVED' ? '查看' : '编辑'}
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
                          {/* 阅卷 button hidden — manual-grade types not used in online exams
                          {(exam.status === 'ACTIVE' || exam.status === 'CLOSED') && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                              onClick={() => router.push(`/admin/exams/${exam.id}/grading`)}
                            >
                              <ClipboardCheck className="h-3 w-3" />
                              阅卷
                            </button>
                          )}
                          */}
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
                            onClick={() => router.push(`/admin/exams/${exam.id}/results`)}
                          >
                            <BarChart3 className="h-3 w-3" />
                            成绩
                          </button>
                          {exam.status === 'PUBLISHED' && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                              onClick={() => setStatusAction({ id: exam.id, status: 'ACTIVE', label: '开放' })}
                            >
                              <Play className="h-3 w-3" />
                              开放考试
                            </button>
                          )}
                          {exam.status === 'ACTIVE' && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setStatusAction({ id: exam.id, status: 'CLOSED', label: '结束' })}
                            >
                              <Square className="h-3 w-3" />
                              结束考试
                            </button>
                          )}
                          {exam.status === 'CLOSED' && (
                            <>
                              <button
                                className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                                onClick={() => openReopenDialog(exam.id)}
                              >
                                <Play className="h-3 w-3" />
                                重新开放
                              </button>
                              <button
                                className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-100 hover:text-stone-700"
                                onClick={() => setStatusAction({ id: exam.id, status: 'ARCHIVED', label: '归档' })}
                              >
                                <Archive className="h-3 w-3" />
                                归档
                              </button>
                            </>
                          )}
                          {(['DRAFT', 'PUBLISHED'] as string[]).includes(exam.status) && (
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setDeleteId(exam.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                              删除
                            </button>
                          )}
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

      <ConfirmDialog
        open={statusAction !== null}
        onClose={() => setStatusAction(null)}
        onConfirm={handleStatusChange}
        title={`${statusAction?.label ?? '变更'}考试`}
        message={
          statusAction?.status === 'CLOSED'
            ? '结束后考生将无法继续作答。确认结束此考试？'
            : statusAction?.status === 'ARCHIVED'
              ? '归档后考试将不再显示在活跃列表中。确认归档？'
              : '确认执行此操作？'
        }
        confirmText={`确认${statusAction?.label ?? '执行'}`}
        loading={changingStatus}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="删除考试"
        message="删除后数据将无法恢复。确认删除此考试？"
        confirmText="确认删除"
        loading={deleting}
      />

      {/* Reopen dialog with new time range */}
      <Dialog
        open={reopenId !== null}
        onClose={() => setReopenId(null)}
        title="重新开放考试"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReopenId(null)} disabled={reopening}>
              取消
            </Button>
            <Button variant="primary" onClick={handleReopen} loading={reopening}>
              确认重新开放
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-gray-600">请设置本次开放的时间范围。</p>
          <div className="space-y-1">
            <label className="block font-medium text-gray-700">开放时间</label>
            <input
              type="datetime-local"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
              value={reopenOpenAt}
              onChange={(e) => setReopenOpenAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block font-medium text-gray-700">截止时间</label>
            <input
              type="datetime-local"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
              value={reopenCloseAt}
              onChange={(e) => setReopenCloseAt(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
