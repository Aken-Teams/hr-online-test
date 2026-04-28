'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { CustomSelect } from '@/components/ui/CustomSelect';
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
import { QUESTION_TYPE_LABELS, QUESTION_CATEGORY_LABELS } from '@/lib/constants';
import { Pencil, Trash2, ImageIcon, Download } from 'lucide-react';
import { ExportDialog } from '@/components/shared/ExportDialog';
import type { QuestionData, QuestionType, PaginatedResponse } from '@/types/exam';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSelectOptions(values: string[], allLabel: string, labelMap?: Record<string, string>) {
  return [
    { value: '', label: allLabel },
    ...values.map((v) => ({ value: v, label: labelMap?.[v] ?? v })),
  ];
}

// ---------------------------------------------------------------------------
// Badge variant for question type
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<QuestionType, 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple'> = {
  SINGLE_CHOICE: 'info',
  MULTI_CHOICE: 'purple',
  TRUE_FALSE: 'warning',
  SHORT_ANSWER: 'success',
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

  // Exam list for filter
  const [examOptions, setExamOptions] = useState<{ value: string; label: string }[]>([{ value: '', label: '全部考试' }]);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [processFilter, setProcessFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [search, setSearch] = useState('');

  // Dynamic filter options from DB
  const [filterOpts, setFilterOpts] = useState<{
    types: string[]; departments: string[]; levels: string[]; categories: string[]; processes: string[];
  }>({ types: [], departments: [], levels: [], categories: [], processes: [] });

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection & delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Export
  const [exportOpen, setExportOpen] = useState(false);

  // Fetch exam list for filter dropdown
  useEffect(() => {
    async function loadExams() {
      try {
        const res = await fetch('/api/admin/exams?pageSize=100');
        const json = await res.json();
        if (json.success && json.data?.items) {
          const opts = json.data.items.map((e: { id: string; title: string }) => ({
            value: e.id,
            label: e.title,
          }));
          setExamOptions([{ value: '', label: '全部考试' }, ...opts]);
        }
      } catch { /* ignore */ }
    }
    loadExams();
  }, []);

  // Fetch dynamic filter options (scoped by exam if selected)
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const params = examFilter ? `?examSourceId=${examFilter}` : '';
        const res = await fetch(`/api/admin/questions/filter-options${params}`);
        const json = await res.json();
        if (json.success) {
          setFilterOpts(json.data);
        }
      } catch { /* ignore */ }
    }
    loadFilterOptions();
  }, [examFilter]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '10');
      if (typeFilter) params.set('type', typeFilter);
      if (deptFilter) params.set('department', deptFilter);
      if (levelFilter) params.set('level', levelFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (processFilter) params.set('process', processFilter);
      if (examFilter) params.set('examSourceId', examFilter);
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
  }, [page, typeFilter, deptFilter, levelFilter, categoryFilter, processFilter, examFilter, search, toast]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [typeFilter, deptFilter, levelFilter, categoryFilter, processFilter, examFilter, search]);

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === questions.length) return new Set();
      return new Set(questions.map((q) => q.id));
    });
  }, [questions]);

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, typeFilter, deptFilter, levelFilter, categoryFilter, processFilter, examFilter, search]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/admin/questions/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      const msgs: string[] = [];
      if (json.data.deleted > 0) msgs.push(`${json.data.deleted} 题已删除`);
      if (json.data.deactivated > 0) msgs.push(`${json.data.deactivated} 题已停用（被考试引用）`);
      toast(msgs.join('，'), 'success');
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      fetchQuestions();
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, toast, fetchQuestions]);

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
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="h-4 w-4" />
              导出题库
            </Button>
            <Button variant="secondary" onClick={() => router.push('/admin/questions/import')}>
              导入题库
            </Button>
            <Button onClick={() => router.push('/admin/questions/new')}>新建题目</Button>
          </div>
        }
      />

      {/* Filter bar */}
      <Card className="overflow-visible">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
          <CustomSelect
            label="关联考试"
            options={examOptions}
            value={examFilter}
            onChange={(val) => {
              setExamFilter(val);
              setTypeFilter('');
              setCategoryFilter('');
              setDeptFilter('');
              setLevelFilter('');
              setProcessFilter('');
            }}
          />
          <CustomSelect
            label="题型"
            options={toSelectOptions(filterOpts.types, '全部题型', QUESTION_TYPE_LABELS as Record<string, string>)}
            value={typeFilter}
            onChange={(val) => setTypeFilter(val)}
          />
          <CustomSelect
            label="分类"
            options={toSelectOptions(filterOpts.categories, '全部分类', QUESTION_CATEGORY_LABELS)}
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
          />
          <CustomSelect
            label="部门"
            options={toSelectOptions(filterOpts.departments, '全部部门')}
            value={deptFilter}
            onChange={(val) => setDeptFilter(val)}
          />
          <CustomSelect
            label="级别"
            options={toSelectOptions(filterOpts.levels, '全部级别')}
            value={levelFilter}
            onChange={(val) => setLevelFilter(val)}
          />
          {filterOpts.processes.length > 0 && (
            <CustomSelect
              label="工序"
              options={toSelectOptions(filterOpts.processes, '全部工序')}
              value={processFilter}
              onChange={(val) => setProcessFilter(val)}
            />
          )}
          <Input
            label="搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索题目..."
          />
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
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <span className="text-sm text-red-700">已选中 {selectedIds.size} 题</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>取消选择</Button>
                <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  批量删除
                </Button>
              </div>
            </div>
          )}

          <Card>
            {/* Mobile: card list */}
            <div className="space-y-3 md:hidden">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-stone-300 text-teal-600 accent-teal-600"
                      checked={selectedIds.has(q.id)}
                      onChange={() => toggleSelect(q.id)}
                    />
                    <Badge variant={TYPE_BADGE[q.type] ?? 'default'}>
                      {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                    </Badge>
                    <span className="text-xs text-stone-400">{q.points} 分</span>
                  </div>
                  <p className="mt-1.5 text-sm text-stone-700 leading-relaxed">
                    {truncate(q.content, 80)}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {q.examSourceTitle ? `${q.examSourceTitle} · ` : ''}{q.department} · {q.level} · {q.category === 'BASIC' ? '基本题' : '专业题'}{q.process ? ` · ${q.process}` : ''}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                      onClick={() => router.push(`/admin/questions/${q.id}`)}
                    >
                      <Pencil className="h-3 w-3" />
                      编辑
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setDeleteId(q.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      删除
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
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-stone-300 text-teal-600 accent-teal-600"
                        checked={selectedIds.size === questions.length && questions.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>题型</TableHead>
                    <TableHead>题目</TableHead>
                    <TableHead>关联考试</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>工序</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>级别</TableHead>
                    <TableHead>分值</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-stone-300 text-teal-600 accent-teal-600"
                          checked={selectedIds.has(q.id)}
                          onChange={() => toggleSelect(q.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={TYPE_BADGE[q.type] ?? 'default'}>
                          {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm" title={q.content}>
                            {truncate(q.content, 60)}
                          </span>
                          {q.options?.some((o) => o.imageUrl) && (
                            <span title="含图片选项">
                              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-teal-500" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-stone-500 max-w-[120px] truncate" title={q.examSourceTitle ?? ''}>
                        {q.examSourceTitle || <span className="text-stone-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${q.category === 'BASIC' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {q.category === 'BASIC' ? '基本题' : '专业题'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-stone-500">{q.process || '-'}</TableCell>
                      <TableCell>{q.department}</TableCell>
                      <TableCell>{q.level}</TableCell>
                      <TableCell>{q.points}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                            onClick={() => router.push(`/admin/questions/${q.id}`)}
                          >
                            <Pencil className="h-3 w-3" />
                            编辑
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                            onClick={() => setDeleteId(q.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            删除
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Pagination */}
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
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="删除题目"
        message="确认删除此题目？删除后无法恢复。"
        confirmText="确认删除"
        variant="danger"
        loading={deleting}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="批量删除题目"
        message={`确认删除选中的 ${selectedIds.size} 道题目？被考试引用的题目将自动停用而非删除。`}
        confirmText={`删除 ${selectedIds.size} 题`}
        variant="danger"
        loading={bulkDeleting}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="导出题库"
        description="选择要导出的考试题库，将生成 Excel 文件下载。"
        allowAll
        onExport={async (examId) => {
          const url = examId ? `/api/admin/questions/export?examId=${examId}` : '/api/admin/questions/export';
          const res = await fetch(url);
          if (!res.ok) throw new Error('导出失败');
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `题库-${new Date().toLocaleDateString('zh-CN')}.xlsx`;
          a.click();
          URL.revokeObjectURL(a.href);
          toast('导出成功', 'success');
        }}
      />
    </div>
  );
}
