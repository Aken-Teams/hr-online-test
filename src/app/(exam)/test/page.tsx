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
              'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
              selected
                ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                selected
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-gray-500',
              )}
            >
              {opt.label}
            </span>
            <span className="flex-1">{opt.content}</span>
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
      <p className="text-xs text-gray-500">（多选题，可选择多个选项）</p>
      {question.options.map((opt) => {
        const checked = selectedSet.has(opt.label);
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => toggle(opt.label)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
              checked
                ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-medium',
                checked
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-gray-500',
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
            <span className="flex-1">{opt.content}</span>
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
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
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
          'block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900',
          'placeholder:text-gray-400',
          'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0',
          'transition-colors duration-150',
        )}
        placeholder="请输入您的答案..."
      />
      <p className="text-right text-xs text-gray-400">
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
          <span className="shrink-0 text-sm text-gray-500">
            第 {idx + 1} 空:
          </span>
          <input
            type="text"
            value={val}
            onChange={(e) => updateBlank(idx, e.target.value)}
            className={cn(
              'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900',
              'placeholder:text-gray-400',
              'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0',
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
          'block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900',
          'placeholder:text-gray-400',
          'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0',
          'transition-colors duration-150',
        )}
        placeholder={placeholder || '请输入您的答案...'}
      />
      <p className="text-right text-xs text-gray-400">
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
  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={cn(
          'fixed z-50 rounded-t-2xl border border-gray-200 bg-white shadow-xl',
          // Mobile: bottom sheet
          'bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto sm:bottom-auto sm:left-auto',
          // Desktop: side panel
          'sm:right-4 sm:top-20 sm:w-72 sm:rounded-xl sm:max-h-[calc(100vh-6rem)]',
        )}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">答题卡</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-gray-100 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-3 w-3 rounded-full bg-gray-200" /> 未答
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-3 w-3 rounded-full bg-green-500" /> 已答
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-3 w-3 rounded-full bg-orange-400" /> 标记
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-3 w-3 rounded-full ring-2 ring-indigo-500 ring-offset-1" /> 当前
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
                  isCurrent && 'ring-2 ring-indigo-500 ring-offset-1',
                  isFlagged
                    ? 'bg-orange-400 text-white'
                    : isAnswered
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300',
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
  useTabDetection((count) => {
    if (count >= tabSwitchLimitRef) {
      toast('切屏次数过多，正在强制交卷...', 'error');
      // Audit the event
      const token = localStorage.getItem('exam-token');
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
      handleSubmit();
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
        <p className="mt-4 text-sm text-gray-500">正在加载考试...</p>
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
    timerSeconds <= 60
      ? 'text-red-600'
      : timerSeconds <= 300
        ? 'text-yellow-600'
        : 'text-gray-900';

  return (
    <div className="flex min-h-screen flex-col">
      {/* ================================================================== */}
      {/* Top bar */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
          {/* Logo */}
          <Logo size="sm" className="hidden sm:flex" />

          {/* Progress */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {answeredCount} / {totalQuestions} 已答
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} color="indigo" />
          </div>

          {/* Timer */}
          <div className={cn('shrink-0 text-lg font-mono font-bold tabular-nums', timerColor)}>
            {formattedTime}
          </div>

          {/* Network + save indicators */}
          <div className="flex items-center gap-2">
            <NetworkIndicator isOnline={isOnline} />
            {isSaving && (
              <span className="text-xs text-gray-400">保存中...</span>
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
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {currentRawQuestion && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Question header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">
                    第 {currentIndex + 1} / {totalQuestions} 题
                  </span>
                  <Badge variant="info">
                    {QUESTION_TYPE_LABELS[currentRawQuestion.type] || currentRawQuestion.type}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {currentRawQuestion.points} 分
                  </span>
                </div>
                <p className="text-base leading-relaxed text-gray-900 whitespace-pre-wrap">
                  {currentRawQuestion.content}
                </p>
              </div>

              {/* Flag button */}
              <button
                type="button"
                onClick={handleFlag}
                className={cn(
                  'ml-3 shrink-0 rounded-lg p-2 transition-colors',
                  isFlagged
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
                )}
                title={isFlagged ? '取消标记' : '标记此题'}
              >
                <svg className="h-5 w-5" fill={isFlagged ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                </svg>
              </button>
            </div>

            {/* Answer area */}
            <div className="px-5 py-5 sm:px-6">
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
      <footer className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          {/* Left: prev/next */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={prevQuestion}
              disabled={currentIndex === 0}
            >
              <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              上一题
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={nextQuestion}
              disabled={currentIndex === totalQuestions - 1}
            >
              下一题
              <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Button>
          </div>

          {/* Center: answer card toggle */}
          <button
            type="button"
            onClick={() => setShowAnswerCard(!showAnswerCard)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              showAnswerCard
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span className="hidden sm:inline">答题卡</span>
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
