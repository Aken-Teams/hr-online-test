'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Clock, Play, CheckCircle2 } from 'lucide-react';

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
  sessionStatus: string;
  isPracticeMode: boolean;
}

export default function MyExamsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [exams, setExams] = useState<MyExam[]>([]);
  const [loading, setLoading] = useState(true);

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

  function getStatusBadge(status: string) {
    switch (status) {
      case 'NOT_STARTED':
        return <Badge variant="default">未开始</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">进行中</Badge>;
      case 'COMPLETED':
      case 'SUBMITTED':
        return <Badge variant="success">已完成</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  }

  function handleGoExam(exam: MyExam) {
    router.push(`/instructions?assignmentId=${exam.assignmentId}`);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => {
            const completed = exam.sessionStatus === 'COMPLETED' || exam.sessionStatus === 'SUBMITTED';
            const inProgress = exam.sessionStatus === 'IN_PROGRESS';

            return (
              <Card key={exam.assignmentId} className="flex flex-col">
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-stone-800 leading-snug">{exam.title}</h3>
                    {getStatusBadge(exam.sessionStatus)}
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

                  {exam.description && (
                    <p className="text-xs text-stone-400 line-clamp-2">{exam.description}</p>
                  )}
                </div>

                <div className="mt-4 border-t border-stone-100 pt-3">
                  {completed ? (
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => handleGoExam(exam)}>
                      <CheckCircle2 className="h-4 w-4" />
                      查看详情
                    </Button>
                  ) : (
                    <Button size="sm" className="w-full" onClick={() => handleGoExam(exam)}>
                      <Play className="h-4 w-4" />
                      {inProgress ? '继续考试' : '开始考试'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
