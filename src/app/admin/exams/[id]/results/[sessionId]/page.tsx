'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface SessionDetailData {
  sessionId: string;
  examTitle: string;
  status: string;
  submittedAt: string | null;
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
    categoryScores: Record<
      string,
      { earnedPoints: number; maxPoints: number; count: number; correctCount: number }
    >;
    isFullyGraded: boolean;
  } | null;
  passScore: number;
  unansweredCount: number;
  pendingGradingCount: number;
  correctAnswers: QuestionDetail[];
  wrongAnswers: QuestionDetail[];
  allQuestions: QuestionDetail[];
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
// Helper
// ---------------------------------------------------------------------------

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s}秒`;
}

function ScoreRing({ score, max, size = 120 }: { score: number; max: number; size?: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 60 ? '#0d9488' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-stone-800">{score}</span>
        <span className="text-xs text-stone-400">/ {max}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------

function QuestionCard({ q, index }: { q: QuestionDetail; index: number }) {
  const isChoice = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'].includes(q.questionType);
  const answered = q.yourAnswer != null && q.yourAnswer.trim() !== '';

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-800">第 {index + 1} 题</span>
          <Badge variant="default">{TYPE_LABELS[q.questionType] ?? q.questionType}</Badge>
          {q.isCorrect === true && (
            <Badge variant="success">正确</Badge>
          )}
          {q.isCorrect === false && (
            <Badge variant="danger">{answered ? '错误' : '未作答'}</Badge>
          )}
          {q.isCorrect == null && (
            <Badge variant="warning">待评分</Badge>
          )}
        </div>
        <span className="text-sm font-semibold text-stone-600">
          {q.earnedPoints} / {q.maxPoints} 分
        </span>
      </div>

      {/* Question content */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
          {q.questionContent}
        </p>

        {/* Choice options */}
        {isChoice && q.options && q.options.length > 0 && (
          <div className="space-y-1.5">
            {q.options.map((o) => {
              const isCorrectOpt = q.correctAnswer?.includes(o.label);
              const isChosen = q.yourAnswer?.includes(o.label);
              let bg = 'bg-white';
              let border = 'border-stone-200';
              let text = 'text-stone-600';

              if (isCorrectOpt && isChosen) {
                bg = 'bg-green-50';
                border = 'border-green-300';
                text = 'text-green-800';
              } else if (isCorrectOpt) {
                bg = 'bg-green-50';
                border = 'border-green-200';
                text = 'text-green-700';
              } else if (isChosen) {
                bg = 'bg-red-50';
                border = 'border-red-200';
                text = 'text-red-700';
              }

              return (
                <div
                  key={o.label}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${bg} ${border} ${text}`}
                >
                  <span className="font-medium">{o.label}.</span>
                  <span className="flex-1">{o.content}</span>
                  {isCorrectOpt && (
                    <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  {isChosen && !isCorrectOpt && (
                    <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Text answer comparison */}
        {!isChoice && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500">考生作答</p>
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 whitespace-pre-wrap min-h-[60px]">
                {q.yourAnswer || '（未作答）'}
              </div>
            </div>
            {q.correctAnswer && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-stone-500">参考答案</p>
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 whitespace-pre-wrap min-h-[60px]">
                  {q.correctAnswer}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;
  const sessionId = params.sessionId as string;
  const { toast } = useToast();

  const [data, setData] = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/results/${sessionId}`);
        if (!res.ok) throw new Error('加载失败');
        const json = await res.json();
        setData(json.data);
      } catch {
        toast('加载详细数据失败', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, toast]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="考生成绩详情" />
        <LoadingSpinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="考生成绩详情" />
        <p className="text-center text-stone-500">数据加载失败</p>
      </div>
    );
  }

  const r = data.result;
  const totalQ = r?.totalQuestions ?? 0;
  const correctPct = totalQ > 0 ? Math.round(((r?.correctCount ?? 0) / totalQ) * 100) : 0;
  const wrongCount = data.wrongAnswers.length;
  const correctCount = data.correctAnswers.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.employee.name} 的考试成绩`}
        description={`${data.examTitle} · ${data.employee.department} · 工号 ${data.employee.employeeNo}`}
        actions={
          <Button
            variant="outline"
            onClick={() => router.push(`/admin/exams/${examId}/results`)}
          >
            <ArrowLeft className="h-4 w-4" />
            返回成绩列表
          </Button>
        }
      />

      {/* Score overview */}
      {r && (
        <Card>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-2">
              <ScoreRing score={r.totalScore} max={r.maxPossibleScore} />
              <Badge variant={r.isPassed ? 'success' : 'danger'}>
                {r.isPassed ? '通过' : '未通过'}
              </Badge>
              {r.gradeLabel && (
                <span className="text-xs text-stone-400">{r.gradeLabel}</span>
              )}
            </div>

            {/* Stats */}
            <div className="flex-1 w-full">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-center">
                  <p className="text-xs text-stone-500">正确率</p>
                  <p className="text-xl font-bold text-stone-800">{correctPct}%</p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-center">
                  <p className="text-xs text-stone-500">正确 / 总题数</p>
                  <p className="text-xl font-bold text-stone-800">
                    {r.correctCount} / {totalQ}
                  </p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-center">
                  <p className="text-xs text-stone-500">用时</p>
                  <p className="text-xl font-bold text-stone-800">
                    {r.timeTakenSeconds > 0 ? formatTime(r.timeTakenSeconds) : '--'}
                  </p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-center">
                  <p className="text-xs text-stone-500">未答题</p>
                  <p className="text-xl font-bold text-stone-800">{data.unansweredCount}</p>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                  <p className="text-xs text-stone-500">客观题得分</p>
                  <p className="text-lg font-semibold text-stone-800">{r.autoScore}</p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                  <p className="text-xs text-stone-500">主观题得分</p>
                  <p className="text-lg font-semibold text-stone-800">
                    {r.manualScore != null ? r.manualScore : '--'}
                  </p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                  <p className="text-xs text-stone-500">及格线</p>
                  <p className="text-lg font-semibold text-stone-800">{data.passScore}</p>
                </div>
              </div>

              {data.pendingGradingCount > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
                  <p className="text-sm text-amber-700">
                    尚有 {data.pendingGradingCount} 道主观题待人工评分
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Category breakdown */}
      {r?.categoryScores && Object.keys(r.categoryScores).length > 0 && (
        <Card title="题型得分明细">
          <div className="space-y-3">
            {Object.entries(r.categoryScores).map(([type, cat]) => {
              const pct = cat.maxPoints > 0 ? Math.round((cat.earnedPoints / cat.maxPoints) * 100) : 0;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-stone-700">{TYPE_LABELS[type] ?? type}</span>
                    <span className="text-sm font-medium text-stone-800">
                      {cat.earnedPoints} / {cat.maxPoints} 分
                      <span className="ml-2 text-xs text-stone-400">
                        （{cat.correctCount}/{cat.count} 题对）
                      </span>
                    </span>
                  </div>
                  <Progress value={pct} color={pct >= 60 ? 'teal' : 'red'} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Wrong answers */}
      {wrongCount > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-stone-800">
            错题 / 未答题（{wrongCount} 题）
          </h2>
          <div className="space-y-3">
            {data.wrongAnswers.map((q, idx) => (
              <QuestionCard key={q.questionId} q={q} index={idx} />
            ))}
          </div>
        </div>
      )}

      {/* Correct answers */}
      {correctCount > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-stone-800">
            正确题（{correctCount} 题）
          </h2>
          <div className="space-y-3">
            {data.correctAnswers.map((q, idx) => (
              <QuestionCard key={q.questionId} q={q} index={idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
