'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import type { QuestionType, ExamData } from '@/types/exam';
import TabBasicInfo from './tabs/TabBasicInfo';
import TabParticipants from './tabs/TabParticipants';
import TabScores from './tabs/TabScores';

interface QuestionRule {
  id?: string;
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  commonRatio: number;
}

const TABS = [
  { key: 'basic', label: '基本信息' },
  { key: 'participants', label: '应考人员' },
  { key: 'scores', label: '成绩管理' },
];

export default function EditExamPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [passScore, setPassScore] = useState(60);

  // Weights
  const [theoryWeight, setTheoryWeight] = useState(40);
  const [practicalWeight, setPracticalWeight] = useState(60);
  const [compositePassScore, setCompositePassScore] = useState(90);
  const [basicQuestionRatio, setBasicQuestionRatio] = useState(10);

  // Open window
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');

  // Result query window
  const [resultQueryOpenAt, setResultQueryOpenAt] = useState('');
  const [resultQueryCloseAt, setResultQueryCloseAt] = useState('');

  // Settings
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [tabSwitchLimit, setTabSwitchLimit] = useState(3);
  const [enableFaceAuth, setEnableFaceAuth] = useState(false);

  // Exam status
  const [examStatus, setExamStatus] = useState<string>('DRAFT');
  const isFullyEditable = ['DRAFT', 'PUBLISHED'].includes(examStatus);

  // Question rules
  const [rules, setRules] = useState<QuestionRule[]>([]);

  const totalScore = useMemo(() => {
    return rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0);
  }, [rules]);

  function toLocalDatetime(date: Date | string): string {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  }

  const fetchExam = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/exams/${examId}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      const exam: ExamData = json.data;

      setExamStatus(exam.status);
      setTitle(exam.title);
      setDescription(exam.description || '');
      setTimeLimitMinutes(exam.timeLimitMinutes);
      setPassScore(exam.passScore);
      setShuffleQuestions(exam.shuffleQuestions);
      setShowCorrectAnswers(exam.showCorrectAnswers);
      setIsPracticeMode(exam.isPracticeMode);
      setTabSwitchLimit(exam.tabSwitchLimit);
      setEnableFaceAuth(exam.enableFaceAuth);

      setTheoryWeight(Math.round((exam.theoryWeight ?? 0.4) * 100));
      setPracticalWeight(Math.round((exam.practicalWeight ?? 0.6) * 100));
      setCompositePassScore(exam.compositePassScore ?? 90);
      setBasicQuestionRatio(Math.round((exam.basicQuestionRatio ?? 0.1) * 100));

      setRules(
        exam.questionRules.map((r) => ({
          id: r.id,
          questionType: r.questionType,
          count: r.count,
          pointsPerQuestion: r.pointsPerQuestion,
          commonRatio: Math.round(r.commonRatio * 100),
        }))
      );

      if (exam.openAt) setOpenAt(toLocalDatetime(exam.openAt));
      if (exam.closeAt) setCloseAt(toLocalDatetime(exam.closeAt));
      if (exam.resultQueryOpenAt) setResultQueryOpenAt(toLocalDatetime(exam.resultQueryOpenAt));
      if (exam.resultQueryCloseAt) setResultQueryCloseAt(toLocalDatetime(exam.resultQueryCloseAt));
    } catch {
      toast('加载考试数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [examId, toast]);

  useEffect(() => {
    fetchExam();
  }, [fetchExam]);

  async function handleSave() {
    if (!title.trim()) {
      toast('请输入考试标题', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        timeLimitMinutes,
        passScore,
        totalScore,
        theoryWeight: theoryWeight / 100,
        practicalWeight: practicalWeight / 100,
        compositePassScore,
        basicQuestionRatio: basicQuestionRatio / 100,
        openAt: openAt || null,
        closeAt: closeAt || null,
        resultQueryOpenAt: resultQueryOpenAt || null,
        resultQueryCloseAt: resultQueryCloseAt || null,
        shuffleQuestions,
        shuffleOptions: shuffleQuestions,
        showCorrectAnswers,
        showResultImmediately: true,
        isPracticeMode,
        tabSwitchLimit,
        enableFaceAuth,
        maxAttempts: 1,
        questionRules: rules.map((r) => ({
          ...r,
          commonRatio: r.commonRatio / 100,
        })),
      };

      const res = await fetch(`/api/admin/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '保存失败');

      toast(result.message || '考试已保存', result.restricted ? 'warning' : 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="编辑考试" />
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="编辑考试"
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/exams')}>
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Button>
        }
      />

      {!isFullyEditable && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800">考试已开放，部分设置不可修改</p>
            <p className="mt-0.5 text-xs text-amber-600">题目规则已锁定，仅可修改基本信息、时间窗口和考试设置。</p>
          </div>
        </div>
      )}

      <Tabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab} />

      {activeTab === 'basic' && (
        <TabBasicInfo
          title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          timeLimitMinutes={timeLimitMinutes} setTimeLimitMinutes={setTimeLimitMinutes}
          passScore={passScore} setPassScore={setPassScore}
          theoryWeight={theoryWeight} setTheoryWeight={setTheoryWeight}
          practicalWeight={practicalWeight} setPracticalWeight={setPracticalWeight}
          compositePassScore={compositePassScore} setCompositePassScore={setCompositePassScore}
          basicQuestionRatio={basicQuestionRatio} setBasicQuestionRatio={setBasicQuestionRatio}
          openAt={openAt} setOpenAt={setOpenAt}
          closeAt={closeAt} setCloseAt={setCloseAt}
          resultQueryOpenAt={resultQueryOpenAt} setResultQueryOpenAt={setResultQueryOpenAt}
          resultQueryCloseAt={resultQueryCloseAt} setResultQueryCloseAt={setResultQueryCloseAt}
          shuffleQuestions={shuffleQuestions} setShuffleQuestions={setShuffleQuestions}
          showCorrectAnswers={showCorrectAnswers} setShowCorrectAnswers={setShowCorrectAnswers}
          isPracticeMode={isPracticeMode} setIsPracticeMode={setIsPracticeMode}
          tabSwitchLimit={tabSwitchLimit} setTabSwitchLimit={setTabSwitchLimit}
          enableFaceAuth={enableFaceAuth} setEnableFaceAuth={setEnableFaceAuth}
          rules={rules} setRules={setRules}
          totalScore={totalScore}
          isFullyEditable={isFullyEditable}
          saving={saving}
          onSave={handleSave}
        />
      )}

      {activeTab === 'participants' && <TabParticipants examId={examId} />}
      {activeTab === 'scores' && <TabScores examId={examId} />}
    </div>
  );
}
