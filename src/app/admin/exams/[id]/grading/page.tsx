'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs } from '@/components/ui/Tabs';
import { Dialog } from '@/components/ui/Dialog';
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

const QUESTION_TYPE_LABELS: Record<string, string> = {
  SHORT_ANSWER: '简答题',
  FILL_BLANK: '填空题',
  CASE_ANALYSIS: '案例分析',
  PRACTICAL: '实操题',
};

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
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [gradingAnswer, setGradingAnswer] = useState<PendingAnswer | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeComment, setGradeComment] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Filter and search logic
  const filteredAnswers = useMemo(() => {
    if (!data?.answers) return [];

    let filtered = data.answers;

    // Tab filter
    if (activeTab === 'pending') {
      filtered = filtered.filter((a) => !a.isGraded);
    } else if (activeTab === 'graded') {
      filtered = filtered.filter((a) => a.isGraded);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.employeeName.toLowerCase().includes(q) ||
          a.department.toLowerCase().includes(q) ||
          a.questionContent.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [data?.answers, activeTab, searchQuery]);

  function openGradingDialog(answer: PendingAnswer) {
    setGradingAnswer(answer);
    setGradeScore(answer.isGraded ? String(answer.earnedPoints ?? '') : '');
    setGradeComment(answer.graderComment ?? '');
  }

  function closeGradingDialog() {
    setGradingAnswer(null);
    setGradeScore('');
    setGradeComment('');
  }

  async function handleSaveGrade() {
    if (!gradingAnswer) return;

    const score = Number(gradeScore);
    if (isNaN(score) || score < 0 || score > gradingAnswer.maxPoints) {
      toast(`分数必须在 0 到 ${gradingAnswer.maxPoints} 之间`, 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answerId: gradingAnswer.answerId,
          earnedPoints: score,
          comment: gradeComment.trim() || null,
        }),
      });

      if (!res.ok) throw new Error('保存失败');
      toast('评分已保存', 'success');
      closeGradingDialog();
      fetchGrading();
    } catch {
      toast('保存评分失败', 'error');
    } finally {
      setSaving(false);
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
  const pending = data?.totalPending ?? 0;
  const progressPct = total > 0 ? Math.round((graded / total) * 100) : 0;

  const tabs = [
    { key: 'pending', label: `待评分 (${pending})` },
    { key: 'graded', label: `已评分 (${graded})` },
    { key: 'all', label: `全部 (${total})` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.examTitle ? `阅卷 - ${data.examTitle}` : '阅卷'}
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/exams')}>
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Button>
        }
      />

      {/* Stats + Progress */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-stone-500 sm:text-sm">待评分</p>
          <p className="mt-0.5 text-xl font-bold text-orange-600 sm:mt-1 sm:text-2xl">{pending}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-stone-500 sm:text-sm">已评分</p>
          <p className="mt-0.5 text-xl font-bold text-green-600 sm:mt-1 sm:text-2xl">{graded}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-stone-500 sm:text-sm">完成进度</p>
          <div className="mt-1.5 sm:mt-2">
            <Progress value={progressPct} color={progressPct === 100 ? 'green' : 'teal'} />
          </div>
          <p className="mt-0.5 text-xs text-stone-400 sm:mt-1">{progressPct}%</p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-stone-200 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} className="!border-b-0" />
          <div className="w-full pb-2 sm:w-64 sm:py-2">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <input
                type="text"
                placeholder="搜索姓名、部门..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-stone-300 py-1.5 pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        {filteredAnswers.length === 0 ? (
          <div className="px-4 py-12 sm:px-6">
            <EmptyState
              title={searchQuery ? '无匹配结果' : activeTab === 'pending' ? '暂无待评分题目' : '暂无已评分题目'}
              description={searchQuery ? '请尝试其他搜索关键词' : ''}
            />
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="space-y-3 p-3 md:hidden">
              {filteredAnswers.map((answer) => (
                <div
                  key={answer.answerId}
                  className="rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={answer.isGraded ? 'success' : 'warning'}>
                        {answer.isGraded ? '已评' : '待评'}
                      </Badge>
                      <span className="text-sm font-medium text-stone-800">{answer.employeeName}</span>
                    </div>
                    <span className="text-xs text-stone-400">
                      {answer.isGraded ? (
                        <span className="font-semibold text-green-700">{answer.earnedPoints}</span>
                      ) : '--'} / {answer.maxPoints}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {answer.department} · {QUESTION_TYPE_LABELS[answer.questionType] || answer.questionType}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-stone-600 leading-relaxed">
                    {answer.questionContent}
                  </p>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant={answer.isGraded ? 'ghost' : 'primary'}
                      onClick={() => openGradingDialog(answer)}
                    >
                      {answer.isGraded ? '查看' : '评分'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50 text-stone-500">
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">考生</th>
                    <th className="px-4 py-3 font-medium">部门</th>
                    <th className="px-4 py-3 font-medium">题型</th>
                    <th className="px-4 py-3 font-medium max-w-xs">题目摘要</th>
                    <th className="px-4 py-3 font-medium text-center">满分</th>
                    <th className="px-4 py-3 font-medium text-center">得分</th>
                    <th className="px-4 py-3 font-medium text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnswers.map((answer) => (
                    <tr
                      key={answer.answerId}
                      className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Badge variant={answer.isGraded ? 'success' : 'warning'}>
                          {answer.isGraded ? '已评' : '待评'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800">
                        {answer.employeeName}
                      </td>
                      <td className="px-4 py-3 text-stone-500">{answer.department}</td>
                      <td className="px-4 py-3 text-stone-500">
                        {QUESTION_TYPE_LABELS[answer.questionType] || answer.questionType}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="truncate text-stone-600" title={answer.questionContent}>
                          {answer.questionContent}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center text-stone-600">
                        {answer.maxPoints}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {answer.isGraded ? (
                          <span className="font-semibold text-green-700">
                            {answer.earnedPoints}
                          </span>
                        ) : (
                          <span className="text-stone-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant={answer.isGraded ? 'ghost' : 'primary'}
                          onClick={() => openGradingDialog(answer)}
                        >
                          {answer.isGraded ? '查看' : '评分'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Grading Dialog */}
      {gradingAnswer && (
        <Dialog
          open={!!gradingAnswer}
          onClose={closeGradingDialog}
          title={gradingAnswer.isGraded ? '评分详情' : '评分'}
          className="sm:max-w-2xl"
          footer={
            gradingAnswer.isGraded ? (
              <Button variant="ghost" onClick={closeGradingDialog}>
                关闭
              </Button>
            ) : (
              <div className="flex gap-3">
                <Button variant="ghost" onClick={closeGradingDialog}>
                  取消
                </Button>
                <Button onClick={handleSaveGrade} loading={saving}>
                  保存评分
                </Button>
              </div>
            )
          }
        >
          <div className="space-y-4 sm:space-y-5">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:flex sm:flex-wrap sm:gap-4">
              <div>
                <span className="text-stone-500">考生：</span>
                <span className="font-medium text-stone-800">{gradingAnswer.employeeName}</span>
              </div>
              <div>
                <span className="text-stone-500">部门：</span>
                <span className="text-stone-800">{gradingAnswer.department}</span>
              </div>
              <div>
                <span className="text-stone-500">题型：</span>
                <span className="text-stone-800">
                  {QUESTION_TYPE_LABELS[gradingAnswer.questionType] || gradingAnswer.questionType}
                </span>
              </div>
              <div>
                <span className="text-stone-500">满分：</span>
                <span className="font-medium text-stone-800">{gradingAnswer.maxPoints} 分</span>
              </div>
            </div>

            {/* Question */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
                题目
              </p>
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 whitespace-pre-wrap">
                {gradingAnswer.questionContent}
              </div>
            </div>

            {/* Reference answer */}
            {gradingAnswer.referenceAnswer && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-teal-600">
                  参考答案
                </p>
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 whitespace-pre-wrap">
                  {gradingAnswer.referenceAnswer}
                </div>
              </div>
            )}

            {/* Student answer */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
                考生作答
              </p>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 whitespace-pre-wrap">
                {gradingAnswer.answerContent || '（未作答）'}
              </div>
            </div>

            {/* Grading form or result */}
            {gradingAnswer.isGraded ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 sm:px-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                  <div>
                    <p className="text-xs font-medium text-green-600">得分</p>
                    <p className="text-xl font-bold text-green-800">
                      {gradingAnswer.earnedPoints} / {gradingAnswer.maxPoints}
                    </p>
                  </div>
                  {gradingAnswer.graderComment && (
                    <div className="flex-1 border-t border-green-200 pt-2 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-4">
                      <p className="text-xs font-medium text-green-600">评语</p>
                      <p className="text-sm text-green-800">{gradingAnswer.graderComment}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-stone-200 bg-white p-3 sm:p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
                  <div className="w-full sm:w-40">
                    <Input
                      label={`得分（0 - ${gradingAnswer.maxPoints}）`}
                      type="number"
                      value={gradeScore}
                      onChange={(e) => setGradeScore(e.target.value)}
                      min={0}
                      max={gradingAnswer.maxPoints}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    {[0, Math.floor(gradingAnswer.maxPoints / 2), gradingAnswer.maxPoints].map(
                      (v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setGradeScore(String(v))}
                          className="rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors"
                        >
                          {v}分
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700">
                    评语（可选）
                  </label>
                  <textarea
                    className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
                    rows={3}
                    value={gradeComment}
                    onChange={(e) => setGradeComment(e.target.value)}
                    placeholder="输入评语..."
                  />
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
