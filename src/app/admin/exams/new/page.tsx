'use client';

import { useState, useMemo, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useToast } from '@/components/ui/Toast';
import { DEPARTMENTS, QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionType } from '@/types/exam';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionRule {
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  commonRatio: number;
}

const EMPTY_RULE: QuestionRule = {
  questionType: 'SINGLE_CHOICE',
  count: 10,
  pointsPerQuestion: 2,
  commonRatio: 100,
};

const QUESTION_TYPE_OPTIONS = Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function CreateExamPage() {
  const router = useRouter();
  const { toast } = useToast();
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

  // Settings toggles
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [tabSwitchLimit, setTabSwitchLimit] = useState(3);
  const [enableFaceAuth, setEnableFaceAuth] = useState(false);

  // Question rules
  const [rules, setRules] = useState<QuestionRule[]>([{ ...EMPTY_RULE }]);

  // Assignment
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  // Auto-calculate total score
  const totalScore = useMemo(() => {
    return rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0);
  }, [rules]);

  function addRule() {
    setRules((prev) => [...prev, { ...EMPTY_RULE }]);
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

  async function handleSave(publish: boolean) {
    if (!title.trim()) {
      toast('请输入考试标题', 'warning');
      return;
    }

    if (rules.length === 0) {
      toast('请至少添加一条题目规则', 'warning');
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
        questionRules: rules,
        departments: selectedDepartments,
        status: publish ? 'PUBLISHED' : 'DRAFT',
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

      toast(publish ? '考试已创建并发布' : '考试草稿已保存', 'success');
      router.push('/admin/exams');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
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

      {/* Basic info */}
      <Card title="基本信息">
        <div className="space-y-4">
          <Input
            label="考试标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：2024年第一季度新员工入职考试"
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
        <Button variant="secondary" onClick={() => handleSave(false)} loading={saving}>
          保存草稿
        </Button>
        <Button onClick={() => handleSave(true)} loading={saving}>
          保存并发布
        </Button>
      </div>
    </div>
  );
}

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
