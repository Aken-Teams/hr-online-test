'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { ClipboardCheck, ChevronRight } from 'lucide-react';

interface GradingExam {
  examId: string;
  title: string;
  status: string;
  createdAt: string;
  total: number;
  pending: number;
  graded: number;
  aiSuggested: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿', PUBLISHED: '待开放', ACTIVE: '进行中', CLOSED: '已结束', ARCHIVED: '已归档',
};

export default function GradingPortalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [exams, setExams] = useState<GradingExam[]>([]);
  const [scopedProcesses, setScopedProcesses] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/grading/exams');
        const json = await res.json();
        if (json.success) {
          setExams(json.data.exams);
          setScopedProcesses(json.data.scopedProcesses);
        } else {
          toast(json.error || '加载失败', 'error');
        }
      } catch {
        toast('加载评卷列表失败', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="简答题评卷"
        description={
          scopedProcesses && scopedProcesses.length > 0
            ? `您负责的工序：${scopedProcesses.join('、')}`
            : '选择考试，批改您负责工序考生的简答题'
        }
      />

      {exams.length === 0 ? (
        <EmptyState
          title="暂无待评卷的考试"
          description="当有考生提交含简答题的考试后，会出现在这里"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((e) => (
            <button
              key={e.examId}
              type="button"
              onClick={() => router.push(`/admin/exams/${e.examId}/grading`)}
              className="group text-left"
            >
              <Card className="transition-colors hover:border-teal-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-stone-800">{e.title}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant={e.status === 'ACTIVE' ? 'success' : 'default'}>
                        {STATUS_LABELS[e.status] ?? e.status}
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-stone-300 group-hover:text-teal-500" />
                </div>

                <div className="mt-3 flex items-center gap-4">
                  <div>
                    <p className={`text-2xl font-bold ${e.pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      {e.pending}
                    </p>
                    <p className="text-xs text-stone-400">待评分</p>
                  </div>
                  <div className="h-8 w-px bg-stone-100" />
                  <div>
                    <p className="text-sm font-medium text-stone-600">{e.graded} / {e.total}</p>
                    <p className="text-xs text-stone-400">已评 / 总数</p>
                  </div>
                  {e.aiSuggested > 0 && (
                    <>
                      <div className="h-8 w-px bg-stone-100" />
                      <div>
                        <p className="text-sm font-medium text-teal-600">{e.aiSuggested}</p>
                        <p className="text-xs text-stone-400">AI 已初评</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-3">
                  <Button variant={e.pending > 0 ? 'primary' : 'secondary'} size="sm" className="w-full">
                    <ClipboardCheck className="h-4 w-4" />
                    {e.pending > 0 ? `去评卷（${e.pending} 题待评）` : '查看评卷'}
                  </Button>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
