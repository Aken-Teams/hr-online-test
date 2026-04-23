'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

interface QuestionFromAPI {
  questionId: string;
  questionType: string;
  questionContent: string;
  yourAnswer: string | null;
  correctAnswer: string | null;
  earnedPoints: number;
  maxPoints: number;
  isCorrect: boolean | null;
  options?: { label: string; content: string; imageUrl?: string | null }[];
}

interface RankingData {
  rank: number;
  totalParticipants: number;
  averageScore: number;
  highestScore: number;
}

interface ResultAPIResponse {
  sessionId: string;
  examTitle: string;
  status: string;
  submittedAt: string | null;
  passScore?: number;
  isPending: boolean;
  isPendingGrading?: boolean;
  isResultQueryOpen?: boolean;
  resultQueryOpenAt?: string | null;
  resultQueryCloseAt?: string | null;
  message?: string;
  result: ExamResultData | null;
  ranking?: RankingData;
  unansweredCount?: number;
  pendingGradingCount?: number;
  wrongAnswers?: QuestionFromAPI[];
  allQuestions?: QuestionFromAPI[];
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
// Circular progress ring
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
  // Responsive sizes: smaller on mobile
  const svgSize = 120; // mobile
  const smSvgSize = 136; // desktop
  const radius = 48;
  const smRadius = 54;
  const circumference = 2 * Math.PI * radius;
  const smCircumference = 2 * Math.PI * smRadius;
  const offset = circumference - (percentage / 100) * circumference;
  const smOffset = smCircumference - (percentage / 100) * smCircumference;

  const strokeColor = '#0d9488';
  const bgStrokeColor = '#e7e5e4';

  return (
    <div className="relative flex flex-col items-center">
      {/* Mobile ring */}
      <svg width={svgSize} height={svgSize} className="-rotate-90 sm:hidden">
        <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} fill="none" stroke={bgStrokeColor} strokeWidth="9" />
        <circle cx={svgSize / 2} cy={svgSize / 2} r={radius} fill="none" stroke={strokeColor} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
      </svg>
      {/* Desktop ring */}
      <svg width={smSvgSize} height={smSvgSize} className="-rotate-90 hidden sm:block">
        <circle cx={smSvgSize / 2} cy={smSvgSize / 2} r={smRadius} fill="none" stroke={bgStrokeColor} strokeWidth="10" />
        <circle cx={smSvgSize / 2} cy={smSvgSize / 2} r={smRadius} fill="none" stroke={strokeColor} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={smCircumference} strokeDashoffset={smOffset} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-stone-800 sm:text-3xl">{score}</span>
        <span className="text-[11px] text-stone-400 sm:text-xs">/ {maxScore} 分</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat cell
// ---------------------------------------------------------------------------

function StatCell({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('text-center', className)}>
      <p className="text-lg font-bold text-stone-800 sm:text-xl">{value}</p>
      <p className="mt-0.5 text-[11px] text-stone-400">{label}</p>
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="text-stone-500">
          {correct}/{total} 题 &middot; {earned}/{max} 分
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            percentage >= 60 ? 'bg-teal-500' : percentage > 0 ? 'bg-amber-400' : 'bg-stone-200',
          )}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question card (matches admin style)
// ---------------------------------------------------------------------------

function QuestionCard({ q, index }: { q: QuestionFromAPI; index: number }) {
  const isTrueFalse = q.questionType === 'TRUE_FALSE';
  const isChoice = ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(q.questionType);
  const answered = q.yourAnswer != null && q.yourAnswer.trim() !== '';

  /** Format choice answer labels */
  function formatChoiceAnswer(val: string | null): string {
    if (!val || val.trim() === '') return '（未作答）';
    return val;
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 sm:px-5 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
          <span className="text-[13px] font-medium text-stone-800 sm:text-sm">第 {index} 题</span>
          <Badge variant="default">{QUESTION_TYPE_LABELS[q.questionType] ?? q.questionType}</Badge>
          {q.isCorrect === true && <Badge variant="success">正确</Badge>}
          {q.isCorrect === false && <Badge variant="danger">{answered ? '错误' : '未作答'}</Badge>}
          {q.isCorrect == null && <Badge variant="warning">待评分</Badge>}
        </div>
        <span className="text-[13px] font-semibold text-stone-600 shrink-0 ml-2 sm:text-sm">
          {q.earnedPoints}/{q.maxPoints} 分
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2.5 sm:px-5 sm:py-4 sm:space-y-3">
        <p className="text-[13px] text-stone-700 whitespace-pre-wrap leading-relaxed sm:text-sm">
          {q.questionContent}
        </p>

        {/* TRUE_FALSE: option-style layout */}
        {isTrueFalse && (() => {
          const correctVal = q.correctAnswer?.toUpperCase();
          const yourVal = q.yourAnswer?.toUpperCase();
          const isCorrectTrue = correctVal === 'TRUE' || q.correctAnswer === '是' || q.correctAnswer === '对' || q.correctAnswer === '√';
          const choseTrue = yourVal === 'TRUE' || q.yourAnswer === '是' || q.yourAnswer === '对' || q.yourAnswer === '√';
          const choseFalse = yourVal === 'FALSE' || q.yourAnswer === '否' || q.yourAnswer === '错' || q.yourAnswer === '×';

          const tfOptions = [
            { label: '正确（对）', value: true, isCorrectOpt: isCorrectTrue, isChosen: choseTrue },
            { label: '错误（错）', value: false, isCorrectOpt: !isCorrectTrue, isChosen: choseFalse },
          ];

          return (
            <>
              <div className="flex flex-col gap-0.5 text-[13px] sm:flex-row sm:items-center sm:gap-4 sm:text-sm">
                <span className="text-stone-500">
                  你的选择：
                  <span className={`font-medium ${!answered ? 'text-stone-400' : q.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                    {!answered ? '（未作答）' : choseTrue ? '正确（对）' : '错误（错）'}
                  </span>
                </span>
                {q.correctAnswer && (
                  <span className="text-stone-500">
                    正确答案：
                    <span className="font-medium text-green-700">{isCorrectTrue ? '正确（对）' : '错误（错）'}</span>
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {tfOptions.map((o) => {
                  let bg = 'bg-white';
                  let border = 'border-stone-200';
                  let text = 'text-stone-600';

                  if (o.isCorrectOpt && o.isChosen) {
                    bg = 'bg-green-50'; border = 'border-green-300'; text = 'text-green-800';
                  } else if (o.isCorrectOpt) {
                    bg = 'bg-green-50'; border = 'border-green-200'; text = 'text-green-700';
                  } else if (o.isChosen) {
                    bg = 'bg-red-50'; border = 'border-red-200'; text = 'text-red-700';
                  }

                  return (
                    <div key={o.label} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] sm:px-3 sm:py-2 sm:text-sm ${bg} ${border} ${text}`}>
                      <span className="font-medium">{o.value ? '✓' : '✗'}</span>
                      <span className="flex-1">{o.label}</span>
                      {o.isCorrectOpt && (
                        <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                      {o.isChosen && !o.isCorrectOpt && (
                        <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* Choice options */}
        {isChoice && q.options && q.options.length > 0 && (
          <>
            <div className="flex flex-col gap-0.5 text-[13px] sm:flex-row sm:items-center sm:gap-4 sm:text-sm">
              <span className="text-stone-500">
                你的选择：
                <span className={`font-medium ${answered ? (q.isCorrect ? 'text-green-700' : 'text-red-600') : 'text-stone-400'}`}>
                  {formatChoiceAnswer(q.yourAnswer)}
                </span>
              </span>
              {q.correctAnswer && (
                <span className="text-stone-500">
                  正确答案：
                  <span className="font-medium text-green-700">{q.correctAnswer}</span>
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {q.options.map((o) => {
                const isCorrectOpt = q.correctAnswer?.includes(o.label);
                const isChosen = q.yourAnswer?.includes(o.label);
                let bg = 'bg-white';
                let border = 'border-stone-200';
                let text = 'text-stone-600';

                if (isCorrectOpt && isChosen) {
                  bg = 'bg-green-50'; border = 'border-green-300'; text = 'text-green-800';
                } else if (isCorrectOpt) {
                  bg = 'bg-green-50'; border = 'border-green-200'; text = 'text-green-700';
                } else if (isChosen) {
                  bg = 'bg-red-50'; border = 'border-red-200'; text = 'text-red-700';
                }

                return (
                  <div key={o.label} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] sm:items-center sm:px-3 sm:py-2 sm:text-sm ${bg} ${border} ${text}`}>
                    <span className="font-medium shrink-0 mt-px sm:mt-0">{o.label}.</span>
                    <span className="flex-1 break-all">{o.content}</span>
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
          </>
        )}

        {/* Text answer (SHORT_ANSWER, FILL_BLANK, etc.) */}
        {!isChoice && !isTrueFalse && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <div>
              <p className="mb-1 text-[11px] font-medium text-stone-500 sm:mb-1.5 sm:text-xs">你的作答</p>
              <div className={`rounded-lg border px-3 py-2.5 text-[13px] whitespace-pre-wrap min-h-[50px] sm:px-4 sm:py-3 sm:text-sm sm:min-h-[60px] ${
                !answered
                  ? 'border-stone-200 bg-stone-50 text-stone-400'
                  : q.isCorrect
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {q.yourAnswer || '（未作答）'}
              </div>
            </div>
            {q.correctAnswer && (
              <div>
                <p className="mb-1 text-[11px] font-medium text-stone-500 sm:mb-1.5 sm:text-xs">参考答案</p>
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-[13px] text-green-800 whitespace-pre-wrap min-h-[50px] sm:px-4 sm:py-3 sm:text-sm sm:min-h-[60px]">
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
// Result page
// ---------------------------------------------------------------------------

function ResultPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>}>
      <ResultPage />
    </Suspense>
  );
}

export default ResultPageWrapper;

function ResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [result, setResult] = useState<ExamResultData | null>(null);
  const [allQuestions, setAllQuestions] = useState<QuestionFromAPI[]>([]);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [examTitle, setExamTitle] = useState('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [passScore, setPassScore] = useState<number>(60);
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [pendingGradingCount, setPendingGradingCount] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [isResultQueryOpen, setIsResultQueryOpen] = useState(true);
  const [resultQueryOpenAt, setResultQueryOpenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ---- Fetch result --------------------------------------------------------

  useEffect(() => {
    async function loadResult(id: string) {
      const res = await fetch(`/api/exam/${id}/result`);
      const data: ApiResponse<ResultAPIResponse> = await res.json();

      if (!res.ok || !data.success || !data.data) {
        setError(data.error || '获取成绩失败');
        return;
      }

      const resp = data.data;
      setExamTitle(resp.examTitle);
      setSubmittedAt(resp.submittedAt);
      if (resp.passScore) setPassScore(resp.passScore);

      if (resp.isPending) {
        setIsPending(true);
        setPendingMessage(resp.message || '考试结果正在批阅中，请等待。');
        return;
      }

      setResult(resp.result);
      setRanking(resp.ranking ?? null);
      setUnansweredCount(resp.unansweredCount ?? 0);
      setPendingGradingCount(resp.pendingGradingCount ?? 0);
      setAllQuestions(resp.allQuestions || resp.wrongAnswers || []);
      setIsResultQueryOpen(resp.isResultQueryOpen ?? true);
      setResultQueryOpenAt(resp.resultQueryOpenAt ?? null);
    }

    async function fetchResult() {
      try {
        // 1) Try stored session ID first (set after manual submit)
        const storedSessionId = localStorage.getItem('exam-result-session');
        if (storedSessionId) {
          await loadResult(storedSessionId);
          return;
        }

        // 2) Try query params (from instructions page or my-exams navigation)
        const qSessionId = searchParams.get('sessionId');
        const qExamId = searchParams.get('examId');
        if (qSessionId) {
          await loadResult(qSessionId);
          return;
        }
        if (qExamId) {
          await loadResult(qExamId);
          return;
        }

        // 3) Last resort: resolve via available exam API
        const availRes = await fetch('/api/exam/available');
        const availData = await availRes.json();
        if (availRes.ok && availData.success && availData.data?.id) {
          await loadResult(availData.data.id);
          return;
        }

        setError('未找到考试记录');
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        setLoading(false);
      }
    }

    fetchResult();
  }, [searchParams]);

  // ---- Derived data --------------------------------------------------------

  const categoryScores: CategoryScore[] = useMemo(() => {
    if (!result?.categoryScores) return [];
    return Object.values(result.categoryScores);
  }, [result]);

  const timeTaken = useMemo(() => {
    if (!result) return '';
    const totalSecs = result.timeTakenSeconds;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins === 0) return `${secs}秒`;
    return `${mins}分${secs}秒`;
  }, [result]);

  const accuracyRate = useMemo(() => {
    if (!result || result.totalQuestions === 0) return '0';
    return Math.round((result.correctCount / result.totalQuestions) * 100).toString();
  }, [result]);

  // Group questions by type for tabs
  const questionsByType = useMemo(() => {
    const groups: Record<string, QuestionFromAPI[]> = {};
    for (const q of allQuestions) {
      if (!groups[q.questionType]) groups[q.questionType] = [];
      groups[q.questionType].push(q);
    }
    return groups;
  }, [allQuestions]);

  const typeOrder = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'FILL_BLANK', 'CASE_ANALYSIS', 'PRACTICAL'];
  const availableTypes = typeOrder.filter((t) => questionsByType[t]?.length);
  const displayQuestions = activeTab === 'ALL' ? allQuestions : (questionsByType[activeTab] ?? []);

  const formattedSubmitTime = useMemo(() => {
    if (!submittedAt) return '';
    const d = new Date(submittedAt);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [submittedAt]);

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
        <div className="w-full max-w-md rounded-2xl border border-yellow-200 bg-white p-8 text-center shadow-sm">
          <svg className="mx-auto mb-4 h-12 w-12 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-stone-800">{examTitle}</h2>
          <p className="mt-2 text-sm text-stone-500">{pendingMessage}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => router.push('/my-exams')}
          >
            返回我的考试
          </Button>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <Logo size="sm" className="mb-8" />
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">
            {error || '暂无成绩'}
          </h2>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => router.push('/my-exams')}
          >
            返回我的考试
          </Button>
        </div>
      </div>
    );
  }

  const displayScore = result.totalScore ?? result.autoScore ?? 0;
  const isPassed = result.isFullyGraded
    ? (result.isPassed ?? (displayScore >= passScore))
    : false; // Don't show "passed" until fully graded

  return (
    <div className="min-h-screen bg-stone-50 px-3 py-4 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-4 text-center sm:mb-6">
          <Logo size="sm" className="mx-auto mb-2 justify-center sm:mb-3" />
          <h1 className="text-base font-bold text-stone-800 sm:text-lg">{examTitle || '考试成绩报告'}</h1>
          {formattedSubmitTime && (
            <p className="mt-0.5 text-[11px] text-stone-400 sm:mt-1 sm:text-xs">交卷时间: {formattedSubmitTime}</p>
          )}
        </div>

        {/* ===== Section 1: Score Overview ===== */}
        <div className="mb-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:mb-4 sm:p-6">
          <div className="flex flex-col items-center">
            {/* Score ring — show combined score when available, otherwise online score */}
            {isResultQueryOpen && result.combinedScore != null ? (
              <>
                <ScoreRing
                  score={result.combinedScore}
                  maxScore={100}
                  isPassed={isPassed}
                />
                <p className="mt-2 text-[13px] font-medium text-teal-600 sm:mt-3 sm:text-sm">综合成绩</p>

                {/* Score breakdown */}
                <div className="mt-2 grid w-full grid-cols-2 gap-2 sm:mt-3">
                  <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-center sm:px-3 sm:py-2.5">
                    <p className="text-[11px] text-stone-500 sm:text-xs">线上得分</p>
                    <p className="mt-0.5 text-base font-bold text-stone-800 sm:text-lg">
                      {displayScore}<span className="text-xs font-normal text-stone-400 sm:text-sm"> / {result.maxPossibleScore}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-center sm:px-3 sm:py-2.5">
                    <p className="text-[11px] text-stone-500 sm:text-xs">实操得分</p>
                    <p className="mt-0.5 text-base font-bold text-stone-800 sm:text-lg">
                      {result.practicalScore ?? '--'}
                    </p>
                  </div>
                </div>

                {/* Formula explanation */}
                <p className="mt-1.5 text-[11px] text-stone-400 sm:mt-2 sm:text-xs">
                  线上 {displayScore} × 40% + 实操 {result.practicalScore ?? '--'} × 60% = {result.combinedScore} 分
                </p>
              </>
            ) : (
              <>
                <ScoreRing
                  score={displayScore}
                  maxScore={result.maxPossibleScore}
                  isPassed={isPassed}
                />
                <p className="mt-2 text-[13px] text-stone-500 sm:mt-3 sm:text-sm">线上理论得分</p>

                {/* Pending combined score */}
                {!isResultQueryOpen && (
                  <div className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 sm:mt-3 sm:px-4 sm:py-3">
                    <div className="flex items-start gap-2.5">
                      <svg className="mt-0.5 h-5 w-5 shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-stone-700">综合得分请等待成绩公布</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {resultQueryOpenAt
                            ? `成绩将于 ${new Date(resultQueryOpenAt).toLocaleString('zh-CN')} 公布`
                            : '综合成绩由管理员统一公布，届时可查看详细成绩与错题解析'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ===== Below sections only visible when result query is open ===== */}
        {isResultQueryOpen && (
          <>
            {/* ===== Section 2: Stats Grid ===== */}
            <div className="mb-3 grid grid-cols-4 gap-2 sm:mb-4 sm:gap-3">
              <div className="rounded-xl border border-stone-200 bg-white px-2 py-3 text-center shadow-sm sm:rounded-2xl sm:px-3 sm:py-4">
                <p className="text-lg font-bold text-teal-600 sm:text-xl">{accuracyRate}%</p>
                <p className="mt-0.5 text-[10px] text-stone-400 sm:text-[11px]">正确率</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white px-2 py-3 text-center shadow-sm sm:rounded-2xl sm:px-3 sm:py-4">
                <p className="text-lg font-bold text-stone-800 sm:text-xl">{result.correctCount}/{result.totalQuestions}</p>
                <p className="mt-0.5 text-[10px] text-stone-400 sm:text-[11px]">答对/总题</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white px-2 py-3 text-center shadow-sm sm:rounded-2xl sm:px-3 sm:py-4">
                <p className="text-lg font-bold text-stone-800 sm:text-xl">{timeTaken}</p>
                <p className="mt-0.5 text-[10px] text-stone-400 sm:text-[11px]">答题用时</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white px-2 py-3 text-center shadow-sm sm:rounded-2xl sm:px-3 sm:py-4">
                <p className="text-lg font-bold text-stone-800 sm:text-xl">
                  {unansweredCount > 0 ? unansweredCount : '0'}
                </p>
                <p className="mt-0.5 text-[10px] text-stone-400 sm:text-[11px]">未作答</p>
              </div>
            </div>

            {/* ===== Section 5: Category Scores ===== */}
            {categoryScores.length > 0 && (
              <div className="mb-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:mb-4 sm:p-5">
                <h2 className="mb-3 text-[13px] font-semibold text-stone-700 sm:mb-4 sm:text-sm">
                  分类得分
                </h2>
                <div className="space-y-3.5">
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

            {/* ===== Section 6: 答题明细 with filter tabs ===== */}
            {allQuestions.length > 0 && (
              <div className="mb-3 sm:mb-4">
                <h2 className="mb-2 text-[13px] font-semibold text-stone-700 sm:mb-3 sm:text-sm">答题明细</h2>

                {/* Tab bar */}
                <div className="relative mb-4">
                  <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                    <button
                      onClick={() => setActiveTab('ALL')}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-4 sm:text-sm ${
                        activeTab === 'ALL'
                          ? 'bg-teal-600 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      全部（{allQuestions.length}）
                    </button>
                    {availableTypes.map((type) => {
                      const qs = questionsByType[type];
                      const wrongCount = qs.filter((q) => q.isCorrect === false).length;
                      return (
                        <button
                          key={type}
                          onClick={() => setActiveTab(type)}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-4 sm:text-sm ${
                            activeTab === type
                              ? 'bg-teal-600 text-white'
                              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {QUESTION_TYPE_LABELS[type]}（{qs.length}）
                          {wrongCount > 0 && activeTab !== type && (
                            <span className="ml-1 text-xs text-red-500">{wrongCount}错</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Right fade hint for scroll */}
                  <div className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-stone-50 to-transparent sm:hidden" />
                </div>

                {/* Question list */}
                <div className="space-y-2.5 sm:space-y-3">
                  {displayQuestions.map((q, idx) => (
                    <QuestionCard key={q.questionId} q={q} index={idx + 1} />
                  ))}
                  {displayQuestions.length === 0 && (
                    <p className="py-8 text-center text-sm text-stone-400">该类型无题目</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== Action buttons ===== */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              localStorage.removeItem('exam-result-session');
              localStorage.removeItem('exam-questions-raw');
              localStorage.removeItem('exam-session-id');
              router.push('/my-exams');
            }}
          >
            返回我的考试
          </Button>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[11px] text-stone-300">
          本报告由系统自动生成，客观题由系统即时判分
        </p>
      </div>
    </div>
  );
}
