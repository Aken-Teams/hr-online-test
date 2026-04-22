'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import Stepper, { type StepDef } from '@/components/ui/Stepper';
import Step1BasicInfo, { DEFAULT_STEP1, type Step1Data } from './steps/Step1BasicInfo';
import Step2QuestionRules, { DEFAULT_RULE, type QuestionRule } from './steps/Step2QuestionRules';
import Step3ImportQuestions from './steps/Step3ImportQuestions';
import Step4ImportParticipants from './steps/Step4ImportParticipants';
import Step5Confirm from './steps/Step5Confirm';

const STEPS: StepDef[] = [
  { key: 'basic', label: '基本信息' },
  { key: 'rules', label: '题目规则' },
  { key: 'questions', label: '导入题库' },
  { key: 'participants', label: '导入人员' },
  { key: 'confirm', label: '确认创建' },
];

export default function CreateExamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 data
  const [step1, setStep1] = useState<Step1Data>({ ...DEFAULT_STEP1 });

  // Step 2 data
  const [rules, setRules] = useState<QuestionRule[]>([{ ...DEFAULT_RULE }]);

  // Exam ID (created as draft at step 2→3 transition)
  const [examId, setExamId] = useState<string | null>(null);

  // Step 3 data (import results)
  const [questionResults, setQuestionResults] = useState<Array<{
    filename: string;
    parsed: { department: string; process: string; level: string; author: string } | null;
    rows: number;
    created: number;
    duplicates: number;
    error?: string;
  }>>([]);

  // Step 4 data (participants)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [participants, setParticipants] = useState<any[]>([]);

  const totalScore = useMemo(
    () => rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0),
    [rules]
  );

  const questionImportCount = useMemo(
    () => questionResults.reduce((sum, r) => sum + r.created, 0),
    [questionResults]
  );

  /**
   * Save the exam as draft (called when transitioning from step 2 to step 3).
   * Returns the exam ID.
   */
  async function saveAsDraft(): Promise<string | null> {
    if (examId) return examId; // Already created

    if (!step1.title.trim()) {
      toast('请输入考试标题', 'warning');
      return null;
    }
    if (rules.length === 0) {
      toast('至少需要一条题目规则', 'warning');
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        title: step1.title.trim(),
        description: step1.description.trim() || null,
        timeLimitMinutes: step1.timeLimitMinutes,
        passScore: step1.passScore,
        totalScore,
        openAt: step1.openAt || null,
        closeAt: step1.closeAt || null,
        resultQueryOpenAt: step1.resultQueryOpenAt || null,
        resultQueryCloseAt: step1.resultQueryCloseAt || null,
        shuffleQuestions: step1.shuffleQuestions,
        shuffleOptions: step1.shuffleQuestions,
        showCorrectAnswers: step1.showCorrectAnswers,
        showResultImmediately: true,
        isPracticeMode: step1.isPracticeMode,
        tabSwitchLimit: step1.tabSwitchLimit,
        enableFaceAuth: step1.enableFaceAuth,
        theoryWeight: step1.theoryWeight / 100,
        practicalWeight: step1.practicalWeight / 100,
        compositePassScore: step1.compositePassScore,
        basicQuestionRatio: step1.basicQuestionRatio / 100,
        maxAttempts: 1,
        questionRules: rules.map((r) => ({
          ...r,
          commonRatio: r.commonRatio / 100,
        })),
        status: 'DRAFT',
      };

      const res = await fetch('/api/admin/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      const json = await res.json();
      const id = json.data.id;
      setExamId(id);
      toast('草稿已保存', 'success');
      return id;
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Publish the exam (final step).
   */
  async function handlePublish() {
    if (!examId) {
      toast('考试尚未保存', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: step1.title.trim(),
        description: step1.description.trim() || null,
        timeLimitMinutes: step1.timeLimitMinutes,
        passScore: step1.passScore,
        totalScore,
        openAt: step1.openAt || null,
        closeAt: step1.closeAt || null,
        resultQueryOpenAt: step1.resultQueryOpenAt || null,
        resultQueryCloseAt: step1.resultQueryCloseAt || null,
        shuffleQuestions: step1.shuffleQuestions,
        shuffleOptions: step1.shuffleQuestions,
        showCorrectAnswers: step1.showCorrectAnswers,
        showResultImmediately: true,
        isPracticeMode: step1.isPracticeMode,
        tabSwitchLimit: step1.tabSwitchLimit,
        enableFaceAuth: step1.enableFaceAuth,
        theoryWeight: step1.theoryWeight / 100,
        practicalWeight: step1.practicalWeight / 100,
        compositePassScore: step1.compositePassScore,
        basicQuestionRatio: step1.basicQuestionRatio / 100,
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '发布失败');
      }

      // Update status to PUBLISHED
      await fetch(`/api/admin/exams/${examId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PUBLISHED' }),
      });

      toast('考试已创建，待开放', 'success');
      router.push('/admin/exams');
    } catch (err) {
      toast(err instanceof Error ? err.message : '发布失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    if (currentStep === 0) {
      if (!step1.title.trim()) {
        toast('请输入考试标题', 'warning');
        return;
      }
    }
    if (currentStep === 1) {
      if (rules.length === 0) {
        toast('至少需要一条题目规则', 'warning');
        return;
      }
      // Auto-save draft when moving to step 3
      const id = await saveAsDraft();
      if (!id) return;
    }
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handlePrev() {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="创建考试"
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/exams')}>
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Button>
        }
      />

      <Stepper
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={(idx) => {
          if (idx < currentStep) setCurrentStep(idx);
        }}
        className="mb-8"
      />

      {/* Step content */}
      {currentStep === 0 && <Step1BasicInfo data={step1} onChange={setStep1} />}
      {currentStep === 1 && <Step2QuestionRules rules={rules} onChange={setRules} />}
      {currentStep === 2 && (
        <Step3ImportQuestions examId={examId} results={questionResults} onResults={setQuestionResults} />
      )}
      {currentStep === 3 && (
        <Step4ImportParticipants examId={examId} participants={participants} onParticipantsChange={setParticipants} />
      )}
      {currentStep === 4 && (
        <Step5Confirm
          step1={step1}
          rules={rules}
          questionImportCount={questionImportCount}
          participantCount={participants.length}
        />
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pb-6">
        <div>
          {currentStep > 0 && (
            <Button variant="outline" onClick={handlePrev}>
              <ArrowLeft className="h-4 w-4" />
              上一步
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentStep < STEPS.length - 1 && (
            <Button onClick={handleNext} loading={saving}>
              下一步
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {currentStep === STEPS.length - 1 && (
            <>
              <Button variant="secondary" onClick={() => router.push('/admin/exams')} loading={saving}>
                <Save className="h-4 w-4" />
                保存草稿
              </Button>
              <Button onClick={handlePublish} loading={saving}>
                确认创建（待开放）
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
