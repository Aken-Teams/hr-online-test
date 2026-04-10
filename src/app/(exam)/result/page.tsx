'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';
import type {
  ApiResponse,
  ExamResultData,
  CategoryScore,
} from '@/types/exam';

interface WrongAnswerFromAPI {
  questionId: string;
  questionType: string;
  questionContent: string;
  yourAnswer: string | null;
  correctAnswer: string | null;
  earnedPoints: number;
  maxPoints: number;
  options?: { label: string; content: string }[];
}

interface ResultAPIResponse {
  sessionId: string;
  examTitle: string;
  status: string;
  submittedAt: string | null;
  isPending: boolean;
  message?: string;
  result: ExamResultData | null;
  wrongAnswers?: WrongAnswerFromAPI[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUESTION_TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: '单选题',
  MULTI_CHOICE: '多选题',
  TRUE_FALSE: '判断题',
  SHORT_ANSWER: '简答题',
  FILL_BLANK: '填空题',
  CASE_ANALYSIS: '案例分析题',
  PRACTICAL: '实操题',
};

// ---------------------------------------------------------------------------
// Circular progress ring (CSS only)
// ---------------------------------------------------------------------------

function ScoreRing({
  score,
  maxScore,
  isPassed,
}: {
  score: number;
  maxScore: number;
  isPassed: boolean;
}) {
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  // SVG circle parameters
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const strokeColor = isPassed ? '#22c55e' : '#ef4444';
  const bgStrokeColor = '#e5e7eb';

  return (
    <div className="relative flex flex-col items-center">
      <svg width="152" height="152" className="-rotate-90">
        {/* Background circle */}
        <circle
          cx="76"
          cy="76"
          r={radius}
          fill="none"
          stroke={bgStrokeColor}
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx="76"
          cy="76"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      {/* Score text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900">{score}</span>
        <span className="text-sm text-gray-500">/ {maxScore}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category breakdown bar
// ---------------------------------------------------------------------------

function CategoryBar({
  label,
  earned,
  max,
  correct,
  total,
}: {
  label: string;
  earned: number;
  max: number;
  correct: number;
  total: number;
}) {
  const percentage = max > 0 ? Math.round((earned / max) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {correct}/{total} 题 ({earned}/{max} 分)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            percentage >= 60 ? 'bg-green-500' : 'bg-red-400',
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrong answer item
// ---------------------------------------------------------------------------

function WrongAnswerItem({
  index,
  questionContent,
  questionType,
  yourAnswer,
  correctAnswer,
}: {
  index: number;
  questionContent: string;
  questionType: string;
  yourAnswer: string;
  correctAnswer: string;
}) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">
          第 {index} 题
        </span>
        <Badge variant="default">
          {QUESTION_TYPE_LABELS[questionType] || questionType}
        </Badge>
      </div>
      <p className="mb-3 text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
        {questionContent}
      </p>
      <div className="space-y-1.5 text-sm">
        <p className="text-red-700">
          <span className="font-medium">你的答案: </span>
          {yourAnswer || '（未作答）'}
        </p>
        <p className="text-green-700">
          <span className="font-medium">正确答案: </span>
          {correctAnswer}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result page
// ---------------------------------------------------------------------------

export default function ResultPage() {
  const router = useRouter();

  const [result, setResult] = useState<ExamResultData | null>(null);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswerFromAPI[]>([]);
  const [examTitle, setExamTitle] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ---- Fetch result --------------------------------------------------------

  useEffect(() => {
    const sessionId = localStorage.getItem('exam-result-session');

    if (!sessionId) {
      setError('未找到考试记录');
      setLoading(false);
      return;
    }

    async function fetchResult() {
      try {
        const res = await fetch(`/api/exam/${sessionId}/result`);
        const data: ApiResponse<ResultAPIResponse> = await res.json();

        if (!res.ok || !data.success || !data.data) {
          setError(data.error || '获取成绩失败');
          return;
        }

        const resp = data.data;
        setExamTitle(resp.examTitle);

        if (resp.isPending) {
          setIsPending(true);
          setPendingMessage(resp.message || '考试结果正在批阅中，请等待。');
          return;
        }

        setResult(resp.result);
        setWrongAnswers(resp.wrongAnswers || []);
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        setLoading(false);
      }
    }

    fetchResult();
  }, []);

  // ---- Derived data --------------------------------------------------------

  const categoryScores: CategoryScore[] = useMemo(() => {
    if (!result?.categoryScores) return [];
    return Object.values(result.categoryScores);
  }, [result]);

  // Format time taken
  const timeTaken = useMemo(() => {
    if (!result) return '';
    const totalSecs = result.timeTakenSeconds;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins} 分 ${secs} 秒`;
  }, [result]);

  // ---- Render --------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <Logo size="sm" className="mb-8" />
        <div className="w-full max-w-md rounded-xl border border-yellow-200 bg-white p-8 text-center shadow-sm">
          <svg className="mx-auto mb-4 h-12 w-12 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">{examTitle}</h2>
          <p className="mt-2 text-sm text-gray-500">{pendingMessage}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => router.push('/')}
          >
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <Logo size="sm" className="mb-8" />
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            {error || '暂无成绩'}
          </h2>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => router.push('/')}
          >
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  const displayScore = result.totalScore ?? result.autoScore;
  const isPassed = result.isPassed ?? (displayScore >= (result.maxPossibleScore * 0.6));

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <Logo size="sm" className="mx-auto mb-4 justify-center" />
          <h1 className="text-xl font-bold text-gray-900">考试成绩</h1>
        </div>

        {/* Score card */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center">
            {/* Score ring */}
            <ScoreRing
              score={displayScore}
              maxScore={result.maxPossibleScore}
              isPassed={isPassed}
            />

            {/* Pass/fail badge */}
            <div className="mt-4">
              <Badge variant={isPassed ? 'success' : 'danger'}>
                {isPassed ? '合格' : '不合格'}
              </Badge>
              {result.gradeLabel && (
                <Badge variant="info" className="ml-2">
                  等级: {result.gradeLabel}
                </Badge>
              )}
            </div>

            {/* Stats row */}
            <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {result.correctCount}
                </p>
                <p className="text-xs text-gray-500">答对题数</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {result.totalQuestions}
                </p>
                <p className="text-xs text-gray-500">总题数</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{timeTaken}</p>
                <p className="text-xs text-gray-500">用时</p>
              </div>
            </div>

            {/* Fully graded notice */}
            {!result.isFullyGraded && (
              <div className="mt-4 w-full rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-center">
                <p className="text-sm text-yellow-800">
                  部分主观题尚未阅卷，当前为客观题得分，总分以最终阅卷结果为准。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Category breakdown */}
        {categoryScores.length > 0 && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              分类得分
            </h2>
            <div className="space-y-4">
              {categoryScores.map((cat) => (
                <CategoryBar
                  key={cat.type}
                  label={QUESTION_TYPE_LABELS[cat.type] || cat.type}
                  earned={cat.earnedPoints}
                  max={cat.maxPoints}
                  correct={cat.correctCount}
                  total={cat.totalCount}
                />
              ))}
            </div>
          </div>
        )}

        {/* Wrong answer analysis */}
        {wrongAnswers.length > 0 && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              错题分析
            </h2>
            <div className="space-y-3">
              {wrongAnswers.map((wa, idx) => (
                <WrongAnswerItem
                  key={wa.questionId}
                  index={idx + 1}
                  questionContent={wa.questionContent}
                  questionType={wa.questionType}
                  yourAnswer={wa.yourAnswer || ''}
                  correctAnswer={wa.correctAnswer || '(见试卷)'}
                />
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {isPassed && (
            <Button onClick={() => router.push('/certificate')}>
              查看证书
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              localStorage.removeItem('exam-result-session');
              localStorage.removeItem('exam-questions-raw');
              localStorage.removeItem('exam-session-id');
              router.push('/');
            }}
          >
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
