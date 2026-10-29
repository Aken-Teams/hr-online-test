'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { ClipboardCheck } from 'lucide-react';

interface GradingExam {
  examId: string;
  title: string;
  status: string;
  createdAt: string;
  total: number;
  pending: number;
  graded: number;
  aiSuggested: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿', PUBLISHED: '待开放', ACTIVE: '进行中', CLOSED: '已结束', ARCHIVED: '已归档',
};
const PAGE_SIZE = 12;

export default function GradingPortalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [exams, setExams] = useState<GradingExam[]>([]);
  const [scopedProcesses, setScopedProcesses] = useState<string[] | null>(null);
  const [role, setRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/grading/exams');
        const json = await res.json();
        if (json.success) {
          setExams(json.data.exams);
          setScopedProcesses(json.data.scopedProcesses);
          setRole(json.data.role ?? '');
        } else {
          toast(json.error || '加载失败', 'error');
        }
      } catch {
        toast('加载评卷列表失败', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((e) =>
      (!q || e.title.toLowerCase().includes(q)) &&
      (!onlyPending || e.pending > 0) &&
      (!statusFilter || e.status === statusFilter)
    );
  }, [exams, search, onlyPending, statusFilter]);

  const statusOptions = useMemo(() => {
    const present = [...new Set(exams.map((e) => e.status))];
    return [
      { value: '', label: '全部状态' },
      ...present.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })),
    ];
  }, [exams]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, onlyPending, statusFilter]);

  if (loading) return <LoadingSpinner />;

  const isGrader = role === 'GRADER';

  return (
    <div className="space-y-6">
      <PageHeader
        title="简答题评卷"
        description={
          isGrader
            ? (scopedProcesses && scopedProcesses.length > 0
                ? `您负责的工序：${scopedProcesses.join('、')}`
                : '选择考试，批改您负责工序考生的简答题')
            : '查看各场考试的简答题评卷进度（管理员为只读，评卷由评卷人操作）'
        }
      />

      {/* 筛选栏（永远显示，便于空状态时也能操作） */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜寻考试名称"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 sm:max-w-xs"
        />
        <CustomSelect
          options={statusOptions}
          value={statusFilter}
          onChange={setStatusFilter}
          className="sm:w-40"
        />
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="h-4 w-4 rounded border-stone-300 text-teal-600 accent-teal-600" />
          只看有待评分
        </label>
      </div>

      {exams.length === 0 ? (
        <Card contentClassName="py-12">
          <EmptyState title="暂无简答题考试" description="当有考生提交含简答题的考试后，会出现在这里" />
        </Card>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-400">没有符合条件的考试</p>
      ) : (
        <Card contentClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-xs text-stone-500">
                  <th className="px-4 py-3 text-left font-medium">考试</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                  <th className="px-4 py-3 text-right font-medium">待评分</th>
                  <th className="px-4 py-3 text-right font-medium">已评 / 总数</th>
                  <th className="px-4 py-3 text-right font-medium">AI 已初评</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((e) => (
                  <tr key={e.examId} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                    <td className="px-4 py-3 font-medium text-stone-800">{e.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant={e.status === 'ACTIVE' ? 'success' : 'default'}>{STATUS_LABELS[e.status] ?? e.status}</Badge>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${e.pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>{e.pending}</td>
                    <td className="px-4 py-3 text-right text-stone-600">{e.graded} / {e.total}</td>
                    <td className="px-4 py-3 text-right text-teal-600">{e.aiSuggested}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/exams/${e.examId}/grading`)}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-700"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        {!isGrader ? '查看进度' : e.pending > 0 ? `去评卷（${e.pending}）` : '查看'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">第 {pageSafe} / {totalPages} 页，共 {filtered.length} 场</span>
          <div className="flex gap-2">
            <button disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600 disabled:opacity-40 hover:bg-stone-50">上一页</button>
            <button disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600 disabled:opacity-40 hover:bg-stone-50">下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}
