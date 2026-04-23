'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { ArrowLeft, AlertTriangle, Send } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionType, ExamData } from '@/types/exam';
import TabBasicInfo from './tabs/TabBasicInfo';
import TabParticipants from './tabs/TabParticipants';
import TabQuestions from './tabs/TabQuestions';
import TabScores from './tabs/TabScores';

interface QuestionRule {
  id?: string;
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  commonRatio: number;
}

const TABS_DRAFT = [
  { key: 'basic', label: '基本信息' },
  { key: 'questions', label: '题库管理' },
  { key: 'participants', label: '应考人员' },
];

const TABS_FULL = [
  { key: 'basic', label: '基本信息' },
  { key: 'questions', label: '题库管理' },
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
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [tabSwitchLimit, setTabSwitchLimit] = useState(3);
  const [enableFaceAuth, setEnableFaceAuth] = useState(false);

  // Exam status
  const [examStatus, setExamStatus] = useState<string>('DRAFT');
  const isFullyEditable = ['DRAFT', 'PUBLISHED'].includes(examStatus);

  // Publish
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);

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
      setShuffleOptions(exam.shuffleOptions);
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

  const fetchCounts = useCallback(async () => {
    try {
      const [qRes, pRes] = await Promise.all([
        fetch(`/api/admin/exams/${examId}/questions`),
        fetch(`/api/admin/exams/${examId}/participants`),
      ]);
      if (qRes.ok) {
        const qJson = await qRes.json();
        setQuestionCount(qJson.data?.total ?? 0);
      }
      if (pRes.ok) {
        const pJson = await pRes.json();
        setParticipantCount(Array.isArray(pJson.data) ? pJson.data.length : 0);
      }
    } catch { /* non-critical */ }
  }, [examId]);

  useEffect(() => {
    fetchExam();
    fetchCounts();
  }, [fetchExam, fetchCounts]);

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
        shuffleOptions,
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

  async function handlePublishClick() {
    await fetchCounts();
    setShowPublishDialog(true);
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/publish`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '发布失败');
      toast('考试已发布', 'success');
      setShowPublishDialog(false);
      setExamStatus(json.data?.status || 'PUBLISHED');
    } catch (err) {
      toast(err instanceof Error ? err.message : '发布失败', 'error');
    } finally {
      setPublishing(false);
    }
  }

  const totalQuestions = rules.reduce((sum, r) => sum + r.count, 0);

  const publishWarnings: string[] = [];
  if (!title.trim()) publishWarnings.push('考试标题未填写');
  if (rules.length === 0) publishWarnings.push('未设置题目规则');
  if (questionCount === 0) publishWarnings.push('尚未导入任何题目');
  if (participantCount === 0) publishWarnings.push('尚未导入应考人员');
  if (!openAt) publishWarnings.push('未设置考试开放时间');
  if (!closeAt) publishWarnings.push('未设置考试截止时间');

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
          <div className="flex items-center gap-2">
            {examStatus === 'DRAFT' && (
              <Button onClick={handlePublishClick}>
                <Send className="h-4 w-4" />
                发布考试
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/admin/exams')}>
              <ArrowLeft className="h-4 w-4" />
              返回列表
            </Button>
          </div>
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

      <Tabs tabs={examStatus === 'DRAFT' ? TABS_DRAFT : TABS_FULL} activeKey={activeTab} onChange={setActiveTab} />

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
          shuffleOptions={shuffleOptions} setShuffleOptions={setShuffleOptions}
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

      {activeTab === 'questions' && <TabQuestions examId={examId} />}
      {activeTab === 'participants' && <TabParticipants examId={examId} />}
      {activeTab === 'scores' && <TabScores examId={examId} />}

      {/* Publish confirmation dialog */}
      <Dialog
        open={showPublishDialog}
        onClose={() => setShowPublishDialog(false)}
        title="确认发布考试"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPublishDialog(false)} disabled={publishing}>
              取消
            </Button>
            <Button
              onClick={handlePublish}
              loading={publishing}
              disabled={publishWarnings.some((w) => w.includes('未设置题目规则') || w.includes('尚未导入应考人员'))}
            >
              <Send className="h-4 w-4" />
              确认发布
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {publishWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">请注意</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {publishWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <InfoRow label="考试标题" value={title || '(未填)'} />
            <InfoRow label="考试时长" value={`${timeLimitMinutes} 分钟`} />
            <InfoRow label="理论/实操权重" value={`${theoryWeight}% / ${practicalWeight}%`} />
            <InfoRow label="综合合格分" value={`${compositePassScore} 分`} />
            <InfoRow label="线上理论及格分" value={`${passScore} 分`} />
            <InfoRow label="基本题比例" value={`${basicQuestionRatio}%`} />
            <InfoRow
              label="考试时间"
              value={openAt && closeAt
                ? `${new Date(openAt).toLocaleString('zh-CN')} — ${new Date(closeAt).toLocaleString('zh-CN')}`
                : '(未设置)'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-center">
              <p className="text-xs text-stone-500">题目规则</p>
              <p className="text-lg font-bold text-stone-800">{totalQuestions} 题</p>
              {rules.map((r, i) => (
                <p key={i} className="text-xs text-stone-500">
                  {QUESTION_TYPE_LABELS[r.questionType]} {r.count} 题 × {r.pointsPerQuestion} 分
                </p>
              ))}
            </div>
            <div className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-center">
              <p className="text-xs text-stone-500">已导入</p>
              <p className="text-lg font-bold text-stone-800">{questionCount} 题</p>
              <p className="text-xs text-stone-500">{participantCount} 人</p>
            </div>
          </div>

          <p className="text-xs text-stone-400">
            发布后考试将变为「待开放」状态，指定员工可在考试时间内作答。
          </p>
        </div>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-stone-500 shrink-0">{label}</span>
      <span className="font-medium text-stone-800 text-right">{value}</span>
    </div>
  );
}
