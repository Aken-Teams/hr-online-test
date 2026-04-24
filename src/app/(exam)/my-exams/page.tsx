'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Clock, Play, CheckCircle2, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';

const PAGE_SIZE = 9;

interface MyExam {
  assignmentId: string;
  examId: string;
  title: string;
  description: string | null;
  process: string | null;
  level: string | null;
  timeLimitMinutes: number;
  totalScore: number;
  passScore: number;
  openAt: string | null;
  closeAt: string | null;
  examStatus: string;
  sessionStatus: string;
  sessionId: string | null;
  canStart: boolean;
  isPracticeMode: boolean;
  batches?: { id: string; name: string; openAt: string; closeAt: string }[];
}

function getExamCategory(exam: MyExam): 'active' | 'completed' | 'missed' {
  const completed = ['COMPLETED', 'SUBMITTED', 'AUTO_SUBMITTED'].includes(exam.sessionStatus);
  if (completed) return 'completed';

  const isPastClose = exam.closeAt ? new Date(exam.closeAt) < new Date() : false;
  const isClosed = exam.examStatus === 'CLOSED' || exam.examStatus === 'ARCHIVED' || isPastClose;
  const notTaken = exam.sessionStatus === 'NOT_STARTED';
  if (isClosed && notTaken) return 'missed';

  return 'active';
}

export default function MyExamsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [exams, setExams] = useState<MyExam[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [examFilter, setExamFilter] = useState<string>('');
  const [processFilter, setProcessFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null); // null = not yet initialized
  const [page, setPage] = useState(1);

  useEffect(() => {
    const token = localStorage.getItem('exam-token');
    if (!token) {
      router.replace('/');
      return;
    }

    async function fetchExams() {
      try {
        const res = await fetch('/api/exam/my-exams');
        const json = await res.json();
        if (json.success) {
          setExams(json.data);
        } else {
          toast(json.error || '加载考试列表失败', 'error');
        }
      } catch {
        toast('加载考试列表失败', 'error');
      } finally {
        setLoading(false);
      }
    }

    fetchExams();
  }, [router, toast]);

  // Unique exam titles (sorted: active first, then by title)
  const examOptions = useMemo(() => {
    const map = new Map<string, { examId: string; title: string; hasActive: boolean }>();
    for (const exam of exams) {
      const existing = map.get(exam.examId);
      const isActive = getExamCategory(exam) === 'active';
      if (!existing) {
        map.set(exam.examId, { examId: exam.examId, title: exam.title, hasActive: isActive });
      } else if (isActive) {
        existing.hasActive = true;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [exams]);

  // Default examFilter to latest active exam
  const effectiveExamFilter = useMemo(() => {
    if (examFilter) return examFilter;
    const firstActive = examOptions.find((e) => e.hasActive);
    return firstActive?.examId || '';
  }, [examFilter, examOptions]);

  // Unique processes & levels (derived from current exam selection)
  const { processes, levels } = useMemo(() => {
    const filtered = effectiveExamFilter
      ? exams.filter((e) => e.examId === effectiveExamFilter)
      : exams;
    const procSet = new Set<string>();
    const lvlSet = new Set<string>();
    for (const exam of filtered) {
      if (exam.process) procSet.add(exam.process);
      if (exam.level) lvlSet.add(exam.level);
    }
    return {
      processes: Array.from(procSet).sort(),
      levels: Array.from(lvlSet).sort(),
    };
  }, [exams, effectiveExamFilter]);

  // Default status to 'active' if there are active exams
  const effectiveStatusFilter = useMemo(() => {
    if (statusFilter !== null) return statusFilter;
    const hasActive = exams.some((e) => getExamCategory(e) === 'active');
    return hasActive ? 'active' : '';
  }, [statusFilter, exams]);

  // Reset sub-filters when exam changes
  useEffect(() => {
    setProcessFilter('');
    setLevelFilter('');
    setStatusFilter(null);
    setPage(1);
  }, [effectiveExamFilter]);

  // Reset page when any filter changes
  useEffect(() => {
    setPage(1);
  }, [processFilter, levelFilter, effectiveStatusFilter]);

  // Filtered exams
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (effectiveExamFilter && exam.examId !== effectiveExamFilter) return false;
      if (processFilter && exam.process !== processFilter) return false;
      if (levelFilter && exam.level !== levelFilter) return false;
      if (effectiveStatusFilter) {
        const cat = getExamCategory(exam);
        if (effectiveStatusFilter !== cat) return false;
      }
      return true;
    });
  }, [exams, effectiveExamFilter, processFilter, levelFilter, effectiveStatusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / PAGE_SIZE));
  const pagedExams = filteredExams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function getStatusBadge(exam: MyExam) {
    const cat = getExamCategory(exam);
    if (cat === 'missed') return <Badge variant="danger">未参加</Badge>;
    if (cat === 'completed') return <Badge variant="success">已完成</Badge>;

    switch (exam.sessionStatus) {
      case 'NOT_STARTED':
        return <Badge variant="default">未开始</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">进行中</Badge>;
      default:
        return <Badge variant="default">{exam.sessionStatus}</Badge>;
    }
  }

  function handleGoExam(exam: MyExam) {
    const completed = ['COMPLETED', 'SUBMITTED', 'AUTO_SUBMITTED'].includes(exam.sessionStatus);
    if (completed && exam.sessionId) {
      router.push(`/result?sessionId=${exam.sessionId}`);
    } else {
      router.push(`/instructions?assignmentId=${exam.assignmentId}`);
    }
  }

  if (loading) return <LoadingSpinner />;

  const hasSubFilters = processFilter !== '' || levelFilter !== '' || effectiveStatusFilter !== '';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-stone-800">我的考试</h1>
        <p className="mt-1 text-sm text-stone-500">查看已安排的考试并开始作答</p>
      </div>

      {exams.length === 0 ? (
        <EmptyState
          title="暂无考试"
          description="您目前没有被安排的考试，请联系管理员"
        />
      ) : (
        <>
          {/* Filter bar */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CustomSelect
              placeholder="全部考试"
              value={examFilter || effectiveExamFilter}
              onChange={(v) => setExamFilter(v)}
              options={[
                { value: '', label: '全部考试' },
                ...examOptions.map((e) => ({
                  value: e.examId,
                  label: e.hasActive ? e.title : `${e.title}（已结束）`,
                })),
              ]}
            />
            <CustomSelect
              placeholder="全部工序"
              value={processFilter}
              onChange={(v) => setProcessFilter(v)}
              disabled={processes.length === 0}
              options={[
                { value: '', label: '全部工序' },
                ...processes.map((p) => ({ value: p, label: p })),
              ]}
            />
            <CustomSelect
              placeholder="全部等级"
              value={levelFilter}
              onChange={(v) => setLevelFilter(v)}
              disabled={levels.length === 0}
              options={[
                { value: '', label: '全部等级' },
                ...levels.map((l) => ({ value: l, label: l })),
              ]}
            />
            <CustomSelect
              placeholder="全部状态"
              value={effectiveStatusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: '', label: '全部状态' },
                { value: 'active', label: '进行中' },
                { value: 'completed', label: '已完成' },
                { value: 'missed', label: '未参加' },
              ]}
            />
          </div>

          {/* Results count */}
          <p className="text-xs text-stone-400">
            共 {filteredExams.length} 项
            {hasSubFilters && (
              <button
                onClick={() => { setProcessFilter(''); setLevelFilter(''); setStatusFilter(''); setPage(1); }}
                className="ml-2 text-teal-600 hover:text-teal-700"
              >
                清除筛选
              </button>
            )}
          </p>

          {/* Exam cards */}
          {filteredExams.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pagedExams.map((exam) => (
                  <ExamCard key={exam.assignmentId} exam={exam} getStatusBadge={getStatusBadge} onGo={handleGoExam} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 pt-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`min-w-[32px] rounded-lg px-2 py-1 text-sm font-medium transition-colors ${
                        n === page
                          ? 'bg-teal-50 text-teal-700'
                          : 'text-stone-500 hover:bg-stone-100'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-stone-100 bg-stone-50 px-4 py-8 text-center">
              <p className="text-sm text-stone-500">没有符合筛选条件的考试</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getBatchWindowInfo(exam: MyExam): { inWindow: boolean; message?: string } {
  if (!exam.batches || exam.batches.length === 0) return { inWindow: true };
  const now = new Date();
  // Check if in any batch window
  for (const b of exam.batches) {
    if (now >= new Date(b.openAt) && now <= new Date(b.closeAt)) {
      return { inWindow: true };
    }
  }
  // Find next batch
  const sorted = [...exam.batches].sort((a, b) => new Date(a.openAt).getTime() - new Date(b.openAt).getTime());
  for (const b of sorted) {
    if (new Date(b.openAt) > now) {
      return { inWindow: false, message: `下一梯次「${b.name}」尚未开始` };
    }
  }
  return { inWindow: false, message: '所有梯次已结束' };
}

function formatBatchTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function ExamCard({
  exam,
  getStatusBadge,
  onGo,
}: {
  exam: MyExam;
  getStatusBadge: (exam: MyExam) => React.ReactNode;
  onGo: (exam: MyExam) => void;
}) {
  const [showBatchPopup, setShowBatchPopup] = useState(false);
  const cat = getExamCategory(exam);
  const completed = cat === 'completed';
  const missed = cat === 'missed';
  const inProgress = exam.sessionStatus === 'IN_PROGRESS';
  const hasBatches = exam.batches && exam.batches.length > 0;
  const batchInfo = hasBatches ? getBatchWindowInfo(exam) : { inWindow: true };
  const notInBatchWindow = hasBatches && !batchInfo.inWindow && !completed && !missed;

  return (
    <Card className={`flex flex-col overflow-visible ${missed ? 'opacity-75' : ''}`}>
      <div className="flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-800 leading-snug">{exam.title}</h3>
          {getStatusBadge(exam)}
        </div>

        {(exam.process || exam.level) && (
          <div className="flex flex-wrap gap-1.5">
            {exam.process && (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                {exam.process}
              </span>
            )}
            {exam.level && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {exam.level}
              </span>
            )}
            {exam.isPracticeMode && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                练习
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {exam.timeLimitMinutes} 分钟
          </div>
          <div>满分 {exam.totalScore} 分</div>
        </div>

        {hasBatches && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBatchPopup(!showBatchPopup)}
              className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-teal-600 transition-colors"
            >
              共 {exam.batches!.length} 个梯次
              <Info className="h-3.5 w-3.5" />
            </button>

            {/* Batch schedule popup — mobile: fixed bottom sheet, desktop: absolute upward */}
            {showBatchPopup && (
              <>
                {/* Mobile: backdrop + bottom sheet */}
                <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" onClick={() => setShowBatchPopup(false)} />
                <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl p-4 pb-6 sm:hidden animate-in slide-in-from-bottom">
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-300" />
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-stone-700">梯次时间安排</h4>
                    <button type="button" onClick={() => setShowBatchPopup(false)} className="rounded p-1 text-stone-400 hover:text-stone-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {exam.batches!.map((b) => {
                      const now = new Date();
                      const isActive = now >= new Date(b.openAt) && now <= new Date(b.closeAt);
                      const isPast = now > new Date(b.closeAt);
                      return (
                        <div key={b.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                          isActive ? 'bg-teal-50 text-teal-700 font-medium' :
                          isPast ? 'text-stone-400 line-through' : 'text-stone-600'
                        }`}>
                          <span>{b.name}</span>
                          <span className="text-xs">{formatBatchTime(b.openAt)} ~ {formatBatchTime(b.closeAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Desktop: absolute popup upward */}
                <div className="hidden sm:block absolute bottom-full left-0 right-0 mb-1 z-10 rounded-lg border border-stone-200 bg-white shadow-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-stone-700">梯次时间安排</h4>
                    <button type="button" onClick={() => setShowBatchPopup(false)} className="rounded p-0.5 text-stone-400 hover:text-stone-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {exam.batches!.map((b) => {
                      const now = new Date();
                      const isActive = now >= new Date(b.openAt) && now <= new Date(b.closeAt);
                      const isPast = now > new Date(b.closeAt);
                      return (
                        <div key={b.id} className={`flex items-center justify-between rounded px-2 py-1.5 text-xs ${
                          isActive ? 'bg-teal-50 text-teal-700 font-medium' :
                          isPast ? 'text-stone-400 line-through' : 'text-stone-600'
                        }`}>
                          <span>{b.name}</span>
                          <span>{formatBatchTime(b.openAt)} ~ {formatBatchTime(b.closeAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {exam.description && (
          <p className="text-xs text-stone-400 line-clamp-2">{exam.description}</p>
        )}
      </div>

      <div className="mt-4 border-t border-stone-100 pt-3">
        {missed ? (
          <p className="text-center text-xs text-stone-400 py-1">考试已结束，您未参加此考试</p>
        ) : completed ? (
          <Button variant="secondary" size="sm" className="w-full" onClick={() => onGo(exam)}>
            <CheckCircle2 className="h-4 w-4" />
            查看成绩
          </Button>
        ) : notInBatchWindow ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-700">
              {batchInfo.message || '目前不在梯次时间内'}
            </p>
          </div>
        ) : (
          <Button size="sm" className="w-full" disabled={!exam.canStart} onClick={() => onGo(exam)}>
            <Play className="h-4 w-4" />
            {inProgress ? '继续考试' : '开始考试'}
          </Button>
        )}
      </div>
    </Card>
  );
}
