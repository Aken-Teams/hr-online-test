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
  message?: string;
  result: ExamResultData | null;
  ranking?: RankingData;
  unansweredCount?: number;
  pendingGradingCount?: number;
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
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const strokeColor = isPassed ? '#0d9488' : '#ef4444';
  const bgStrokeColor = '#e7e5e4';

  return (
    <div className="relative flex flex-col items-center">
      <svg width="136" height="136" className="-rotate-90">
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          stroke={bgStrokeColor}
          strokeWidth="10"
        />
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-stone-800">{score}</span>
        <span className="text-xs text-stone-400">/ {maxScore} 分</span>
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
// Wrong answer item
// ---------------------------------------------------------------------------

function WrongAnswerItem({
  index,
  questionContent,
  questionType,
  yourAnswer,
  correctAnswer,
  options,
}: {
  index: number;
  questionContent: string;
  questionType: string;
  yourAnswer: string;
  correctAnswer: string;
  options?: { label: string; content: string }[];
}) {
  // For choice questions, show the option content alongside the letter
  const formatAnswer = (answer: string, isCorrect: boolean) => {
    if (!options || options.length === 0) return answer;
    // If answer is a letter like "A" or "A,B", map to option content
    const letters = answer.split(',').map((s) => s.trim());
    const mapped = letters.map((letter) => {
      const opt = options.find((o) => o.label === letter);
      return opt ? `${letter}. ${opt.content}` : letter;
    });
    return mapped.join(isCorrect ? '、' : '、');
  };

  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
          {index}
        </span>
        <div className="flex-1">
          <div className="mb-1">
            <Badge variant="default">
              {QUESTION_TYPE_LABELS[questionType] || questionType}
            </Badge>
          </div>
          <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
            {questionContent}
          </p>
        </div>
      </div>
      <div className="ml-7 mt-2 space-y-1 text-sm">
        <div className="flex gap-1">
          <span className="shrink-0 text-red-500">
            <svg className="mt-0.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
          <p className="text-stone-600">
            <span className="text-stone-400">你的答案: </span>
            {yourAnswer ? formatAnswer(yourAnswer, false) : '（未作答）'}
          </p>
        </div>
        {correctAnswer && (
          <div className="flex gap-1">
            <span className="shrink-0 text-teal-500">
              <svg className="mt-0.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <p className="text-stone-600">
              <span className="text-stone-400">正确答案: </span>
              {formatAnswer(correctAnswer, true)}
            </p>
          </div>
        )}
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
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [passScore, setPassScore] = useState<number>(60);
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [pendingGradingCount, setPendingGradingCount] = useState(0);
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
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">
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

  const displayScore = result.totalScore ?? result.autoScore ?? 0;
  const isPassed = result.isFullyGraded
    ? (result.isPassed ?? (displayScore >= passScore))
    : false; // Don't show "passed" until fully graded

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <Logo size="sm" className="mx-auto mb-3 justify-center" />
          <h1 className="text-lg font-bold text-stone-800">{examTitle || '考试成绩报告'}</h1>
          {formattedSubmitTime && (
            <p className="mt-1 text-xs text-stone-400">交卷时间: {formattedSubmitTime}</p>
          )}
        </div>

        {/* ===== Section 1: Score Overview ===== */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col items-center">
            {/* Score ring */}
            <ScoreRing
              score={displayScore}
              maxScore={result.maxPossibleScore}
              isPassed={isPassed}
            />

            {/* Pass/fail badge */}
            <div className="mt-3 flex items-center gap-2">
              {result.isFullyGraded ? (
                <>
                  <Badge variant={isPassed ? 'success' : 'danger'}>
                    {isPassed ? '合格' : '不合格'}
                  </Badge>
                  {result.gradeLabel && (
                    <Badge variant="info">
                      等级 {result.gradeLabel}
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="warning">阅卷中</Badge>
              )}
            </div>

            <p className="mt-1.5 text-xs text-stone-400">
              {result.isFullyGraded
                ? `及格线: ${passScore} 分`
                : `客观题得分 · 及格线 ${passScore} 分`}
            </p>

            {/* Pending grading notice */}
            {!result.isFullyGraded && (
              <div className="mt-3 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-amber-800">主观题待阅卷</p>
                    <p className="mt-0.5 text-xs text-amber-600">
                      {pendingGradingCount > 0
                        ? `${pendingGradingCount} 道主观题正在等待人力资源部评阅，当前仅显示客观题得分`
                        : '部分主观题尚未阅卷'}
                      ，总分以最终阅卷结果为准
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== Section 2: Stats Grid ===== */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-stone-200 bg-white px-3 py-4 text-center shadow-sm">
            <p className="text-xl font-bold text-teal-600">{accuracyRate}%</p>
            <p className="mt-0.5 text-[11px] text-stone-400">正确率</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-3 py-4 text-center shadow-sm">
            <p className="text-xl font-bold text-stone-800">{result.correctCount}/{result.totalQuestions}</p>
            <p className="mt-0.5 text-[11px] text-stone-400">答对/总题数</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-3 py-4 text-center shadow-sm">
            <p className="text-xl font-bold text-stone-800">{timeTaken}</p>
            <p className="mt-0.5 text-[11px] text-stone-400">答题用时</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-3 py-4 text-center shadow-sm">
            <p className="text-xl font-bold text-stone-800">
              {unansweredCount > 0 ? unansweredCount : '0'}
            </p>
            <p className="mt-0.5 text-[11px] text-stone-400">未作答</p>
          </div>
        </div>

        {/* ===== Section 3: Ranking ===== */}
        {ranking && ranking.totalParticipants > 0 && (
          <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-stone-700">排名统计</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-teal-600">
                  {ranking.rank}
                  <span className="text-sm font-normal text-stone-400">
                    /{ranking.totalParticipants}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-stone-400">我的排名</p>
              </div>
              <StatCell
                value={ranking.averageScore}
                label="平均分"
              />
              <StatCell
                value={ranking.highestScore}
                label="最高分"
              />
            </div>
            {/* Visual rank bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1">
                <span>第1名</span>
                <span>第{ranking.totalParticipants}名</span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-stone-100">
                <div
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-500 shadow-sm"
                  style={{
                    left: ranking.totalParticipants > 1
                      ? `${((ranking.rank - 1) / (ranking.totalParticipants - 1)) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===== Section 4: Score Breakdown ===== */}
        {!result.isFullyGraded && (
          <div className="mb-4 rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-stone-700">评分明细</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-teal-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-teal-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-teal-700">客观题得分（自动判分）</span>
                </div>
                <span className="font-bold text-teal-800">{result.autoScore} 分</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-amber-700">主观题得分（人工批阅）</span>
                </div>
                <span className="font-bold text-amber-800">
                  {result.manualScore != null ? `${result.manualScore} 分` : '待批阅'}
                </span>
              </div>
              <div className="border-t border-stone-100 pt-2 flex items-center justify-between px-3">
                <span className="font-medium text-stone-700">当前总分</span>
                <span className="text-lg font-bold text-stone-800">{displayScore ?? result.autoScore} 分</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== Section 5: Category Scores ===== */}
        {categoryScores.length > 0 && (
          <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-stone-700">
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

        {/* ===== Section 6: Wrong Answer Analysis ===== */}
        {wrongAnswers.length > 0 && (
          <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-stone-700">
              错题分析
            </h2>
            <p className="mb-4 text-xs text-stone-400">
              共 {wrongAnswers.length} 题答错，以下为详细解析
            </p>
            <div className="space-y-3">
              {wrongAnswers.map((wa, idx) => (
                <WrongAnswerItem
                  key={wa.questionId}
                  index={idx + 1}
                  questionContent={wa.questionContent}
                  questionType={wa.questionType}
                  yourAnswer={wa.yourAnswer || ''}
                  correctAnswer={wa.correctAnswer || ''}
                  options={wa.options}
                />
              ))}
            </div>
          </div>
        )}

        {/* No wrong answers — positive feedback */}
        {wrongAnswers.length === 0 && result.correctCount > 0 && (
          <div className="mb-4 rounded-2xl border border-teal-100 bg-teal-50/50 p-5 text-center shadow-sm">
            <svg className="mx-auto mb-2 h-8 w-8 text-teal-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
            <p className="text-sm font-medium text-teal-700">客观题全部回答正确</p>
          </div>
        )}

        {/* ===== Action buttons ===== */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {isPassed && result.isFullyGraded && (
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

        {/* Footer note */}
        <p className="mt-6 text-center text-[11px] text-stone-300">
          本报告由系统自动生成，客观题由系统即时判分，主观题由管理员人工批阅
        </p>
      </div>
    </div>
  );
}
