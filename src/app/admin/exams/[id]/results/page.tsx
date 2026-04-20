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
import { ArrowLeft, Download } from 'lucide-react';
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
}

interface ResultRow {
  rank: number;
  sessionId: string;
  employeeName: string;
  department: string;
  totalScore: number | null;
  autoScore: number;
  manualScore: number | null;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={summary?.examTitle ? `成绩 - ${summary.examTitle}` : '考试成绩'}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportOfflineScores}
            />
            <Button
              variant="outline"
              onClick={() => {
                window.open(`/api/admin/exams/${examId}/offline-scores?action=template`, '_blank');
              }}
            >
              <Download className="h-4 w-4" />
              下载导入模板
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              loading={importing}
            >
              导入线下成绩
            </Button>
            <Button variant="secondary" onClick={handleExport} loading={exporting}>
              导出Excel
            </Button>
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
                  {row.status === 'GRADING' ? (
                    <Badge variant="warning">待阅卷</Badge>
                  ) : row.isPassed != null ? (
                    <Badge variant={row.isPassed ? 'success' : 'danger'}>
                      {row.isPassed ? '通过' : '未通过'}
                    </Badge>
                  ) : (
                    <Badge variant="default">待定</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-stone-500">{row.department}</p>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-stone-500">
                    总分:{' '}
                    <span className="font-semibold text-stone-800">
                      {row.totalScore != null ? row.totalScore : (row.status === 'GRADING' ? '待阅卷' : '--')}
                    </span>
                    <span className="text-stone-400 ml-1.5">
                      (客观 {row.autoScore} / 主观 {row.manualScore != null ? row.manualScore : '--'})
                    </span>
                  </span>
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
                  <TableHead>总分</TableHead>
                  <TableHead>客观题</TableHead>
                  <TableHead>主观题</TableHead>
                  <TableHead>是否通过</TableHead>
                  <TableHead>异常行为</TableHead>
                  <TableHead>用时</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.sessionId}>
                    <TableCell className="font-medium">{row.rank}</TableCell>
                    <TableCell className="font-medium">{row.employeeName}</TableCell>
                    <TableCell>{row.department}</TableCell>
                    <TableCell className="font-semibold">
                      {row.totalScore != null ? row.totalScore : (row.status === 'GRADING' ? '待阅卷' : '--')}
                    </TableCell>
                    <TableCell>{row.autoScore}</TableCell>
                    <TableCell>{row.manualScore != null ? row.manualScore : '--'}</TableCell>
                    <TableCell>
                      {row.status === 'GRADING' ? (
                        <Badge variant="warning">待阅卷</Badge>
                      ) : row.isPassed != null ? (
                        <Badge variant={row.isPassed ? 'success' : 'danger'}>
                          {row.isPassed ? '通过' : '未通过'}
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
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
