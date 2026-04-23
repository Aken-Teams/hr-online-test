'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useExamSession } from '@/hooks/useExamSession';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useTimer } from '@/hooks/useTimer';
import { useTabDetection } from '@/hooks/useTabDetection';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useExamStore } from '@/stores/exam-store';
import { AntiCheat } from '@/components/shared/AntiCheat';
import { ExamWatermark } from '@/components/shared/ExamWatermark';
import { cn } from '@/lib/utils';
import type { ExamQuestionView } from '@/types/exam';

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

const QUESTION_TYPE_BADGE: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple'> = {
  SINGLE_CHOICE: 'info',
  MULTI_CHOICE: 'purple',
  TRUE_FALSE: 'warning',
  SHORT_ANSWER: 'success',
  FILL_BLANK: 'default',
  CASE_ANALYSIS: 'danger',
  PRACTICAL: 'info',
};

const SHORT_ANSWER_MAX_CHARS = 2000;

// ---------------------------------------------------------------------------
// Question renderers
// ---------------------------------------------------------------------------

interface QuestionRendererProps {
  question: ExamQuestionView;
  answer: string;
  onAnswer: (value: string) => void;
}

/** Single choice: 4 option buttons */
function SingleChoiceRenderer({ question, answer, onAnswer }: QuestionRendererProps) {
  return (
    <div className="space-y-2.5">
      {question.options.map((opt) => {
        const selected = answer === opt.label;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onAnswer(opt.label)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-base transition-colors',
              selected
                ? 'border-teal-500 bg-teal-50 text-teal-900'
                : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                selected
                  ? 'border-teal-500 bg-teal-600 text-white'
                  : 'border-stone-300 bg-white text-stone-500',
              )}
            >
              {opt.label}
            </span>
            <span className="flex-1">
              {opt.content}
              {opt.imageUrl && (
                <img
                  src={opt.imageUrl}
                  alt={`${opt.label} 选项图片`}
                  className="mt-2 max-h-40 rounded border border-stone-200"
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Multi choice: checkboxes */
function MultiChoiceRenderer({ question, answer, onAnswer }: QuestionRendererProps) {
  const selectedSet = useMemo(
    () => new Set(answer ? answer.split(',') : []),
    [answer],
  );

  const toggle = useCallback(
    (label: string) => {
      const next = new Set(selectedSet);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      onAnswer(Array.from(next).sort().join(','));
    },
    [selectedSet, onAnswer],
  );

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-stone-500">（多选题，可选择多个选项）</p>
      {question.options.map((opt) => {
        const checked = selectedSet.has(opt.label);
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => toggle(opt.label)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-base transition-colors',
              checked
                ? 'border-teal-500 bg-teal-50 text-teal-900'
                : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-medium',
                checked
                  ? 'border-teal-500 bg-teal-600 text-white'
                  : 'border-stone-300 bg-white text-stone-500',
              )}
            >
              {checked ? (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                opt.label
              )}
            </span>
            <span className="flex-1">
              {opt.content}
              {opt.imageUrl && (
                <img
                  src={opt.imageUrl}
                  alt={`${opt.label} 选项图片`}
                  className="mt-2 max-h-40 rounded border border-stone-200"
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** True/false: two toggle buttons */
function TrueFalseRenderer({ answer, onAnswer }: QuestionRendererProps) {
  return (
    <div className="flex gap-3">
      {[
        { value: 'true', label: '正确' },
        { value: 'false', label: '错误' },
      ].map((opt) => {
        const selected = answer === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onAnswer(opt.value)}
            className={cn(
              'flex flex-1 items-center justify-center rounded-lg border px-6 py-4 text-sm font-medium transition-colors',
              selected
                ? opt.value === 'true'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-red-500 bg-red-50 text-red-700'
                : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Short answer: textarea with character counter */
function ShortAnswerRenderer({ answer, onAnswer }: QuestionRendererProps) {
  return (
    <div className="space-y-1.5">
      <textarea
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        rows={6}
        maxLength={SHORT_ANSWER_MAX_CHARS}
        className={cn(
          'block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-800',
          'placeholder:text-stone-400',
          'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0',
          'transition-colors duration-150',
        )}
        placeholder="请输入您的答案..."
      />
      <p className="text-right text-xs text-stone-400">
        {answer.length} / {SHORT_ANSWER_MAX_CHARS}
      </p>
    </div>
  );
}

/** Fill in the blank: inline text inputs */
function FillBlankRenderer({ question, answer, onAnswer }: QuestionRendererProps) {
  // answer is stored as JSON array for fill-blank
  const blanks = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(answer);
      return Array.isArray(parsed) ? parsed : [''];
    } catch {
      return [answer || ''];
    }
  }, [answer]);

  // Count blanks from question content (marked with ____)
  const blankCount = useMemo(() => {
    const matches = question.content.match(/_{2,}/g);
    return matches ? matches.length : 1;
  }, [question.content]);

  // Ensure blanks array matches blank count
  const normalizedBlanks = useMemo(() => {
    const arr = [...blanks];
    while (arr.length < blankCount) arr.push('');
    return arr.slice(0, blankCount);
  }, [blanks, blankCount]);

  const updateBlank = useCallback(
    (index: number, value: string) => {
      const next = [...normalizedBlanks];
      next[index] = value;
      onAnswer(JSON.stringify(next));
    },
    [normalizedBlanks, onAnswer],
  );

  return (
    <div className="space-y-3">
      {normalizedBlanks.map((val, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-stone-500">
            第 {idx + 1} 空:
          </span>
          <input
            type="text"
            value={val}
            onChange={(e) => updateBlank(idx, e.target.value)}
            className={cn(
              'block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800',
              'placeholder:text-stone-400',
              'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0',
            )}
            placeholder={`请输入第 ${idx + 1} 空的答案`}
          />
        </div>
      ))}
    </div>
  );
}

/** Case analysis / practical: textarea */
function EssayRenderer({ answer, onAnswer, placeholder }: QuestionRendererProps & { placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <textarea
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        rows={8}
        maxLength={SHORT_ANSWER_MAX_CHARS}
        className={cn(
          'block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-800',
          'placeholder:text-stone-400',
          'focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0',
          'transition-colors duration-150',
        )}
        placeholder={placeholder || '请输入您的答案...'}
      />
      <p className="text-right text-xs text-stone-400">
        {answer.length} / {SHORT_ANSWER_MAX_CHARS}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question renderer dispatcher
// ---------------------------------------------------------------------------

function QuestionRenderer({
  question,
  answer,
  onAnswer,
}: QuestionRendererProps) {
  switch (question.type) {
    case 'SINGLE_CHOICE':
      return <SingleChoiceRenderer question={question} answer={answer} onAnswer={onAnswer} />;
    case 'MULTI_CHOICE':
      return <MultiChoiceRenderer question={question} answer={answer} onAnswer={onAnswer} />;
    case 'TRUE_FALSE':
      return <TrueFalseRenderer question={question} answer={answer} onAnswer={onAnswer} />;
    case 'SHORT_ANSWER':
      return <ShortAnswerRenderer question={question} answer={answer} onAnswer={onAnswer} />;
    case 'FILL_BLANK':
      return <FillBlankRenderer question={question} answer={answer} onAnswer={onAnswer} />;
    case 'CASE_ANALYSIS':
      return <EssayRenderer question={question} answer={answer} onAnswer={onAnswer} placeholder="请分析案例并输入您的答案..." />;
    case 'PRACTICAL':
      return <EssayRenderer question={question} answer={answer} onAnswer={onAnswer} placeholder="请描述操作步骤和解答..." />;
    default:
      return <ShortAnswerRenderer question={question} answer={answer} onAnswer={onAnswer} />;
  }
}

// ---------------------------------------------------------------------------
// Answer card (floating bottom sheet)
// ---------------------------------------------------------------------------

interface AnswerCardProps {
  questions: ExamQuestionView[];
  answers: Record<string, string>;
  flags: Set<string>;
  currentIndex: number;
  onJump: (index: number) => void;
  visible: boolean;
  onClose: () => void;
}

function AnswerCard({
  questions,
  answers,
  flags,
  currentIndex,
  onJump,
  visible,
  onClose,
}: AnswerCardProps) {
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Trigger animation on next frame so CSS transition fires
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    } else {
      setAnimateIn(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden transition-opacity duration-300',
          animateIn ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={cn(
          'fixed z-50 rounded-t-2xl border border-stone-200 bg-white shadow-xl transition-transform duration-300 ease-out',
          // Mobile: bottom sheet slide up
          'bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto sm:bottom-auto sm:left-auto',
          animateIn ? 'translate-y-0' : 'translate-y-full',
          // Desktop: side panel slide in from right
          'sm:right-4 sm:top-20 sm:w-72 sm:rounded-xl sm:max-h-[calc(100vh-6rem)]',
          'sm:transition-all sm:duration-300',
          animateIn ? 'sm:translate-y-0 sm:opacity-100' : 'sm:translate-x-4 sm:opacity-0',
        )}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white px-4 py-3">
          <h3 className="text-sm font-semibold text-stone-800">答题卡</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-stone-100 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="h-3 w-3 rounded-full bg-stone-200" /> 未答
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="h-3 w-3 rounded-full bg-green-500" /> 已答
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="h-3 w-3 rounded-full bg-orange-400" /> 标记
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="h-3 w-3 rounded-full ring-2 ring-teal-500 ring-offset-1" /> 当前
          </span>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-8 gap-2 p-4 sm:grid-cols-6">
          {questions.map((q, idx) => {
            const isAnswered = !!(answers[q.id] && answers[q.id] !== '');
            const isFlagged = flags.has(q.id);
            const isCurrent = idx === currentIndex;

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  onJump(idx);
                  onClose();
                }}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  isCurrent && 'ring-2 ring-teal-500 ring-offset-1',
                  isFlagged
                    ? 'bg-orange-400 text-white'
                    : isAnswered
                      ? 'bg-green-500 text-white'
                      : 'bg-stone-200 text-stone-600 hover:bg-gray-300',
                )}
                title={`第 ${idx + 1} 题`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Network indicator
// ---------------------------------------------------------------------------

function NetworkIndicator({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      离线
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main test page
// ---------------------------------------------------------------------------

export default function TestPage() {
  const router = useRouter();
  const { toast } = useToast();

  // ---- Store & hooks -------------------------------------------------------

  const sessionId = useExamStore((s) => s.sessionId);
  const timeRemaining = useExamStore((s) => s.timeRemaining);
  const storeSetTimeRemaining = useExamStore((s) => s.setTimeRemaining);
  const reset = useExamStore((s) => s.reset);

  const {
    currentQuestion,
    currentIndex,
    totalQuestions,
    answers,
    flags,
    goToQuestion,
    nextQuestion,
    prevQuestion,
    toggleFlag,
    answeredCount,
    unansweredCount,
    flaggedCount,
  } = useExamSession();

  // Get raw question data for rendering (includes type info)
  const [rawQuestions, setRawQuestions] = useState<ExamQuestionView[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('exam-questions-raw');
      if (stored) {
        setRawQuestions(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const currentRawQuestion = rawQuestions[currentIndex] || null;

  // Auto-save
  const { saveAnswer, isSaving, pendingCount } = useAutoSave(sessionId || '');

  // Network status
  const { isOnline } = useNetworkStatus();

  // ---- Submit handler ------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!sessionId) return;
    const token = localStorage.getItem('exam-token');

    try {
      const res = await fetch(`/api/exam/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error || '提交失败，请重试', 'error');
        return;
      }

      // Store result session id for the result page
      localStorage.setItem('exam-result-session', sessionId);
      reset();
      router.push('/result');
    } catch {
      toast('网络错误，提交失败', 'error');
    }
  }, [sessionId, reset, router, toast]);

  // Timer
  const { formattedTime, start: startTimer } = useTimer(
    timeRemaining,
    () => {
      // Auto-submit on expiry
      toast('考试时间已到，正在自动交卷...', 'warning');
      handleSubmit();
    },
  );

  // Sync timer back to store every second for persistence
  useEffect(() => {
    const interval = setInterval(() => {
      // The timer hook manages its own state; we sync to store for persistence
      storeSetTimeRemaining(timeRemaining);
    }, 5000);
    return () => clearInterval(interval);
  }, [timeRemaining, storeSetTimeRemaining]);

  // Start the timer on mount
  useEffect(() => {
    if (sessionId) {
      startTimer();
    }
  }, [sessionId, startTimer]);

  // Tab detection
  const tabSwitchLimitRef = useState(3)[0]; // default; overridden if exam data available
  const [forceSubmitCountdown, setForceSubmitCountdown] = useState<number | null>(null);

  useTabDetection((count) => {
    if (count >= tabSwitchLimitRef) {
      // Show countdown overlay instead of immediate submit
      setForceSubmitCountdown(5);
      // Audit the event
      if (sessionId) {
        fetch(`/api/exam/${sessionId}/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'TAB_SWITCH_EXCEEDED',
            detail: `Tab switch count: ${count}`,
          }),
        }).catch(() => {});
      }
    } else if (count > 0) {
      toast(`警告：您已切屏 ${count} 次，累计 ${tabSwitchLimitRef} 次将强制交卷`, 'warning');
      // Audit single switch event
      if (sessionId) {
        fetch(`/api/exam/${sessionId}/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'TAB_SWITCH',
            detail: `Tab switch count: ${count}`,
          }),
        }).catch(() => {});
      }
    }
  });

  // Force submit countdown timer
  useEffect(() => {
    if (forceSubmitCountdown === null) return;
    if (forceSubmitCountdown <= 0) {
      handleSubmit();
      return;
    }
    const timer = setTimeout(() => {
      setForceSubmitCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [forceSubmitCountdown, handleSubmit]);

  // ---- UI state ------------------------------------------------------------

  const [showAnswerCard, setShowAnswerCard] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Answer handler ------------------------------------------------------

  const handleAnswer = useCallback(
    (value: string) => {
      if (!currentRawQuestion) return;
      saveAnswer(currentRawQuestion.id, value);
    },
    [currentRawQuestion, saveAnswer],
  );

  // ---- Flag handler --------------------------------------------------------

  const handleFlag = useCallback(() => {
    if (!currentRawQuestion) return;
    toggleFlag(currentRawQuestion.id);

    // Also notify server
    if (sessionId) {
      fetch('/api/exam/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId: currentRawQuestion.id,
        }),
      }).catch(() => {});
    }
  }, [currentRawQuestion, toggleFlag, sessionId]);

  // ---- Submit flow ---------------------------------------------------------

  const handleConfirmSubmit = useCallback(async () => {
    setSubmitting(true);
    await handleSubmit();
    setSubmitting(false);
    setShowSubmitDialog(false);
  }, [handleSubmit]);

  // ---- Guard: redirect if no session ---------------------------------------

  if (!sessionId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-stone-500">正在加载考试...</p>
        {/* Auto-redirect if truly no session */}
        <RedirectIfNoSession />
      </div>
    );
  }

  if (!currentRawQuestion && rawQuestions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const currentAnswer = currentRawQuestion ? (answers[currentRawQuestion.id] || '') : '';
  const isFlagged = currentRawQuestion ? flags.has(currentRawQuestion.id) : false;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  // Timer color
  const timerSeconds = timeRemaining;
  const timerColor =
    timerSeconds <= 300
      ? 'text-red-600'
      : 'text-stone-800';

  return (
    <div className="flex min-h-screen flex-col">
      <AntiCheat blockNavigation />
      <ExamWatermark />
      {/* ================================================================== */}
      {/* Top bar */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          {/* Logo */}
          <Logo size="sm" className="hidden sm:flex" />

          {/* Progress */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-1">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>
                {answeredCount}/{totalQuestions}
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} color="teal" />
          </div>

          {/* Timer */}
          <div className={cn('shrink-0 font-mono font-bold tabular-nums text-base sm:text-lg', timerColor)}>
            {formattedTime}
          </div>

          {/* Network + save indicators */}
          <div className="hidden items-center gap-2 sm:flex">
            <NetworkIndicator isOnline={isOnline} />
            {isSaving && (
              <span className="text-xs text-stone-400">保存中...</span>
            )}
            {pendingCount > 0 && (
              <Badge variant="warning">{pendingCount} 待同步</Badge>
            )}
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* Question area */}
      {/* ================================================================== */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-3 py-3 sm:px-4 sm:py-6">
        {currentRawQuestion && (
          <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
            {/* Question header */}
            <div className="flex items-start justify-between border-b border-stone-100 px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 sm:mb-2 sm:gap-2">
                  <span className="text-sm font-medium text-stone-500">
                    第 {currentIndex + 1}/{totalQuestions} 题
                  </span>
                  <Badge variant={QUESTION_TYPE_BADGE[currentRawQuestion.type] ?? 'default'}>
                    {QUESTION_TYPE_LABELS[currentRawQuestion.type] || currentRawQuestion.type}
                  </Badge>
                  <span className="text-xs text-stone-400">
                    {currentRawQuestion.points} 分
                  </span>
                </div>
                <p className="text-base leading-relaxed text-stone-800 whitespace-pre-wrap">
                  {currentRawQuestion.content}
                </p>
              </div>

              {/* Flag button */}
              <button
                type="button"
                onClick={handleFlag}
                className={cn(
                  'ml-2 shrink-0 rounded-lg p-1.5 transition-colors sm:ml-3 sm:p-2',
                  isFlagged
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600',
                )}
                title={isFlagged ? '取消标记' : '标记此题'}
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill={isFlagged ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                </svg>
              </button>
            </div>

            {/* Answer area */}
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              <QuestionRenderer
                question={currentRawQuestion}
                answer={currentAnswer}
                onAnswer={handleAnswer}
              />
            </div>
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* Bottom navigation */}
      {/* ================================================================== */}
      <footer className="sticky bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
          {/* Left: prev/next */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={prevQuestion}
              disabled={currentIndex === 0}
            >
              <svg className="h-4 w-4 sm:mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              <span className="hidden sm:inline">上一题</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={nextQuestion}
              disabled={currentIndex === totalQuestions - 1}
            >
              <span className="hidden sm:inline">下一题</span>
              <svg className="h-4 w-4 sm:ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          </div>

          {/* Center: answer card toggle */}
          <button
            type="button"
            onClick={() => setShowAnswerCard(!showAnswerCard)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 sm:py-2',
              showAnswerCard
                ? 'bg-teal-100 text-teal-700'
                : 'text-stone-600 hover:bg-stone-100',
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span>答题卡</span>
          </button>

          {/* Right: submit */}
          <Button
            size="sm"
            onClick={() => setShowSubmitDialog(true)}
          >
            交卷
          </Button>
        </div>
      </footer>

      {/* ================================================================== */}
      {/* Answer card overlay */}
      {/* ================================================================== */}
      <AnswerCard
        questions={rawQuestions}
        answers={answers}
        flags={flags}
        currentIndex={currentIndex}
        onJump={goToQuestion}
        visible={showAnswerCard}
        onClose={() => setShowAnswerCard(false)}
      />

      {/* ================================================================== */}
      {/* Submit confirmation dialog */}
      {/* ================================================================== */}
      <ConfirmDialog
        open={showSubmitDialog}
        onClose={() => setShowSubmitDialog(false)}
        onConfirm={handleConfirmSubmit}
        title="确认交卷"
        message={
          `已答 ${answeredCount} 题，未答 ${unansweredCount} 题` +
          (flaggedCount > 0 ? `，标记 ${flaggedCount} 题` : '') +
          '。确定要提交试卷吗？提交后无法修改。'
        }
        confirmText="确认交卷"
        cancelText="继续答题"
        loading={submitting}
      />

      {/* ================================================================== */}
      {/* Force submit countdown overlay */}
      {/* ================================================================== */}
      {forceSubmitCountdown !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-stone-800">切屏次数已达上限</h3>
            <p className="mt-2 text-sm text-stone-600">
              系统检测到您多次切换窗口，违反考试规则。
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-3xl font-bold tabular-nums text-red-600">
                {forceSubmitCountdown}
              </span>
              <span className="text-sm text-stone-500">秒后自动交卷</span>
            </div>
            <p className="mt-3 text-xs text-stone-400">
              试卷将自动提交，无法取消
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: redirect if no session after hydration
// ---------------------------------------------------------------------------

function RedirectIfNoSession() {
  const router = useRouter();
  const sessionId = useExamStore((s) => s.sessionId);

  useEffect(() => {
    // Wait a tick for Zustand hydration from localStorage
    const timeout = setTimeout(() => {
      if (!sessionId) {
        router.replace('/instructions');
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, [sessionId, router]);

  return null;
}
