'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Eye, SquarePen } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs } from '@/components/ui/Tabs';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Dialog } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

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
  process: string;
  level: string;
  referenceAnswer?: string | null;
  // AI 初評（PRD F3）：僅供參考，未經評卷人確認不計入成績
  aiScore?: number | null;
  aiReason?: string | null;
  aiKeyPoints?: { point: string; hit: boolean }[] | null;
  aiConfidence?: 'high' | 'medium' | 'low' | null;
  aiModel?: string | null;
  scoreSource?: string | null;
}

interface ProcessProgress {
  process: string;
  pending: number;
  graded: number;
  /** 待評分中已有 AI 建議的筆數 */
  aiSuggested: number;
}

interface GradingData {
  examTitle: string;
  totalPending: number;
  gradedCount: number;
  answers: PendingAnswer[];
  /** 各工序閱卷進度（PRD F2-6） */
  byProcess: ProcessProgress[];
  /** 評卷人僅見所負責工序；null 代表不受限 */
  scopedProcesses: string[] | null;
  role: string;
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
  const [processFilter, setProcessFilter] = useState<string>('');
  const [employeeFilter, setEmployeeFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [gradingAnswer, setGradingAnswer] = useState<PendingAnswer | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeComment, setGradeComment] = useState('');
  const [editingGraded, setEditingGraded] = useState(false); // 已评分→修改模式
  const [editReason, setEditReason] = useState('');           // 修改原因（必填）
  const [saving, setSaving] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [adoptingAll, setAdoptingAll] = useState(false);
  const [page, setPage] = useState(1);

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

    // 工序篩選（PRD F2-6）
    if (processFilter) {
      filtered = filtered.filter((a) => a.process === processFilter);
    }

    // 考生篩選
    if (employeeFilter) {
      filtered = filtered.filter((a) => a.employeeName === employeeFilter);
    }

    // 等級篩選
    if (levelFilter) {
      filtered = filtered.filter((a) => a.level === levelFilter);
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
  }, [data?.answers, activeTab, searchQuery, processFilter, employeeFilter, levelFilter]);

  // 篩選下拉選項（依現有資料動態產生；只有在真的有多個值時才顯示）
  const employeeOptions = useMemo(() => {
    const present = [...new Set((data?.answers ?? []).map((a) => a.employeeName).filter(Boolean))];
    return [
      { value: '', label: '全部考生' },
      ...present.map((n) => ({ value: n, label: n })),
    ];
  }, [data?.answers]);

  const levelOptions = useMemo(() => {
    const present = [...new Set((data?.answers ?? []).map((a) => a.level).filter(Boolean))];
    return [
      { value: '', label: '全部等级' },
      ...present.map((l) => ({ value: l, label: l })),
    ];
  }, [data?.answers]);

  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filteredAnswers.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedAnswers = filteredAnswers.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [activeTab, searchQuery, processFilter, employeeFilter, levelFilter]);

  function openGradingDialog(answer: PendingAnswer) {
    setGradingAnswer(answer);
    setGradeScore(answer.isGraded ? String(answer.earnedPoints ?? '') : '');
    setGradeComment(answer.graderComment ?? '');
    setEditingGraded(false);
    setEditReason('');
  }

  function closeGradingDialog() {
    setGradingAnswer(null);
    setGradeScore('');
    setGradeComment('');
    setEditingGraded(false);
    setEditReason('');
  }

  /** 觸發 AI 初評（PRD F3-2），僅產生建議分數，不寫入成績 */
  async function handleAiSuggest(answerIds?: string[]) {
    setAiRunning(true);
    try {
      const res = await fetch('/api/admin/grading/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answerIds?.length ? { answerIds } : { examId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast(json.error || 'AI 初评失败，请改用人工评分', 'error');
        return;
      }
      const { suggested, skipped } = json.data;
      toast(
        skipped > 0
          ? `AI 初评完成：${suggested} 题已产生建议，${skipped} 题无法判分（缺参考答案或服务异常）`
          : `AI 初评完成：${suggested} 题已产生建议分数`,
        suggested > 0 ? 'success' : 'warning'
      );
      await fetchGrading();
      if (answerIds?.length === 1) {
        // 單筆：重新帶出最新建議
        const updated = json.data.results?.[0];
        if (updated?.aiScore != null) setGradeScore(String(updated.aiScore));
      }
    } catch {
      toast('AI 初评失败，请改用人工评分', 'error');
    } finally {
      setAiRunning(false);
    }
  }

  async function handleSaveGrade() {
    if (!gradingAnswer) return;

    const score = Number(gradeScore);
    if (isNaN(score) || score < 0 || score > gradingAnswer.maxPoints) {
      toast(`分数必须在 0 到 ${gradingAnswer.maxPoints} 之间`, 'warning');
      return;
    }

    // 修改已评分数时，必须填写原因
    const isRegrade = gradingAnswer.isGraded && editingGraded;
    if (isRegrade && !editReason.trim()) {
      toast('修改已评分数必须填写原因', 'warning');
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
          // 省略空评语（schema 不接受 null）
          comment: gradeComment.trim() || undefined,
          reason: isRegrade ? editReason.trim() : undefined,
        }),
      });

      if (!res.ok) throw new Error('保存失败');
      toast(isRegrade ? '已修改评分' : '评分已保存', 'success');
      closeGradingDialog();
      fetchGrading();
    } catch {
      toast('保存评分失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function adoptAiScore(answerId: string, aiScore: number): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // earnedPoints 须为整数（gradingSchema），AI 分数四舍五入；
        // 不送 comment（schema 不接受 null，且不覆盖评卷人评语）
        body: JSON.stringify({ answerId, earnedPoints: Math.round(aiScore) }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // 单题采用 AI 建议分数
  async function handleAdoptOne(answer: PendingAnswer) {
    if (answer.aiScore == null) return;
    setSaving(true);
    const ok = await adoptAiScore(answer.answerId, answer.aiScore);
    setSaving(false);
    toast(ok ? '已采用 AI 建议分数' : '采用失败', ok ? 'success' : 'error');
    if (ok) fetchGrading();
  }

  // 批次采用：对所有「待评分且有 AI 建议」的题目套用 AI 分数
  async function handleAdoptAll() {
    const toAdopt = (data?.answers ?? []).filter((a) => !a.isGraded && a.aiScore != null);
    if (toAdopt.length === 0) {
      toast('没有可采用的 AI 建议（请先运行 AI 初评）', 'warning');
      return;
    }
    setAdoptingAll(true);
    let ok = 0;
    for (const a of toAdopt) {
      if (await adoptAiScore(a.answerId, a.aiScore as number)) ok += 1;
    }
    setAdoptingAll(false);
    toast(`已采用 ${ok} 题 AI 建议分数${ok < toAdopt.length ? `，${toAdopt.length - ok} 题失败` : ''}`, ok > 0 ? 'success' : 'error');
    fetchGrading();
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
        backHref="/admin/exams"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              loading={aiRunning}
              disabled={pending === 0}
              onClick={() => handleAiSuggest()}
            >
              AI 初评待评分题目
            </Button>
            <Button
              loading={adoptingAll}
              disabled={pending === 0}
              onClick={handleAdoptAll}
            >
              采用全部 AI 建议
            </Button>
          </div>
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

      {/* 各工序阅卷进度（PRD F2-6）*/}
      {(data?.byProcess?.length ?? 0) > 1 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-700">各工序阅卷进度</h3>
            {processFilter && (
              <button
                type="button"
                onClick={() => setProcessFilter('')}
                className="text-xs text-teal-600 hover:underline"
              >
                清除筛选（目前：{processFilter}）
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data!.byProcess.map((p) => {
              const total = p.pending + p.graded;
              const pct = total === 0 ? 0 : Math.round((p.graded / total) * 100);
              const active = processFilter === p.process;
              return (
                <button
                  key={p.process}
                  type="button"
                  onClick={() => setProcessFilter(active ? '' : p.process)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-800">{p.process}</span>
                    <span className="text-xs text-stone-500">
                      {p.graded} / {total}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Progress value={pct} color={pct === 100 ? 'green' : 'teal'} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className={p.pending > 0 ? 'text-orange-600' : 'text-stone-400'}>
                      待评 {p.pending}
                    </span>
                    {p.aiSuggested > 0 && (
                      <span className="text-violet-500">AI 已初评 {p.aiSuggested}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-stone-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} className="!border-b-0" />
          <div className="flex flex-col gap-2 pb-1 sm:flex-row sm:items-center sm:pb-0">
            {employeeOptions.length > 1 && (
              <CustomSelect
                options={employeeOptions}
                value={employeeFilter}
                onChange={setEmployeeFilter}
                className="w-full sm:w-40"
              />
            )}
            {levelOptions.length > 2 && (
              <CustomSelect
                options={levelOptions}
                value={levelFilter}
                onChange={setLevelFilter}
                className="w-full sm:w-32"
              />
            )}
            <div className="relative w-full sm:w-56">
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
              {pagedAnswers.map((answer) => (
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
                    {answer.department}
                    {answer.process && <span className="text-teal-600"> · {answer.process}</span>}
                    {answer.level && ` ${answer.level}`}
                    {' · '}
                    {QUESTION_TYPE_LABELS[answer.questionType] || answer.questionType}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-stone-600 leading-relaxed">
                    {answer.questionContent}
                  </p>
                  {answer.aiScore != null && (
                    <p className="mt-1.5 text-xs text-violet-600">
                      AI 建议：<span className="font-semibold">{answer.aiScore}</span> / {answer.maxPoints}
                    </p>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    {!answer.isGraded && answer.aiScore != null && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => handleAdoptOne(answer)}
                      >
                        采用 AI
                      </Button>
                    )}
                    {answer.isGraded ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openGradingDialog(answer)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        查看
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => openGradingDialog(answer)}
                      >
                        <SquarePen className="h-3.5 w-3.5" />
                        评分
                      </Button>
                    )}
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
                    <th className="px-4 py-3 font-medium">工序</th>
                    <th className="px-4 py-3 font-medium">题型</th>
                    <th className="px-4 py-3 font-medium max-w-xs">题目摘要</th>
                    <th className="px-4 py-3 font-medium text-center">满分</th>
                    <th className="px-4 py-3 font-medium text-center">AI建议</th>
                    <th className="px-4 py-3 font-medium text-center">得分</th>
                    <th className="px-4 py-3 font-medium text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAnswers.map((answer) => (
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
                      <td className="px-4 py-3">
                        {answer.process ? (
                          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700">
                            {answer.process}
                            {answer.level && ` ${answer.level}`}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-300">—</span>
                        )}
                      </td>
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
                        {answer.aiScore != null ? (
                          <span className="font-medium text-violet-600">
                            {answer.aiScore}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
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
                        <div className="flex items-center justify-center gap-2">
                          {!answer.isGraded && answer.aiScore != null && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saving}
                              onClick={() => handleAdoptOne(answer)}
                            >
                              采用 AI
                            </Button>
                          )}
                          {answer.isGraded ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openGradingDialog(answer)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              查看
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => openGradingDialog(answer)}
                            >
                              <SquarePen className="h-3.5 w-3.5" />
                              评分
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 text-sm">
                <span className="text-stone-500">
                  第 {pageSafe} / {totalPages} 页，共 {filteredAnswers.length} 题
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Grading Dialog */}
      {gradingAnswer && (
        <Dialog
          open={!!gradingAnswer}
          onClose={closeGradingDialog}
          title={editingGraded ? '修改评分' : gradingAnswer.isGraded ? '评分详情' : '评分'}
          className="sm:max-w-2xl"
          footer={
            gradingAnswer.isGraded && !editingGraded ? (
              <div className="flex w-full items-center justify-between">
                <Button variant="ghost" onClick={closeGradingDialog}>
                  关闭
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingGraded(true);
                    setGradeScore(String(gradingAnswer.earnedPoints ?? ''));
                    setEditReason('');
                  }}
                >
                  修改评分
                </Button>
              </div>
            ) : editingGraded ? (
              <div className="flex w-full items-center justify-between">
                <Button variant="ghost" onClick={() => { setEditingGraded(false); setEditReason(''); }}>
                  取消修改
                </Button>
                <Button onClick={handleSaveGrade} loading={saving}>
                  保存修改
                </Button>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between">
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
                <span className="text-stone-500">工序：</span>
                <span className="font-medium text-stone-800">
                  {gradingAnswer.process || '—'}
                  {gradingAnswer.level ? ` ${gradingAnswer.level}` : ''}
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

            {/* AI 初评建议（PRD F3-3）：仅供参考，最终分数由评卷人确认 */}
            {gradingAnswer.aiScore != null ? (
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                    AI 初评建议（仅供参考）
                  </p>
                  <Badge variant={
                    gradingAnswer.aiConfidence === 'high'
                      ? 'success'
                      : gradingAnswer.aiConfidence === 'low'
                        ? 'warning'
                        : 'info'
                  }>
                    信心度 {gradingAnswer.aiConfidence === 'high' ? '高' : gradingAnswer.aiConfidence === 'low' ? '低' : '中'}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xl font-bold text-violet-800">
                    {gradingAnswer.aiScore} / {gradingAnswer.maxPoints}
                  </p>
                  {!gradingAnswer.isGraded && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setGradeScore(String(gradingAnswer.aiScore))}
                    >
                      采用此分数
                    </Button>
                  )}
                </div>
                {gradingAnswer.aiReason && (
                  <p className="mt-2 text-sm text-violet-800">{gradingAnswer.aiReason}</p>
                )}
                {gradingAnswer.aiKeyPoints && gradingAnswer.aiKeyPoints.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {gradingAnswer.aiKeyPoints.map((kp, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-violet-900">
                        <span className={kp.hit ? 'text-green-600' : 'text-stone-400'}>
                          {kp.hit ? '✓' : '✗'}
                        </span>
                        <span className={kp.hit ? '' : 'text-stone-500 line-through'}>{kp.point}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-violet-500">
                  AI 建议不计入成绩，最终分数以评卷人送出者为准。
                </p>
              </div>
            ) : !gradingAnswer.isGraded ? (
              <div className="flex items-center justify-between rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-3">
                <p className="text-sm text-stone-500">尚未产生 AI 初评建议</p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={aiRunning}
                  onClick={() => handleAiSuggest([gradingAnswer.answerId])}
                >
                  {aiRunning ? '评分中…' : 'AI 初评本题'}
                </Button>
              </div>
            ) : null}

            {/* Grading form or result */}
            {gradingAnswer.isGraded && !editingGraded ? (
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
                      <p className="text-xs font-medium text-green-600">评语 / 原因</p>
                      <p className="text-sm text-green-800">{gradingAnswer.graderComment}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-stone-200 bg-white p-3 sm:p-4 space-y-3">
                {editingGraded && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    注意：您正在修改已评分数（原 {gradingAnswer.earnedPoints} 分），请填写修改原因。
                  </p>
                )}
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
                {editingGraded ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      修改原因 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
                      rows={3}
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="请说明为什么修改此题分数（必填，将记录审计）..."
                    />
                  </div>
                ) : (
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
                )}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
