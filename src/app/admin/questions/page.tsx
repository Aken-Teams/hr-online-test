'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
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
import { DEPARTMENTS, QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionData, QuestionType, PaginatedResponse } from '@/types/exam';

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const TYPE_OPTIONS = [
  { value: '', label: '全部题型' },
  ...Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const DEPT_OPTIONS = [
  { value: '', label: '全部部门' },
  ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
];

const LEVEL_OPTIONS = [
  { value: '', label: '全部级别' },
  { value: '一级题库', label: '一级题库' },
  { value: '二级题库', label: '二级题库' },
  { value: '三级题库', label: '三级题库' },
];

// ---------------------------------------------------------------------------
// Badge variant for question type
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<QuestionType, 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple'> = {
  SINGLE_CHOICE: 'info',
  MULTI_CHOICE: 'purple',
  TRUE_FALSE: 'success',
  SHORT_ANSWER: 'warning',
  FILL_BLANK: 'default',
  CASE_ANALYSIS: 'danger',
  PRACTICAL: 'info',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function QuestionListPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [search, setSearch] = useState('');

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '20');
      if (typeFilter) params.set('type', typeFilter);
      if (deptFilter) params.set('department', deptFilter);
      if (levelFilter) params.set('level', levelFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/questions?${params.toString()}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      const data: PaginatedResponse<QuestionData> = json.data;
      setQuestions(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast('加载题库失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, deptFilter, levelFilter, search, toast]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [typeFilter, deptFilter, levelFilter, search]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/questions/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast('题目已删除', 'success');
      setDeleteId(null);
      fetchQuestions();
    } catch {
      toast('删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteId, toast, fetchQuestions]);

  function truncate(text: string, max: number) {
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="题库管理"
        description={`共 ${total} 道题目`}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => router.push('/admin/questions/import')}>
              导入题库
            </Button>
            <Button onClick={() => router.push('/admin/questions/new')}>新建题目</Button>
          </div>
        }
      />

      {/* Filter bar */}
      <Card>
        <div className="flex items-end gap-4">
          <div className="w-40">
            <Select
              label="题型"
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              label="部门"
              options={DEPT_OPTIONS}
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              label="级别"
              options={LEVEL_OPTIONS}
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="搜索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入关键词搜索题目..."
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : questions.length === 0 ? (
        <EmptyState
          title="暂无题目"
          description="添加或导入题目到题库"
          action={
            <Button onClick={() => router.push('/admin/questions/new')}>新建题目</Button>
          }
        />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>题型</TableHead>
                  <TableHead>题目</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>级别</TableHead>
                  <TableHead>分值</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Badge variant={TYPE_BADGE[q.type] ?? 'default'}>
                        {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="text-sm" title={q.content}>
                        {truncate(q.content, 60)}
                      </span>
                    </TableCell>
                    <TableCell>{q.department}</TableCell>
                    <TableCell>{q.level}</TableCell>
                    <TableCell>{q.points}</TableCell>
                    <TableCell className="text-sm text-stone-500">
                      {q.sourceFile ? '导入' : '手动'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-sm text-teal-600 hover:text-teal-800 font-medium"
                          onClick={() => router.push(`/admin/questions/${q.id}`)}
                        >
                          编辑
                        </button>
                        <button
                          className="text-sm text-red-600 hover:text-red-800 font-medium"
                          onClick={() => setDeleteId(q.id)}
                        >
                          删除
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-stone-500">
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
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="删除题目"
        message="确认删除此题目？删除后无法恢复。"
        confirmText="确认删除"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
