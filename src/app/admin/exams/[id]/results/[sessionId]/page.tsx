'use client';

import { useEffect, useState, useMemo } from 'react';
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
    practicalScore: number | null;
    combinedScore: number | null;
  } | null;
  passScore: number;
  theoryWeight?: number;
  practicalWeight?: number;
  compositePassScore?: number;
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
  const strokeW = size <= 100 ? 8 : 10;
  const r = (size - strokeW - 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 60 ? '#0d9488' : '#ef4444';
  const textSize = size <= 100 ? 'text-xl' : 'text-2xl';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth={strokeW} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${textSize} font-bold text-stone-800`}>{score}</span>
        <span className="text-xs text-stone-400">/ {max}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------

/** Format TRUE_FALSE raw value to readable text */
function formatTFAnswer(val: string | null): string {
  if (!val) return '（未作答）';
  const v = val.toUpperCase();
  if (v === 'TRUE' || val === '是' || val === '对' || val === '√') return '✓ 正确（对）';
  if (v === 'FALSE' || val === '否' || val === '错' || val === '×') return '✗ 错误（错）';
  return val;
}

/** Format choice answer labels to readable text */
function formatChoiceAnswer(val: string | null): string {
  if (!val || val.trim() === '') return '（未作答）';
  return val;
}

function QuestionCard({ q, index }: { q: QuestionDetail; index: number }) {
  const isTrueFalse = q.questionType === 'TRUE_FALSE';
  const isChoice = ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(q.questionType);
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

        {/* TRUE_FALSE: option-style layout like choice questions */}
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
              <div className="flex items-center gap-4 text-sm">
                <span className="text-stone-500">
                  考生选择：
                  <span className={`font-medium ${!answered ? 'text-stone-400' : q.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                    {!answered ? '（未作答）' : choseTrue ? '正确（对）' : '错误（错）'}
                  </span>
                </span>
                <span className="text-stone-500">
                  正确答案：
                  <span className="font-medium text-green-700">{isCorrectTrue ? '正确（对）' : '错误（错）'}</span>
                </span>
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
                    <div
                      key={o.label}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${bg} ${border} ${text}`}
                    >
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
            {/* Student answer summary line */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-stone-500">
                考生选择：
                <span className={`font-medium ${answered ? (q.isCorrect ? 'text-green-700' : 'text-red-600') : 'text-stone-400'}`}>
                  {formatChoiceAnswer(q.yourAnswer)}
                </span>
              </span>
              <span className="text-stone-500">
                正确答案：
                <span className="font-medium text-green-700">{q.correctAnswer ?? '--'}</span>
              </span>
            </div>
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
          </>
        )}

        {/* Choice question without options data (fallback) */}
        {isChoice && (!q.options || q.options.length === 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500">考生选择</p>
              <div className={`rounded-lg border px-4 py-3 text-sm ${
                !answered
                  ? 'border-stone-200 bg-stone-50 text-stone-400'
                  : q.isCorrect
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {formatChoiceAnswer(q.yourAnswer)}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500">正确答案</p>
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {q.correctAnswer ?? '--'}
              </div>
            </div>
          </div>
        )}

        {/* Text answer comparison (SHORT_ANSWER, FILL_BLANK, etc.) */}
        {!isChoice && !isTrueFalse && (
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
  const [activeTab, setActiveTab] = useState<string>('ALL');

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

  // Group questions by type for tabs (safe to call before early returns since data can be null)
  const questionsByType = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, QuestionDetail[]> = {};
    for (const q of data.allQuestions) {
      if (!groups[q.questionType]) groups[q.questionType] = [];
      groups[q.questionType].push(q);
    }
    return groups;
  }, [data]);

  const typeOrder = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'FILL_BLANK', 'CASE_ANALYSIS', 'PRACTICAL'];
  const availableTypes = typeOrder.filter((t) => questionsByType[t]?.length);
  const displayQuestions = !data ? [] : activeTab === 'ALL' ? data.allQuestions : (questionsByType[activeTab] ?? []);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.employee.name} 的考试成绩`}
        description={`${data.examTitle} · ${data.employee.department}${data.employee.employeeNo?.startsWith('AUTO_') ? '' : ` · 工号 ${data.employee.employeeNo}`}`}
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
      {r && (() => {
        const hasPractical = r.practicalScore != null;
        const hasCombined = r.combinedScore != null;
        const compositePass = hasCombined ? r.combinedScore! >= (data.compositePassScore ?? 90) : null;
        const displayPassed = compositePass ?? r.isPassed;
        const ringScore = hasCombined ? r.combinedScore! : r.totalScore;
        const ringMax = hasCombined ? 100 : r.maxPossibleScore;

        return (
          <Card>
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
              {/* Score ring + pass info */}
              <div className="flex items-center gap-4 sm:gap-5">
                <ScoreRing score={ringScore} max={ringMax} size={100} />
                <div className="flex flex-col gap-1.5">
                  <Badge variant={displayPassed ? 'success' : 'danger'}>
                    {displayPassed ? '通过' : '未通过'}
                  </Badge>
                  {hasCombined ? (
                    <p className="text-xs text-stone-500">
                      综合及格线 <span className="font-semibold text-stone-700">{data.compositePassScore ?? 90}</span> 分
                    </p>
                  ) : (
                    <p className="text-xs text-stone-500">
                      及格线 <span className="font-semibold text-stone-700">{data.passScore}</span> 分
                    </p>
                  )}
                  {r.gradeLabel && (
                    <span className="text-xs text-stone-400">{r.gradeLabel}</span>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px self-stretch bg-stone-200" />

              {/* Stats grid */}
              {hasPractical ? (
                <div className="grid w-full flex-1 grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">线上分 <span className="text-stone-400">({Math.round((data.theoryWeight ?? 0.4) * 100)}%)</span></p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">
                      {r.totalScore}<span className="text-sm font-normal text-stone-400"> / {r.maxPossibleScore}</span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">实操分 <span className="text-stone-400">({Math.round((data.practicalWeight ?? 0.6) * 100)}%)</span></p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">{r.practicalScore ?? '--'}</p>
                  </div>
                  <div className="rounded-lg bg-teal-50 px-3 py-2.5 text-center">
                    <p className="text-xs font-medium text-teal-600">综合分</p>
                    <p className="mt-0.5 text-lg font-bold text-teal-700">{r.combinedScore ?? '--'}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">正确 / 总题</p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">{r.correctCount} / {totalQ}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">用时</p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">
                      {r.timeTakenSeconds > 0 ? formatTime(r.timeTakenSeconds) : '--'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid w-full flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">正确率</p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">{correctPct}%</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">正确 / 总题数</p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">{r.correctCount} / {totalQ}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">用时</p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">
                      {r.timeTakenSeconds > 0 ? formatTime(r.timeTakenSeconds) : '--'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-stone-500">未答题</p>
                    <p className="mt-0.5 text-lg font-bold text-stone-800">{data.unansweredCount}</p>
                  </div>
                </div>
              )}
            </div>

            {data.pendingGradingCount > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
                <p className="text-sm text-amber-700">
                  尚有 {data.pendingGradingCount} 道主观题待人工评分
                </p>
              </div>
            )}
          </Card>
        );
      })()}

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

      {/* Question detail tabs by type */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-stone-800">答题明细</h2>

        {/* Tab bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'ALL'
                ? 'bg-teal-600 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            全部（{data.allQuestions.length}）
          </button>
          {availableTypes.map((type) => {
            const qs = questionsByType[type];
            const wrongCount = qs.filter((q) => q.isCorrect === false).length;
            return (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === type
                    ? 'bg-teal-600 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {TYPE_LABELS[type]}（{qs.length}）
                {wrongCount > 0 && activeTab !== type && (
                  <span className="ml-1 text-xs text-red-500">
                    {wrongCount}错
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Question list */}
        <div className="space-y-3">
          {displayQuestions.map((q, idx) => (
            <QuestionCard key={q.questionId} q={q} index={idx} />
          ))}
          {displayQuestions.length === 0 && (
            <p className="py-8 text-center text-sm text-stone-400">该类型无题目</p>
          )}
        </div>
      </div>
    </div>
  );
}
