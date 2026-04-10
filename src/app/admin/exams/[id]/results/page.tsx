'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
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
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleExport} loading={exporting}>
              导出Excel
            </Button>
            <Button variant="ghost" onClick={() => router.push('/admin/exams')}>
              返回列表
            </Button>
          </div>
        }
      />

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-medium text-stone-500">参考人数</p>
            <p className="mt-1 text-2xl font-bold text-stone-800">{summary.totalParticipants}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-medium text-stone-500">平均分</p>
            <p className="mt-1 text-2xl font-bold text-stone-800">
              {summary.averageScore?.toFixed(1) ?? '--'}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-medium text-stone-500">通过率</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {summary.passRate != null ? `${summary.passRate.toFixed(1)}%` : '--'}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-medium text-stone-500">最高分</p>
            <p className="mt-1 text-2xl font-bold text-teal-600">
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
                <TableHead>用时</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => (
                <TableRow key={row.sessionId}>
                  <TableCell className="font-medium">{row.rank}</TableCell>
                  <TableCell className="font-medium">{row.employeeName}</TableCell>
                  <TableCell>{row.department}</TableCell>
                  <TableCell className="font-semibold">
                    {row.totalScore != null ? row.totalScore : '--'}
                  </TableCell>
                  <TableCell>{row.autoScore}</TableCell>
                  <TableCell>{row.manualScore != null ? row.manualScore : '--'}</TableCell>
                  <TableCell>
                    {row.isPassed != null ? (
                      <Badge variant={row.isPassed ? 'success' : 'danger'}>
                        {row.isPassed ? '通过' : '未通过'}
                      </Badge>
                    ) : (
                      <Badge variant="default">待定</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-stone-500">
                    {row.timeTakenSeconds > 0 ? formatDuration(row.timeTakenSeconds) : '--'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
