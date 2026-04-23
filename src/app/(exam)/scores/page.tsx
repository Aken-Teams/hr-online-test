'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';

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
  resultQueryOpenAt: string | null;
  submittedAt: string | null;
  missed?: boolean;
}

export default function ScoresPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [results, setResults] = useState<MyResult[]>([]);
  const [loading, setLoading] = useState(true);

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
        if (json.success) {
          setResults(json.data);
        } else {
          toast(json.error || '加载成绩失败', 'error');
        }
      } catch {
        toast('加载成绩失败', 'error');
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, [router, toast]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-stone-800">成绩查询</h1>
        <p className="mt-1 text-sm text-stone-500">查看您的考试成绩和综合得分</p>
      </div>

      {results.length === 0 ? (
        <EmptyState
          title="暂无成绩"
          description="您还没有已完成的考试成绩"
        />
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="space-y-3 sm:hidden">
            {results.map((r, i) => (
              <div key={r.sessionId || `missed-${i}`} className={`rounded-xl border bg-white p-4 shadow-sm ${r.missed ? 'border-red-200' : 'border-stone-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-stone-800">{r.examTitle}</h3>
                  {r.missed ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                      未参加
                    </span>
                  ) : !r.isResultQueryOpen ? (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                      {r.resultQueryOpenAt
                        ? `${new Date(r.resultQueryOpenAt).toLocaleDateString('zh-CN')} 公布`
                        : '待公布'}
                    </span>
                  ) : null}
                </div>

                {(r.process || r.level) && (
                  <div className="mt-2 flex gap-1.5">
                    {r.process && (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">{r.process}</span>
                    )}
                    {r.level && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{r.level}</span>
                    )}
                  </div>
                )}

                {r.missed ? (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-red-600">考试已结束，您未参加此考试</p>
                    <p className="mt-0.5 text-sm font-semibold text-red-700">0 分</p>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-stone-50 px-3 py-2.5">
                    <div className="text-center">
                      <p className="text-[11px] text-stone-400">线上分</p>
                      <p className="mt-0.5 text-sm font-semibold text-stone-800">
                        {r.isResultQueryOpen ? r.autoScore : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-stone-400">实操分</p>
                      <p className="mt-0.5 text-sm font-semibold text-stone-800">
                        {r.isResultQueryOpen ? (r.practicalScore ?? '—') : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-stone-400">综合分</p>
                      <p className="mt-0.5 text-sm font-bold text-teal-700">
                        {r.isResultQueryOpen ? (r.combinedScore ?? '—') : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {r.submittedAt && (
                  <p className="mt-2 text-[11px] text-stone-400">
                    交卷时间：{new Date(r.submittedAt).toLocaleString('zh-CN')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table layout */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-auto" />
                  <col className="w-[72px]" />
                  <col className="w-[72px]" />
                  <col className="w-[72px]" />
                  <col className="w-[72px]" />
                  <col className="w-[120px]" />
                  <col className="w-[160px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-stone-500">
                    <th className="py-2 pr-3 text-left font-medium">考试</th>
                    <th className="py-2 text-center font-medium">工序</th>
                    <th className="py-2 text-center font-medium">等级</th>
                    <th className="py-2 text-center font-medium">线上分</th>
                    <th className="py-2 text-center font-medium">实操分</th>
                    <th className="py-2 text-center font-medium">综合分</th>
                    <th className="py-2 text-center font-medium">交卷时间</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.sessionId || `missed-${i}`} className={`border-b ${r.missed ? 'border-red-50 bg-red-50/30' : 'border-stone-50'}`}>
                      <td className="py-2.5 pr-3 font-medium text-stone-800 truncate">
                        {r.examTitle}
                        {r.missed && (
                          <span className="ml-2 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">未参加</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-stone-600">{r.process ?? '-'}</td>
                      <td className="py-2.5 text-center text-stone-600">{r.level ?? '-'}</td>
                      <td className="py-2.5 text-center">
                        {r.missed
                          ? <span className="text-red-400">0</span>
                          : r.isResultQueryOpen
                            ? r.autoScore
                            : <span className="text-stone-300">—</span>
                        }
                      </td>
                      <td className="py-2.5 text-center">
                        {r.missed
                          ? <span className="text-red-400">0</span>
                          : r.isResultQueryOpen
                            ? (r.practicalScore ?? <span className="text-stone-300">—</span>)
                            : <span className="text-stone-300">—</span>
                        }
                      </td>
                      <td className="py-2.5 text-center font-semibold">
                        {r.missed ? (
                          <span className="text-red-500">0</span>
                        ) : r.isResultQueryOpen ? (
                          r.combinedScore != null ? (
                            r.combinedScore
                          ) : (
                            <span className="text-stone-300">—</span>
                          )
                        ) : (
                          <span className="text-xs text-amber-600 whitespace-nowrap">
                            {r.resultQueryOpenAt
                              ? `${new Date(r.resultQueryOpenAt).toLocaleDateString('zh-CN')} 公布`
                              : '待公布'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-xs text-stone-400 whitespace-nowrap">
                        {r.missed
                          ? <span className="text-red-400">未参加</span>
                          : r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '-'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
