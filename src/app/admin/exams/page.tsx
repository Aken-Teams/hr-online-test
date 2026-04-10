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
  const [loading, setLoading] = useState(true);
  const [publishId, setPublishId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const fetchExams = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/exams');
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      setExams(json.data?.items ?? json.data ?? []);
    } catch {
      toast('加载考试列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
        <Card>
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
                    <div className="flex items-center gap-2">
                      <button
                        className="text-sm text-teal-600 hover:text-teal-800 font-medium"
                        onClick={() => router.push(`/admin/exams/${exam.id}`)}
                      >
                        编辑
                      </button>
                      {exam.status === 'DRAFT' && (
                        <button
                          className="text-sm text-green-600 hover:text-green-800 font-medium"
                          onClick={() => setPublishId(exam.id)}
                        >
                          发布
                        </button>
                      )}
                      {(exam.status === 'ACTIVE' || exam.status === 'PUBLISHED') && (
                        <button
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          onClick={() => router.push(`/admin/exams/${exam.id}/monitor`)}
                        >
                          监控
                        </button>
                      )}
                      {(exam.status === 'ACTIVE' || exam.status === 'CLOSED') && (
                        <button
                          className="text-sm text-amber-600 hover:text-amber-800 font-medium"
                          onClick={() => router.push(`/admin/exams/${exam.id}/grading`)}
                        >
                          阅卷
                        </button>
                      )}
                      <button
                        className="text-sm text-stone-600 hover:text-stone-700 font-medium"
                        onClick={() => router.push(`/admin/exams/${exam.id}/results`)}
                      >
                        成绩
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
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
