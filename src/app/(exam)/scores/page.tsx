'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface MyResult {
  sessionId: string;
  examId: string;
  examTitle: string;
  process: string | null;
  level: string | null;
  autoScore: number;
  practicalScore: number | null;
  combinedScore: number | null;
  isResultQueryOpen: boolean;
  scoreVisible: boolean;
  isPendingGrading?: boolean;
  resultQueryOpenAt: string | null;
  submittedAt: string | null;
  missed?: boolean;
}

const PAGE_SIZE = 10;

export default function ScoresPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [results, setResults] = useState<MyResult[]>([]);
  const [loading, setLoading] = useState(true);

  // 筛选 / 搜寻 / 分页
  const [search, setSearch] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | pending | passed | failed | missed
  const [page, setPage] = useState(1);

  useEffect(() => {
    const token = localStorage.getItem('exam-token');
    if (!token) {
      router.replace('/');
      return;
    }
    async function fetchResults() {
      try {
        const res = await fetch('/api/exam/my-results');
        const json = await res.json();
        if (json.success) setResults(json.data);
        else toast(json.error || '加载成绩失败', 'error');
      } catch {
        toast('加载成绩失败', 'error');
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [router, toast]);

  const examOptions = useMemo(
    () => [...new Map(results.map((r) => [r.examId, r.examTitle])).entries()],
    [results]
  );

  const statusOf = (r: MyResult): 'pending' | 'missed' | 'other' =>
    r.missed ? 'missed' : r.isPendingGrading ? 'pending' : 'other';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) => {
      if (examFilter && r.examId !== examFilter) return false;
      if (statusFilter && statusOf(r) !== statusFilter) return false;
      if (q && !r.examTitle.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [results, search, examFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, examFilter, statusFilter]);

  // 分数单元格：待评分 → 评分中；未参加 → 0；否则显示分数或 —
  function scoreCell(r: MyResult, value: number | null) {
    if (r.missed) return <span className="text-red-400">0</span>;
    if (r.isPendingGrading) return <span className="text-xs font-medium text-amber-600">评分中</span>;
    if (!r.scoreVisible) return <span className="text-stone-300">—</span>;
    return value ?? <span className="text-stone-300">—</span>;
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-stone-800">成绩查询</h1>
        <p className="mt-1 text-sm text-stone-500">查看您的考试成绩和综合得分</p>
      </div>

      {results.length === 0 ? (
        <EmptyState title="暂无成绩" description="您还没有已完成的考试成绩" />
      ) : (
        <>
          {/* 筛选栏 */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜寻考试名称"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 sm:max-w-xs"
            />
            <CustomSelect
              value={examFilter}
              onChange={setExamFilter}
              className="sm:w-48"
              options={[
                { value: '', label: '全部考试' },
                ...examOptions.map(([id, title]) => ({ value: id, label: title })),
              ]}
            />
            <CustomSelect
              value={statusFilter}
              onChange={setStatusFilter}
              className="sm:w-36"
              options={[
                { value: '', label: '全部状态' },
                { value: 'pending', label: '评分中' },
                { value: 'missed', label: '未参加' },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">没有符合条件的成绩</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {paged.map((r, i) => (
                  <div key={r.sessionId || `m-${i}`} className={`rounded-xl border bg-white p-4 shadow-sm ${r.missed ? 'border-red-200' : 'border-stone-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-stone-800">{r.examTitle}</h3>
                      {r.missed ? (
                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">未参加</span>
                      ) : r.isPendingGrading ? (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">评分中</span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {r.process && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">{r.process}</span>}
                      {r.level && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{r.level}</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-stone-50 px-3 py-2.5">
                      <div className="text-center"><p className="text-[11px] text-stone-400">线上分</p><p className="mt-0.5 text-sm font-semibold text-stone-800">{scoreCell(r, r.autoScore)}</p></div>
                      <div className="text-center"><p className="text-[11px] text-stone-400">实操分</p><p className="mt-0.5 text-sm font-semibold text-stone-800">{scoreCell(r, r.practicalScore)}</p></div>
                      <div className="text-center"><p className="text-[11px] text-stone-400">综合分</p><p className="mt-0.5 text-sm font-bold text-teal-700">{scoreCell(r, r.combinedScore)}</p></div>
                    </div>
                    {r.submittedAt && <p className="mt-2 text-[11px] text-stone-400">交卷：{new Date(r.submittedAt).toLocaleString('zh-CN')}</p>}
                    {r.sessionId && !r.missed && (
                      <button
                        onClick={() => router.push(`/result?sessionId=${r.sessionId}`)}
                        className="mt-3 w-full rounded-lg border border-teal-200 bg-teal-50 py-2 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                      >
                        查看详情
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <Card className="hidden sm:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100 text-xs text-stone-500">
                        <th className="py-2 pr-3 text-left font-medium">考试</th>
                        <th className="py-2 text-center font-medium">工序</th>
                        <th className="py-2 text-center font-medium">等级</th>
                        <th className="py-2 text-center font-medium">线上分</th>
                        <th className="py-2 text-center font-medium">实操分</th>
                        <th className="py-2 text-center font-medium">综合分</th>
                        <th className="py-2 text-center font-medium">交卷时间</th>
                        <th className="py-2 text-center font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((r, i) => (
                        <tr key={r.sessionId || `d-${i}`} className={`border-b ${r.missed ? 'border-red-50 bg-red-50/30' : 'border-stone-50'}`}>
                          <td className="py-2.5 pr-3 font-medium text-stone-800">
                            {r.examTitle}
                            {r.missed && <span className="ml-2 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">未参加</span>}
                            {r.isPendingGrading && <span className="ml-2 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">评分中</span>}
                          </td>
                          <td className="py-2.5 text-center text-stone-600">{r.process ?? '-'}</td>
                          <td className="py-2.5 text-center text-stone-600">{r.level ?? '-'}</td>
                          <td className="py-2.5 text-center">{scoreCell(r, r.autoScore)}</td>
                          <td className="py-2.5 text-center">{scoreCell(r, r.practicalScore)}</td>
                          <td className="py-2.5 text-center font-semibold text-teal-700">{scoreCell(r, r.combinedScore)}</td>
                          <td className="py-2.5 text-center text-xs text-stone-400 whitespace-nowrap">
                            {r.missed ? <span className="text-red-400">未参加</span> : r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-'}
                          </td>
                          <td className="py-2.5 text-center">
                            {r.sessionId && !r.missed ? (
                              <button
                                onClick={() => router.push(`/result?sessionId=${r.sessionId}`)}
                                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                              >
                                查看详情
                              </button>
                            ) : (
                              <span className="text-stone-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">第 {pageSafe} / {totalPages} 页，共 {filtered.length} 条</span>
                  <div className="flex gap-2">
                    <button disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600 disabled:opacity-40 hover:bg-stone-50">上一页</button>
                    <button disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600 disabled:opacity-40 hover:bg-stone-50">下一页</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
