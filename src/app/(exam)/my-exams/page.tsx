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
  examStatus: string;
  sessionStatus: string;
  sessionId: string | null;
  canStart: boolean;
  isPracticeMode: boolean;
  batches?: { id: string; name: string; openAt: string; closeAt: string }[];
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

  function getStatusBadge(exam: MyExam) {
    const isPastClose = exam.closeAt ? new Date(exam.closeAt) < new Date() : false;
    const isClosed = exam.examStatus === 'CLOSED' || isPastClose;
    const notTaken = exam.sessionStatus === 'NOT_STARTED';

    // Exam closed and employee never took it
    if (isClosed && notTaken) {
      return <Badge variant="danger">未参加</Badge>;
    }

    switch (exam.sessionStatus) {
      case 'NOT_STARTED':
        return <Badge variant="default">未开始</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">进行中</Badge>;
      case 'COMPLETED':
      case 'SUBMITTED':
      case 'AUTO_SUBMITTED':
        return <Badge variant="success">已完成</Badge>;
      default:
        return <Badge variant="default">{exam.sessionStatus}</Badge>;
    }
  }

  function handleGoExam(exam: MyExam) {
    const completed = ['COMPLETED', 'SUBMITTED', 'AUTO_SUBMITTED'].includes(exam.sessionStatus);
    // If completed, go directly to result page with sessionId
    if (completed && exam.sessionId) {
      router.push(`/result?sessionId=${exam.sessionId}`);
    } else {
      router.push(`/instructions?assignmentId=${exam.assignmentId}`);
    }
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
            const completed = ['COMPLETED', 'SUBMITTED', 'AUTO_SUBMITTED'].includes(exam.sessionStatus);
            const inProgress = exam.sessionStatus === 'IN_PROGRESS';
            const isPastClose = exam.closeAt ? new Date(exam.closeAt) < new Date() : false;
            const isClosed = exam.examStatus === 'CLOSED' || isPastClose;
            const notTaken = exam.sessionStatus === 'NOT_STARTED';
            const missed = isClosed && notTaken;

            return (
              <Card key={exam.assignmentId} className={`flex flex-col ${missed ? 'opacity-75' : ''}`}>
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

                  {exam.batches && exam.batches.length > 0 && (
                    <p className="text-xs text-stone-400">
                      共 {exam.batches.length} 个梯次
                    </p>
                  )}

                  {exam.description && (
                    <p className="text-xs text-stone-400 line-clamp-2">{exam.description}</p>
                  )}
                </div>

                <div className="mt-4 border-t border-stone-100 pt-3">
                  {missed ? (
                    <p className="text-center text-xs text-stone-400 py-1">考试已结束，您未参加此考试</p>
                  ) : completed ? (
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => handleGoExam(exam)}>
                      <CheckCircle2 className="h-4 w-4" />
                      查看成绩
                    </Button>
                  ) : (
                    <Button size="sm" className="w-full" disabled={!exam.canStart} onClick={() => handleGoExam(exam)}>
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
