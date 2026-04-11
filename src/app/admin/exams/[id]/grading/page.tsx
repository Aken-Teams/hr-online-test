'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingAnswer {
  answerId: string;
  sessionId: string;
  employeeName: string;
  department: string;
  questionContent: string;
  questionType: string;
  maxPoints: number;
  answerContent: string | null;
  earnedPoints: number | null;
  graderComment: string | null;
  isGraded: boolean;
  referenceAnswer?: string | null;
}

interface GradingData {
  examTitle: string;
  totalPending: number;
  gradedCount: number;
  answers: PendingAnswer[];
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ExamGradingPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;
  const { toast } = useToast();

  const [data, setData] = useState<GradingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gradeValues, setGradeValues] = useState<Record<string, { score: string; comment: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchGrading = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/grading?examId=${examId}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      setData(json.data);
    } catch {
      toast('加载阅卷数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [examId, toast]);

  useEffect(() => {
    fetchGrading();
  }, [fetchGrading]);

  function toggleExpand(answerId: string) {
    setExpandedId((prev) => (prev === answerId ? null : answerId));
  }

  function updateGrade(answerId: string, field: 'score' | 'comment', value: string) {
    setGradeValues((prev) => ({
      ...prev,
      [answerId]: {
        score: prev[answerId]?.score ?? '',
        comment: prev[answerId]?.comment ?? '',
        [field]: value,
      },
    }));
  }

  async function handleSaveGrade(answer: PendingAnswer) {
    const values = gradeValues[answer.answerId];
    const score = Number(values?.score ?? 0);

    if (isNaN(score) || score < 0 || score > answer.maxPoints) {
      toast(`分数必须在 0 到 ${answer.maxPoints} 之间`, 'warning');
      return;
    }

    setSavingId(answer.answerId);
    try {
      const res = await fetch('/api/admin/grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answerId: answer.answerId,
          earnedPoints: score,
          comment: values?.comment?.trim() || null,
        }),
      });

      if (!res.ok) throw new Error('保存失败');
      toast('评分已保存', 'success');
      fetchGrading();
    } catch {
      toast('保存评分失败', 'error');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="阅卷" />
        <LoadingSpinner />
      </div>
    );
  }

  const total = (data?.totalPending ?? 0) + (data?.gradedCount ?? 0);
  const graded = data?.gradedCount ?? 0;
  const progressPct = total > 0 ? Math.round((graded / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.examTitle ? `阅卷 - ${data.examTitle}` : '阅卷'}
        actions={
          <Button variant="ghost" onClick={() => router.push('/admin/exams')}>
            返回列表
          </Button>
        }
      />

      {/* Progress */}
      <Card>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">阅卷进度</span>
            <span className="font-medium text-stone-800">
              {graded} / {total} 已完成
            </span>
          </div>
          <Progress value={progressPct} color={progressPct === 100 ? 'green' : 'teal'} />
        </div>
      </Card>

      {/* Answers list */}
      {data?.answers?.length === 0 ? (
        <EmptyState
          title="暂无主观题"
          description="该考试尚未有考生提交主观题作答"
        />
      ) : (
        <div className="space-y-3">
          {data?.answers?.map((answer) => {
            const isExpanded = expandedId === answer.answerId;
            const values = gradeValues[answer.answerId];
            const isSaving = savingId === answer.answerId;

            return (
              <div
                key={answer.answerId}
                className={`rounded-xl border shadow-sm ${
                  answer.isGraded
                    ? 'border-green-200 bg-green-50/30'
                    : 'border-stone-200 bg-white'
                }`}
              >
                {/* Header row */}
                <button
                  type="button"
                  onClick={() => toggleExpand(answer.answerId)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-stone-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={answer.isGraded ? 'success' : 'warning'}>
                      {answer.isGraded ? '已评分' : '待评分'}
                    </Badge>
                    <span className="font-medium text-stone-800 truncate">
                      {answer.employeeName}
                    </span>
                    <span className="text-sm text-stone-500">{answer.department}</span>
                    {answer.isGraded && (
                      <span className="text-sm font-medium text-green-700">
                        {answer.earnedPoints}/{answer.maxPoints} 分
                      </span>
                    )}
                  </div>
                  <svg
                    className={`h-5 w-5 text-stone-400 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-stone-100 px-6 py-4 space-y-4">
                    {/* Question */}
                    <div>
                      <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">题目</p>
                      <p className="text-sm text-stone-700 whitespace-pre-wrap">
                        {answer.questionContent}
                      </p>
                    </div>

                    {/* Reference answer */}
                    {answer.referenceAnswer && (
                      <div>
                        <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">参考答案</p>
                        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 whitespace-pre-wrap">
                          {answer.referenceAnswer}
                        </div>
                      </div>
                    )}

                    {/* Student answer */}
                    <div>
                      <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">考生作答</p>
                      <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 whitespace-pre-wrap">
                        {answer.answerContent || '（未作答）'}
                      </div>
                    </div>

                    {/* Grading form or graded result */}
                    {answer.isGraded ? (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="text-xs text-green-600 font-medium">得分</p>
                            <p className="text-lg font-bold text-green-800">
                              {answer.earnedPoints} / {answer.maxPoints}
                            </p>
                          </div>
                          {answer.graderComment && (
                            <div className="flex-1 border-l border-green-200 pl-4">
                              <p className="text-xs text-green-600 font-medium">评语</p>
                              <p className="text-sm text-green-800">{answer.graderComment}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end gap-4">
                        <div className="w-32">
                          <Input
                            label={`得分（满分 ${answer.maxPoints}）`}
                            type="number"
                            value={values?.score ?? ''}
                            onChange={(e) => updateGrade(answer.answerId, 'score', e.target.value)}
                            min={0}
                            max={answer.maxPoints}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-stone-700 mb-1.5">评语</label>
                          <textarea
                            className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
                            rows={2}
                            value={values?.comment ?? ''}
                            onChange={(e) => updateGrade(answer.answerId, 'comment', e.target.value)}
                            placeholder="评语（可选）"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSaveGrade(answer)}
                          loading={isSaving}
                          className="shrink-0"
                        >
                          保存
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
