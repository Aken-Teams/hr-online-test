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

interface QuestionDetail {
  questionId: string;
  questionType: string;
  questionContent: string;
  yourAnswer: string | null;
  correctAnswer: string | null;
  earnedPoints: number;
  maxPoints: number;
  isCorrect: boolean | null;
  options?: { label: string; content: string }[];
}

interface SessionDetail {
  employee: { name: string; employeeNo: string; department: string };
  result: {
    totalScore: number;
    autoScore: number;
    manualScore: number | null;
    maxPossibleScore: number;
    correctCount: number;
    totalQuestions: number;
    timeTakenSeconds: number;
    isPassed: boolean;
    gradeLabel: string;
    categoryScores: Record<string, { earnedPoints: number; maxPoints: number; count: number; correctCount: number }>;
    isFullyGraded: boolean;
  } | null;
  passScore: number;
  unansweredCount: number;
  pendingGradingCount: number;
  correctAnswers: QuestionDetail[];
  wrongAnswers: QuestionDetail[];
}

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: '单选题',
  MULTI_CHOICE: '多选题',
  TRUE_FALSE: '判断题',
  SHORT_ANSWER: '简答题',
  FILL_BLANK: '填空题',
  CASE_ANALYSIS: '案例分析',
  PRACTICAL: '实操题',
};

// ---------------------------------------------------------------------------
// Detail panel component
// ---------------------------------------------------------------------------

function SessionDetailPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/results/${sessionId}`);
        if (!res.ok) throw new Error('加载失败');
        const json = await res.json();
        setDetail(json.data);
      } catch {
        setError('加载详细数据失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="border-t border-stone-100 bg-stone-50/50 px-6 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="border-t border-stone-100 bg-stone-50/50 px-6 py-6">
        <p className="text-sm text-red-600">{error || '数据加载失败'}</p>
      </div>
    );
  }

  const r = detail.result;
  const totalQ = r?.totalQuestions ?? 0;
  const correctPct = totalQ > 0 ? Math.round(((r?.correctCount ?? 0) / totalQ) * 100) : 0;

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  }

  return (
    <div className="border-t border-stone-100 bg-stone-50/50 px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-stone-800">
          {detail.employee.name}（{detail.employee.employeeNo}）详细成绩
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-stone-400 hover:text-stone-600"
        >
          收起
        </button>
      </div>

      {r && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs text-stone-500">总分</p>
              <p className="text-lg font-bold text-stone-800">
                {r.totalScore} / {r.maxPossibleScore}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs text-stone-500">正确率</p>
              <p className="text-lg font-bold text-stone-800">{correctPct}%</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs text-stone-500">用时</p>
              <p className="text-lg font-bold text-stone-800">
                {r.timeTakenSeconds > 0 ? formatTime(r.timeTakenSeconds) : '--'}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs text-stone-500">答题情况</p>
              <p className="text-lg font-bold text-stone-800">
                {r.correctCount}/{totalQ}
                {detail.unansweredCount > 0 && (
                  <span className="ml-1 text-xs font-normal text-stone-400">
                    （{detail.unansweredCount}题未答）
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Category breakdown */}
          {r.categoryScores && Object.keys(r.categoryScores).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-stone-500 uppercase tracking-wider">
                题型得分
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(r.categoryScores).map(([type, data]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2"
                  >
                    <span className="text-xs text-stone-600">
                      {TYPE_LABELS[type] ?? type}
                    </span>
                    <span className="text-sm font-semibold text-stone-800">
                      {data.earnedPoints}/{data.maxPoints}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Wrong answers */}
      {detail.wrongAnswers.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-stone-500 uppercase tracking-wider">
            错题 / 未答题（{detail.wrongAnswers.length} 题）
          </p>
          <div className="space-y-2">
            {detail.wrongAnswers.map((q, idx) => (
              <div
                key={q.questionId}
                className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="default">{TYPE_LABELS[q.questionType] ?? q.questionType}</Badge>
                      <span className="text-xs text-stone-400">
                        {q.earnedPoints}/{q.maxPoints} 分
                      </span>
                    </div>
                    <p className="text-stone-700 whitespace-pre-wrap">
                      {idx + 1}. {q.questionContent}
                    </p>
                  </div>
                </div>

                {/* Options for choice/TF questions */}
                {q.options && q.options.length > 0 && (
                  <div className="mt-2 space-y-0.5 pl-4">
                    {q.options.map((o) => {
                      const isCorrectOpt = q.correctAnswer?.includes(o.label);
                      const isChosen = q.yourAnswer?.includes(o.label);
                      return (
                        <div
                          key={o.label}
                          className={`text-xs py-0.5 ${
                            isCorrectOpt
                              ? 'text-green-700 font-medium'
                              : isChosen
                              ? 'text-red-600'
                              : 'text-stone-500'
                          }`}
                        >
                          {o.label}. {o.content}
                          {isCorrectOpt && ' ✓'}
                          {isChosen && !isCorrectOpt && ' ✗'}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Text answer comparison */}
                {!q.options?.length && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 pl-4">
                    <div>
                      <p className="text-xs text-stone-400 mb-0.5">考生作答</p>
                      <p className="text-xs text-stone-600 whitespace-pre-wrap rounded bg-stone-50 px-2 py-1">
                        {q.yourAnswer || '（未作答）'}
                      </p>
                    </div>
                    {q.correctAnswer && (
                      <div>
                        <p className="text-xs text-stone-400 mb-0.5">参考答案</p>
                        <p className="text-xs text-green-700 whitespace-pre-wrap rounded bg-green-50 px-2 py-1">
                          {q.correctAnswer}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correct answers summary */}
      {detail.correctAnswers.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-stone-500 uppercase tracking-wider">
            正确题（{detail.correctAnswers.length} 题）
          </p>
          <p className="text-xs text-stone-400">
            {detail.correctAnswers.map((q, i) => (
              <span key={q.questionId}>
                {i > 0 && '、'}
                {TYPE_LABELS[q.questionType] ?? q.questionType} +{q.earnedPoints}分
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
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
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => {
                const isExpanded = expandedSessionId === row.sessionId;
                return (
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
                    <TableCell>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSessionId(isExpanded ? null : row.sessionId)
                        }
                        className={`text-sm font-medium ${
                          isExpanded
                            ? 'text-stone-500 hover:text-stone-700'
                            : 'text-teal-600 hover:text-teal-700'
                        }`}
                      >
                        {isExpanded ? '收起' : '详细'}
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Expanded detail panel (outside table, below) */}
          {expandedSessionId && (
            <SessionDetailPanel
              key={expandedSessionId}
              sessionId={expandedSessionId}
              onClose={() => setExpandedSessionId(null)}
            />
          )}
        </Card>
      )}
    </div>
  );
}
