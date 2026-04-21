'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { DEPARTMENTS, QUESTION_TYPE_LABELS, EXAM_QUESTION_TYPES } from '@/lib/constants';
import type { QuestionType, ExamData } from '@/types/exam';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionRule {
  id?: string;
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  commonRatio: number;
}

const QUESTION_TYPE_OPTIONS = EXAM_QUESTION_TYPES.map((type) => ({
  value: type,
  label: QUESTION_TYPE_LABELS[type],
}));

// ---------------------------------------------------------------------------
// Toggle row helper
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-stone-700">{label}</p>
        <p className="text-xs text-stone-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-teal-600' : 'bg-stone-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function EditExamPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [passScore, setPassScore] = useState(60);

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

  // Question rules
  const [rules, setRules] = useState<QuestionRule[]>([]);

  // Assignment
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  const totalScore = useMemo(() => {
    return rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0);
  }, [rules]);

  // Load existing exam data
  const fetchExam = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/exams/${examId}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      const exam: ExamData = json.data;

      setTitle(exam.title);
      setDescription(exam.description || '');
      setTimeLimitMinutes(exam.timeLimitMinutes);
      setPassScore(exam.passScore);
      setShuffleQuestions(exam.shuffleQuestions);
      setShowCorrectAnswers(exam.showCorrectAnswers);
      setIsPracticeMode(exam.isPracticeMode);
      setTabSwitchLimit(exam.tabSwitchLimit);
      setEnableFaceAuth(exam.enableFaceAuth);
      setRules(
        exam.questionRules.map((r) => ({
          id: r.id,
          questionType: r.questionType,
          count: r.count,
          pointsPerQuestion: r.pointsPerQuestion,
          commonRatio: Math.round(r.commonRatio * 100),
        }))
      );

      // Load department assignments
      if (exam.assignments && Array.isArray(exam.assignments)) {
        const depts: string[] = [];
        for (const a of exam.assignments) {
          if (a.department) depts.push(a.department);
        }
        setSelectedDepartments([...new Set(depts)]);
      }

      if (exam.openAt) {
        setOpenAt(toLocalDatetime(exam.openAt));
      }
      if (exam.closeAt) {
        setCloseAt(toLocalDatetime(exam.closeAt));
      }
      if (exam.resultQueryOpenAt) {
        setResultQueryOpenAt(toLocalDatetime(exam.resultQueryOpenAt));
      }
      if (exam.resultQueryCloseAt) {
        setResultQueryCloseAt(toLocalDatetime(exam.resultQueryCloseAt));
      }
    } catch {
      toast('加载考试数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [examId, toast]);

  useEffect(() => {
    fetchExam();
  }, [fetchExam]);

  function toLocalDatetime(date: Date | string): string {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      { questionType: 'SINGLE_CHOICE', count: 10, pointsPerQuestion: 2, commonRatio: 100 },
    ]);
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRule(index: number, field: keyof QuestionRule, value: string | number) {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  function toggleDepartment(dept: string) {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  }

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
        assignments: selectedDepartments.map((d) => ({ department: d })),
      };

      const res = await fetch(`/api/admin/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      toast('考试已保存', 'success');
      router.push('/admin/exams');
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

      {/* Basic info */}
      <Card title="基本信息">
        <div className="space-y-4">
          <Input
            label="考试标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="考试标题"
          />
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">考试描述</label>
            <textarea
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="考试说明（可选）"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <Input
              label="时长（分钟）"
              type="number"
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
              min={1}
            />
            <Input
              label="及格分"
              type="number"
              value={passScore}
              onChange={(e) => setPassScore(Number(e.target.value))}
              min={0}
            />
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-stone-700 mb-1.5">总分（自动计算）</label>
              <div className="flex h-[38px] items-center rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-800">
                {totalScore}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Time windows — side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="考试开放时间">
          <p className="mb-3 text-xs text-stone-500">
            设置考试的开放和关闭时间。未设置则不限制考试时间窗口。
          </p>
          <div className="space-y-3">
            <Input
              label="开始时间"
              type="datetime-local"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
            />
            <Input
              label="结束时间"
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
            />
          </div>
        </Card>
        <Card title="成绩查询开放时间">
          <p className="mb-3 text-xs text-stone-500">
            设置考生可查看错题解析的时间段。未设置则跟随「显示正确答案」开关。
          </p>
          <div className="space-y-3">
            <Input
              label="开放时间"
              type="datetime-local"
              value={resultQueryOpenAt}
              onChange={(e) => setResultQueryOpenAt(e.target.value)}
            />
            <Input
              label="截止时间"
              type="datetime-local"
              value={resultQueryCloseAt}
              onChange={(e) => setResultQueryCloseAt(e.target.value)}
            />
          </div>
        </Card>
      </div>

      {/* Settings */}
      <Card title="考试设置">
        <div className="space-y-4">
          <ToggleRow
            label="随机出题"
            description="每位考生的题目顺序随机打乱"
            checked={shuffleQuestions}
            onChange={setShuffleQuestions}
          />
          <ToggleRow
            label="显示正确答案"
            description="提交后向考生展示正确答案"
            checked={showCorrectAnswers}
            onChange={setShowCorrectAnswers}
          />
          <ToggleRow
            label="练习模式"
            description="不计入正式成绩，可多次作答"
            checked={isPracticeMode}
            onChange={setIsPracticeMode}
          />
          <ToggleRow
            label="人脸验证"
            description="考试前进行人脸识别验证身份"
            checked={enableFaceAuth}
            onChange={setEnableFaceAuth}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-700">切屏限制</p>
              <p className="text-xs text-stone-500">允许的最大切屏次数，0 表示不限制</p>
            </div>
            <input
              type="number"
              className="w-20 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-center focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={tabSwitchLimit}
              onChange={(e) => setTabSwitchLimit(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
      </Card>

      {/* Question rules */}
      <Card title="题目规则" className="overflow-visible">
        <div className="space-y-4">
          {rules.map((rule, idx) => (
            <div key={idx} className="rounded-lg border border-stone-100 bg-stone-50/50 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <CustomSelect
                    label="题型"
                    options={QUESTION_TYPE_OPTIONS}
                    value={rule.questionType}
                    onChange={(val) => updateRule(idx, 'questionType', val as QuestionType)}
                  />
                </div>
                <Input
                  label="数量"
                  type="number"
                  value={rule.count}
                  onChange={(e) => updateRule(idx, 'count', Number(e.target.value))}
                  min={1}
                />
                <Input
                  label="每题分值"
                  type="number"
                  value={rule.pointsPerQuestion}
                  onChange={(e) => updateRule(idx, 'pointsPerQuestion', Number(e.target.value))}
                  min={1}
                />
                <Input
                  label="通用题占比(%)"
                  type="number"
                  value={rule.commonRatio}
                  onChange={(e) => updateRule(idx, 'commonRatio', Number(e.target.value))}
                  min={0}
                  max={100}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => removeRule(idx)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addRule}>
            添加规则
          </Button>
          <div className="text-sm text-stone-500">
            总分：<span className="font-semibold text-stone-800">{totalScore}</span> 分
          </div>
        </div>
      </Card>

      {/* Department assignment */}
      <Card title="指派范围">
        <div className="space-y-3">
          <p className="text-sm text-stone-500">选择参加考试的部门（不选则全部可参加）</p>
          <div className="flex flex-wrap gap-2">
            {DEPARTMENTS.map((dept) => {
              const selected = selectedDepartments.includes(dept);
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => toggleDepartment(dept)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                    selected
                      ? 'border-teal-300 bg-teal-50 text-teal-700'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {dept}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pb-6 sm:gap-3">
        <Button variant="secondary" onClick={() => router.push('/admin/exams')}>
          取消
        </Button>
        <Button onClick={handleSave} loading={saving}>
          保存修改
        </Button>
      </div>
    </div>
  );
}
