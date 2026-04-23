'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ArrowLeft, Download, Upload, ChevronDown } from 'lucide-react';
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

interface ResultSummary {
  examTitle: string;
  totalParticipants: number;
  averageScore: number;
  passRate: number;
  highestScore: number;
  compositePassScore?: number;
  practicalWeight?: number;
}

interface ResultRow {
  rank: number;
  sessionId: string;
  employeeName: string;
  department: string;
  totalScore: number | null;
  autoScore: number;
  manualScore: number | null;
  practicalScore: number | null;
  combinedScore: number | null;
  isPassed: boolean | null;
  timeTakenSeconds: number;
  status?: string;
  tabSwitchCount?: number;
  isAutoSubmitted?: boolean;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ExamResultsPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;
  const { toast } = useToast();

  const [summary, setSummary] = useState<ResultSummary | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports/analytics?examId=${examId}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      setSummary(json.data?.summary ?? null);
      setResults(json.data?.results ?? []);
    } catch {
      toast('加载成绩数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [examId, toast]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    }
    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActions]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/reports/export?examId=${examId}`);
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `考试成绩_${examId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('导出成功', 'success');
    } catch {
      toast('导出失败', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleImportOfflineScores(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/admin/exams/${examId}/offline-scores`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || '导入失败');
      }

      const { updated, skipped, errors } = json.data;
      let msg = `成功导入 ${updated} 条`;
      if (skipped > 0) msg += `，跳过 ${skipped} 条`;
      if (errors?.length > 0) msg += `\n${errors.join('\n')}`;
      toast(msg, updated > 0 ? 'success' : 'warning');

      // Refresh results
      fetchResults();
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="考试成绩" />
        <LoadingSpinner />
      </div>
    );
  }

  // Check if any result has practical/combined scores
  const hasCombined = results.some((r) => r.combinedScore != null);
  // Whether this exam uses combined scoring (practical weight > 0)
  const usesCombinedScoring = (summary?.practicalWeight ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={summary?.examTitle ? `成绩 - ${summary.examTitle}` : '考试成绩'}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportOfflineScores}
            />
            {/* Actions dropdown */}
            <div ref={actionsRef} className="relative">
              <Button
                onClick={() => setShowActions(!showActions)}
              >
                <Download className="h-4 w-4" />
                导入导出
                <ChevronDown className="h-4 w-4" />
              </Button>
              {showActions && (
                <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    onClick={() => { handleExport(); setShowActions(false); }}
                  >
                    <Download className="h-4 w-4" />
                    导出 Excel
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    onClick={() => { fileInputRef.current?.click(); setShowActions(false); }}
                  >
                    <Upload className="h-4 w-4" />
                    导入线下成绩
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    onClick={() => {
                      window.open(`/api/admin/exams/${examId}/offline-scores?action=template`, '_blank');
                      setShowActions(false);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    下载导入模板
                  </button>
                </div>
              )}
            </div>
            <Button variant="outline" onClick={() => router.push('/admin/exams')}>
              <ArrowLeft className="h-4 w-4" />
              返回列表
            </Button>
          </div>
        }
      />

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
            <p className="text-xs font-medium text-stone-500 sm:text-sm">参考人数</p>
            <p className="mt-0.5 text-xl font-bold text-stone-800 sm:mt-1 sm:text-2xl">{summary.totalParticipants}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
            <p className="text-xs font-medium text-stone-500 sm:text-sm">平均分</p>
            <p className="mt-0.5 text-xl font-bold text-stone-800 sm:mt-1 sm:text-2xl">
              {summary.averageScore?.toFixed(1) ?? '--'}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
            <p className="text-xs font-medium text-stone-500 sm:text-sm">通过率</p>
            <p className="mt-0.5 text-xl font-bold text-green-600 sm:mt-1 sm:text-2xl">
              {summary.passRate != null ? `${summary.passRate.toFixed(1)}%` : '--'}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
            <p className="text-xs font-medium text-stone-500 sm:text-sm">最高分</p>
            <p className="mt-0.5 text-xl font-bold text-teal-600 sm:mt-1 sm:text-2xl">
              {summary.highestScore ?? '--'}
            </p>
          </div>
        </div>
      )}

      {/* Results table */}
      {results.length === 0 ? (
        <EmptyState title="暂无成绩数据" description="该考试尚未有考生提交" />
      ) : (
        <Card>
          {/* Mobile: card list */}
          <div className="space-y-3 md:hidden">
            {results.map((row) => (
              <div
                key={row.sessionId}
                className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600">
                      {row.rank}
                    </span>
                    <span className="text-sm font-medium text-stone-800">{row.employeeName}</span>
                  </div>
                  {(() => {
                    const cp = row.combinedScore != null
                      ? row.combinedScore >= (summary?.compositePassScore ?? 90)
                      : null;
                    const dp = usesCombinedScoring ? cp : row.isPassed;
                    return dp != null ? (
                      <Badge variant={dp ? 'success' : 'danger'}>
                        {dp ? '合格' : '不合格'}
                      </Badge>
                    ) : (
                      <Badge variant="default">待定</Badge>
                    );
                  })()}
                </div>
                <p className="mt-1 text-xs text-stone-500">{row.department}</p>
                <div className="mt-1.5 flex items-center gap-3 text-xs">
                  <span className="text-stone-500">
                    {hasCombined ? '线上' : '得分'}:{' '}
                    <span className="font-semibold text-stone-800">
                      {row.totalScore != null ? row.totalScore : row.autoScore ?? '--'}
                    </span>
                  </span>
                  {hasCombined && (
                    <>
                      <span className="text-stone-500">
                        实操: <span className="font-semibold text-stone-800">{row.practicalScore ?? '--'}</span>
                      </span>
                      <span className="text-stone-500">
                        综合: <span className="font-bold text-teal-700">{row.combinedScore ?? '--'}</span>
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-stone-400">
                  <div className="flex flex-wrap gap-1">
                    {(row.tabSwitchCount ?? 0) > 0 && (
                      <Badge variant="danger">切屏{row.tabSwitchCount}次</Badge>
                    )}
                    {row.isAutoSubmitted && (
                      <Badge variant="warning">超时提交</Badge>
                    )}
                    {(row.tabSwitchCount ?? 0) === 0 && !row.isAutoSubmitted && (
                      <span>正常</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span>{row.timeTakenSeconds > 0 ? formatDuration(row.timeTakenSeconds) : '--'}</span>
                    <Link
                      href={`/admin/exams/${examId}/results/${row.sessionId}`}
                      className="font-medium text-teal-600 hover:text-teal-700"
                    >
                      详细
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>排名</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>{hasCombined ? '线上分' : '得分'}</TableHead>
                  {hasCombined && <TableHead>实操分</TableHead>}
                  {hasCombined && <TableHead>综合分</TableHead>}
                  <TableHead>是否通过</TableHead>
                  <TableHead>异常行为</TableHead>
                  <TableHead>用时</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => {
                  const compositePass = row.combinedScore != null
                    ? row.combinedScore >= (summary?.compositePassScore ?? 90)
                    : null;
                  // If exam uses combined scoring, only show pass/fail when combinedScore exists
                  const displayPassed = usesCombinedScoring
                    ? compositePass
                    : row.isPassed;

                  return (
                    <TableRow key={row.sessionId}>
                      <TableCell className="font-medium">{row.rank}</TableCell>
                      <TableCell className="font-medium">{row.employeeName}</TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell className="font-semibold">
                        {row.totalScore != null ? row.totalScore : row.autoScore ?? '--'}
                      </TableCell>
                      {hasCombined && (
                        <TableCell className="font-semibold">
                          {row.practicalScore ?? <span className="text-stone-300">—</span>}
                        </TableCell>
                      )}
                      {hasCombined && (
                        <TableCell className="font-bold text-teal-700">
                          {row.combinedScore ?? <span className="text-stone-300">—</span>}
                        </TableCell>
                      )}
                      <TableCell>
                        {displayPassed != null ? (
                          <Badge variant={displayPassed ? 'success' : 'danger'}>
                            {displayPassed ? '合格' : '不合格'}
                          </Badge>
                        ) : (
                          <Badge variant="default">待定</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(row.tabSwitchCount ?? 0) > 0 && (
                            <Badge variant="danger">
                              切屏{row.tabSwitchCount}次
                            </Badge>
                          )}
                          {row.isAutoSubmitted && (
                            <Badge variant="warning">超时自动提交</Badge>
                          )}
                          {(row.tabSwitchCount ?? 0) === 0 && !row.isAutoSubmitted && (
                            <span className="text-sm text-stone-400">正常</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-stone-500">
                        {row.timeTakenSeconds > 0 ? formatDuration(row.timeTakenSeconds) : '--'}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/exams/${examId}/results/${row.sessionId}`}
                          className="text-sm font-medium text-teal-600 hover:text-teal-700"
                        >
                          详细
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
