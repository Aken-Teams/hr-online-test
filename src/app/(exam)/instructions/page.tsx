'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { useExamStore } from '@/stores/exam-store';
import type { ApiResponse, ExamData, ExamQuestionView } from '@/types/exam';

// ---------------------------------------------------------------------------
// Rule item component
// ---------------------------------------------------------------------------

function RuleItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-stone-700">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-stone-400"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
      <span>{text}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Rules section (collapsible)
// ---------------------------------------------------------------------------

function RulesSection({ tabSwitchLimit }: { tabSwitchLimit: number }) {
  const [expanded, setExpanded] = useState(false);

  const rules = [
    `禁止切屏（切屏>=${tabSwitchLimit}次强制交卷）`,
    '禁止截图、录屏、找人代考，违者成绩作废',
    '答题自动保存，中途退出可恢复',
    '时间到自动交卷，不可延长',
    '主观题由人工阅卷',
    '考试期间请保持网络畅通',
    '建议电量≥50%，避免中途关机',
    '请使用最新版 Chrome / Edge 浏览器',
  ];

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-stone-800">考试规则</span>
        <svg
          className={`h-4 w-4 text-stone-500 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-stone-200 px-4 py-3">
          <ul className="space-y-2.5">
            {rules.map((rule) => (
              <RuleItem key={rule} text={rule} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Battery warning component
// ---------------------------------------------------------------------------

function BatteryWarning() {
  const [lowBattery, setLowBattery] = useState(false);
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    if (!('getBattery' in navigator)) return;
    (navigator as unknown as { getBattery(): Promise<{ level: number; addEventListener(e: string, cb: () => void): void }> })
      .getBattery()
      .then((battery) => {
        const pct = Math.round(battery.level * 100);
        setLevel(pct);
        setLowBattery(pct < 50);
        battery.addEventListener('levelchange', () => {
          const updated = Math.round(battery.level * 100);
          setLevel(updated);
          setLowBattery(updated < 50);
        });
      })
      .catch(() => {});
  }, []);

  if (!lowBattery || level === null) return null;

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
      <p className="text-sm text-orange-700">
        当前电量 {level}%，建议充电至 50% 以上再开始考试，避免中途关机。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instructions page
// ---------------------------------------------------------------------------

export default function InstructionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const setSession = useExamStore((s) => s.setSession);

  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  // ---------------------------------------------------------------------------
  // Fetch available exam
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const token = localStorage.getItem('exam-token');
    if (!token) {
      router.replace('/verify');
      return;
    }

    async function fetchExam() {
      try {
        const res = await fetch('/api/exam/available');
        const data: ApiResponse<ExamData> = await res.json();

        if (!res.ok || !data.success || !data.data) {
          setError(data.error || '暂无可用考试');
          return;
        }

        // If there's an active IN_PROGRESS session, auto-resume and redirect
        // to the test page — prevents re-login exploit during exam.
        if (data.data.existingSession) {
          try {
            const startRes = await fetch(`/api/exam/${data.data.id}/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            const startData = await startRes.json();
            if (startRes.ok && startData.success && startData.data) {
              const { sessionId, questions, timeRemaining } = startData.data;
              setSession(
                sessionId,
                questions.map((q: ExamQuestionView) => ({
                  id: q.id,
                  type:
                    q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE'
                      ? 'choice'
                      : q.type === 'TRUE_FALSE'
                        ? 'truefalse'
                        : 'essay',
                  content: q.content,
                  options: q.options.map((o: { label: string; content: string }) => ({ label: o.label, text: o.content })),
                  multiSelect: q.isMultiSelect,
                })),
                timeRemaining,
              );
              localStorage.setItem('exam-questions-raw', JSON.stringify(questions));
              localStorage.setItem('exam-session-id', sessionId);
              router.replace('/test');
              return;
            }
          } catch {
            // Fall through to show instructions page normally
          }
        }

        setExam(data.data);
      } catch {
        setError('获取考试信息失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    }

    fetchExam();
  }, [router, setSession]);

  // ---------------------------------------------------------------------------
  // Time window check
  // ---------------------------------------------------------------------------

  const isWithinWindow = useCallback(() => {
    if (!exam) return false;
    const now = new Date();
    if (exam.openAt && new Date(exam.openAt) > now) return false;
    if (exam.closeAt && new Date(exam.closeAt) < now) return false;
    return true;
  }, [exam]);

  // ---------------------------------------------------------------------------
  // Start exam
  // ---------------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    if (!exam) return;
    const token = localStorage.getItem('exam-token');
    if (!token) {
      router.replace('/verify');
      return;
    }

    setStarting(true);
    try {
      const res = await fetch(`/api/exam/${exam.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data: ApiResponse<{
        sessionId: string;
        questions: ExamQuestionView[];
        timeRemaining: number;
      }> = await res.json();

      if (!res.ok || !data.success || !data.data) {
        toast(data.error || '启动考试失败', 'error');
        return;
      }

      // Populate the Zustand store
      const { sessionId, questions, timeRemaining } = data.data;
      setSession(
        sessionId,
        questions.map((q) => ({
          id: q.id,
          type:
            q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE'
              ? 'choice'
              : q.type === 'TRUE_FALSE'
                ? 'truefalse'
                : 'essay',
          content: q.content,
          options: q.options.map((o) => ({ label: o.label, text: o.content })),
          multiSelect: q.isMultiSelect,
        })),
        timeRemaining,
      );

      // Also store raw question data for the test page renderer
      localStorage.setItem('exam-questions-raw', JSON.stringify(questions));
      localStorage.setItem('exam-session-id', sessionId);

      router.push('/test');
    } catch {
      toast('网络错误，请稍后重试', 'error');
    } finally {
      setStarting(false);
    }
  }, [exam, router, setSession, toast]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-start px-4 pt-10 md:justify-center md:pt-0">
        <Logo size="sm" className="mb-4 md:mb-8" />
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-stone-800">无法加载考试</h2>
          <p className="mt-2 text-sm text-stone-500">{error}</p>
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

  if (!exam) return null;

  const windowOpen = isWithinWindow();
  const canStart = exam.canStart !== false;

  // Build question composition description from rules
  const composition = exam.questionRules
    .map((r) => {
      const typeLabels: Record<string, string> = {
        SINGLE_CHOICE: '单选题',
        MULTI_CHOICE: '多选题',
        TRUE_FALSE: '判断题',
        SHORT_ANSWER: '简答题',
        FILL_BLANK: '填空题',
        CASE_ANALYSIS: '案例分析题',
        PRACTICAL: '实操题',
      };
      return `${typeLabels[r.questionType] || r.questionType} ${r.count}题 x ${r.pointsPerQuestion}分`;
    })
    .join('，');

  return (
    <div className="flex min-h-screen flex-col items-center justify-start px-4 pt-6 pb-8 md:justify-center md:py-12">
      <Logo size="sm" className="mb-4 md:mb-8" />

      <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white shadow-sm">
        {/* Header */}
        <div className="border-b border-stone-100 px-4 py-4 md:px-6 md:py-5">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-stone-800 md:text-lg">{exam.title}</h2>
            {exam.isPracticeMode && (
              <Badge variant="info">练习模式</Badge>
            )}
          </div>
          {exam.description && (
            <p className="mt-1.5 text-sm text-stone-500">{exam.description}</p>
          )}
        </div>

        {/* Exam details */}
        <div className="space-y-3 px-4 py-4 md:space-y-4 md:px-6 md:py-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div className="rounded-lg bg-stone-50 px-3 py-2.5 md:px-4 md:py-3">
              <p className="text-xs text-stone-500">题目组成</p>
              <p className="mt-0.5 text-xs font-medium text-stone-800 md:text-sm">
                {composition || `共 ${exam.totalScore} 分`}
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2.5 md:px-4 md:py-3">
              <p className="text-xs text-stone-500">考试时长</p>
              <p className="mt-0.5 text-sm font-medium text-stone-800">
                {exam.timeLimitMinutes} 分钟
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2.5 md:px-4 md:py-3">
              <p className="text-xs text-stone-500">满分</p>
              <p className="mt-0.5 text-sm font-medium text-stone-800">
                {exam.totalScore} 分
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2.5 md:px-4 md:py-3">
              <p className="text-xs text-stone-500">及格分数</p>
              <p className="mt-0.5 text-sm font-medium text-stone-800">
                {exam.passScore} 分
              </p>
            </div>
          </div>

          {/* Rules */}
          <RulesSection tabSwitchLimit={exam.tabSwitchLimit} />

          {/* Privacy notice */}
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
            <p className="text-xs text-stone-500">
              隐私声明：本系统仅用于公司内部技能考核，所有数据严格保密，不会用于其他用途。
            </p>
          </div>

          {/* Battery warning */}
          <BatteryWarning />

          {/* Practice mode notice */}
          {exam.isPracticeMode && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm text-blue-700">
                当前为练习模式：成绩不计入正式记录，可多次作答。
              </p>
            </div>
          )}

          {/* Already completed warning */}
          {!canStart && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm font-medium text-stone-700">您已完成本次考试</p>
              <p className="mt-1 text-xs text-stone-600">
                已达最大作答次数 ({exam.maxAttempts} 次)，无法再次参加。
              </p>
            </div>
          )}

          {/* Time window warning */}
          {canStart && !windowOpen && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
              <p className="text-sm font-medium text-yellow-800">考试未开放</p>
              <p className="mt-1 text-xs text-yellow-700">
                {exam.openAt && `开放时间：${new Date(exam.openAt).toLocaleString('zh-CN')}`}
                {exam.openAt && exam.closeAt && ' ~ '}
                {exam.closeAt && `${new Date(exam.closeAt).toLocaleString('zh-CN')}`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-100 px-4 py-3 md:px-6 md:py-4">
          <Button
            size="lg"
            className="w-full"
            onClick={canStart ? handleStart : () => router.push('/result')}
            loading={starting}
            disabled={canStart && !windowOpen}
            variant={canStart ? 'primary' : 'secondary'}
          >
            {!canStart
              ? '查看考试结果'
              : windowOpen
                ? '开始答题'
                : '考试未开放'}
          </Button>
        </div>
      </div>

      {/* No "返回首页" link — prevent re-login exploit during exam */}
    </div>
  );
}
