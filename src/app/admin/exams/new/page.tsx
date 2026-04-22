'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Plus, Trash2, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useToast } from '@/components/ui/Toast';
import { DEPARTMENTS, QUESTION_TYPE_LABELS, EXAM_QUESTION_TYPES } from '@/lib/constants';
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

const QUESTION_TYPE_OPTIONS = EXAM_QUESTION_TYPES.map((type) => ({
  value: type,
  label: QUESTION_TYPE_LABELS[type],
}));

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function CreateExamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  function selectAllDepartments() {
    setSelectedDepartments((prev) =>
      prev.length === DEPARTMENTS.length ? [] : [...DEPARTMENTS]
    );
  }

  async function handleSave(publish: boolean) {
    if (!title.trim()) {
      toast('请输入考试标题', 'warning');
      return;
    }

    if (publish) {
      // 待开放：必须完整填写
      const missing: string[] = [];
      if (rules.length === 0) missing.push('题目规则');
      if (selectedDepartments.length === 0) missing.push('指派部门');
      if (!openAt) missing.push('开放开始时间');
      if (!closeAt) missing.push('开放结束时间');
      if (missing.length > 0) {
        toast(`请完善以下必填项：${missing.join('、')}`, 'warning');
        return;
      }
      if (new Date(closeAt) <= new Date(openAt)) {
        toast('开放结束时间必须晚于开始时间', 'warning');
        return;
      }
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

      toast(publish ? '考试已创建，待开放' : '考试草稿已保存', 'success');
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

      {/* ================================================================= */}
      {/* Section 1: 基本信息 + 时间 (merged into one card, 2-col grid)     */}
      {/* ================================================================= */}
      <Card title={<>基本信息</>}>
        <div className="space-y-4">
          {/* Row: title + description */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Input
                label="考试标题"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：2026年4月技能考核"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="时长(分钟)"
                required
                type="number"
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                min={1}
              />
              <Input
                label="及格分"
                required
                type="number"
                value={passScore}
                onChange={(e) => setPassScore(Number(e.target.value))}
                min={0}
              />
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">总分</label>
                <div className="flex h-[38px] items-center rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-800">
                  {totalScore}
                </div>
              </div>
            </div>
          </div>

          {/* Row: description */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">考试描述</label>
            <textarea
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="考试说明（可选）"
            />
          </div>

          {/* Row: open time */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="考试开放时间"
              required
              type="datetime-local"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
            />
            <Input
              label="考试截止时间"
              required
              type="datetime-local"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
            />
            <Input
              label="成绩开放时间"
              type="datetime-local"
              value={resultQueryOpenAt}
              onChange={(e) => setResultQueryOpenAt(e.target.value)}
            />
            <Input
              label="成绩截止时间"
              type="datetime-local"
              value={resultQueryCloseAt}
              onChange={(e) => setResultQueryCloseAt(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* ================================================================= */}
      {/* Section 2: 题目规则                                                */}
      {/* ================================================================= */}
      <Card title={<>题目规则<span className="ml-0.5 text-red-500">*</span></>} className="overflow-visible">
        <div className="space-y-3">
          {/* Header row */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_80px_80px_100px_40px] sm:gap-3 sm:px-1">
            <span className="text-xs font-medium text-stone-400">题型</span>
            <span className="text-xs font-medium text-stone-400">数量</span>
            <span className="text-xs font-medium text-stone-400">每题分值</span>
            <span className="text-xs font-medium text-stone-400">通用题(%)</span>
            <span />
          </div>
          {rules.map((rule, idx) => (
            <div key={idx} className="rounded-lg border border-stone-100 bg-stone-50/50 p-3 sm:p-0 sm:border-0 sm:bg-transparent">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_80px_80px_100px_40px] sm:gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <CustomSelect
                    label={idx === 0 && rules.length === 1 ? undefined : undefined}
                    options={QUESTION_TYPE_OPTIONS}
                    value={rule.questionType}
                    onChange={(val) => updateRule(idx, 'questionType', val as QuestionType)}
                  />
                </div>
                <Input
                  type="number"
                  value={rule.count}
                  onChange={(e) => updateRule(idx, 'count', Number(e.target.value))}
                  min={1}
                />
                <Input
                  type="number"
                  value={rule.pointsPerQuestion}
                  onChange={(e) => updateRule(idx, 'pointsPerQuestion', Number(e.target.value))}
                  min={1}
                />
                <Input
                  type="number"
                  value={rule.commonRatio}
                  onChange={(e) => updateRule(idx, 'commonRatio', Number(e.target.value))}
                  min={0}
                  max={100}
                />
                <button
                  type="button"
                  onClick={() => removeRule(idx)}
                  className="flex h-[38px] items-center justify-center rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={addRule}
              className="flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              <Plus className="h-4 w-4" />
              添加规则
            </button>
            <span className="text-sm text-stone-500">
              总分：<span className="font-semibold text-stone-800">{totalScore}</span> 分
            </span>
          </div>
        </div>
      </Card>

      {/* ================================================================= */}
      {/* Section 3: 指派范围                                                */}
      {/* ================================================================= */}
      <Card title={<>指派部门<span className="ml-0.5 text-red-500">*</span></>}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500">
              已选 {selectedDepartments.length}/{DEPARTMENTS.length} 个部门
            </p>
            <button
              type="button"
              onClick={selectAllDepartments}
              className="text-xs font-medium text-teal-600 hover:text-teal-700"
            >
              {selectedDepartments.length === DEPARTMENTS.length ? '取消全选' : '全选'}
            </button>
          </div>
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

      {/* ================================================================= */}
      {/* Section 4: 高级设置 (collapsible)                                  */}
      {/* ================================================================= */}
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between px-4 py-3 sm:px-6 sm:py-4"
        >
          <h3 className="text-base font-semibold text-stone-800">高级设置</h3>
          <ChevronDown className={`h-5 w-5 text-stone-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>
        {showAdvanced && (
          <div className="border-t border-stone-100 px-4 py-3 sm:px-6 sm:py-4 space-y-5">
            {/* Toggles - compact 2-col grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ToggleRow label="随机出题" description="题目顺序随机打乱" checked={shuffleQuestions} onChange={setShuffleQuestions} />
              <ToggleRow label="显示正确答案" description="提交后展示正确答案" checked={showCorrectAnswers} onChange={setShowCorrectAnswers} />
              <ToggleRow label="练习模式" description="不计入正式成绩" checked={isPracticeMode} onChange={setIsPracticeMode} />
              <ToggleRow label="人脸验证" description="考前人脸识别" checked={enableFaceAuth} onChange={setEnableFaceAuth} />
            </div>

            {/* Tab switch limit */}
            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-stone-700">切屏限制</p>
                <p className="text-xs text-stone-500">最大切屏次数，0 = 不限制</p>
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
        )}
      </div>

      {/* ================================================================= */}
      {/* Actions                                                            */}
      {/* ================================================================= */}
      <div className="flex items-center justify-end gap-2 pb-6 sm:gap-3">
        <Button variant="secondary" onClick={() => handleSave(false)} loading={saving}>
          保存草稿
        </Button>
        <Button onClick={() => handleSave(true)} loading={saving}>
          保存待开放
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
    <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-3">
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
