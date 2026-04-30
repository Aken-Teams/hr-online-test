'use client';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useState, useRef } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { QUESTION_TYPE_LABELS, EXAM_QUESTION_TYPES } from '@/lib/constants';
import type { QuestionType } from '@/types/exam';
import type { BatchInput } from '@/app/admin/exams/new/steps/Step1BasicInfo';

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

interface Props {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  timeLimitMinutes: number;
  setTimeLimitMinutes: (v: number) => void;
  passScore: number;
  setPassScore: (v: number) => void;
  theoryWeight: number;
  setTheoryWeight: (v: number) => void;
  practicalWeight: number;
  setPracticalWeight: (v: number) => void;
  compositePassScore: number;
  setCompositePassScore: (v: number) => void;
  basicQuestionRatio: number;
  setBasicQuestionRatio: (v: number) => void;
  openAt: string;
  setOpenAt: (v: string) => void;
  closeAt: string;
  setCloseAt: (v: string) => void;
  resultQueryOpenAt: string;
  setResultQueryOpenAt: (v: string) => void;
  resultQueryCloseAt: string;
  setResultQueryCloseAt: (v: string) => void;
  shuffleQuestions: boolean;
  setShuffleQuestions: (v: boolean) => void;
  shuffleOptions: boolean;
  setShuffleOptions: (v: boolean) => void;
  showCorrectAnswers: boolean;
  setShowCorrectAnswers: (v: boolean) => void;
  isPracticeMode: boolean;
  setIsPracticeMode: (v: boolean) => void;
  tabSwitchLimit: number;
  setTabSwitchLimit: (v: number) => void;
  enableFaceAuth: boolean;
  setEnableFaceAuth: (v: boolean) => void;
  rules: QuestionRule[];
  setRules: (rules: QuestionRule[]) => void;
  batches: BatchInput[];
  setBatches: (batches: BatchInput[]) => void;
  /** Number of existing batches from server (before any local additions) */
  existingBatchCount: number;
  totalScore: number;
  isFullyEditable: boolean;
  isArchived?: boolean;
  saving: boolean;
  onSave: () => void;
}

export default function TabBasicInfo(props: Props) {
  const {
    title, setTitle, description, setDescription,
    timeLimitMinutes, setTimeLimitMinutes, passScore, setPassScore,
    theoryWeight, setTheoryWeight, practicalWeight, setPracticalWeight,
    compositePassScore, setCompositePassScore, basicQuestionRatio, setBasicQuestionRatio,
    openAt, setOpenAt, closeAt, setCloseAt,
    resultQueryOpenAt, setResultQueryOpenAt, resultQueryCloseAt, setResultQueryCloseAt,
    shuffleQuestions, setShuffleQuestions, shuffleOptions, setShuffleOptions,
    showCorrectAnswers, setShowCorrectAnswers,
    isPracticeMode, setIsPracticeMode, tabSwitchLimit, setTabSwitchLimit,
    enableFaceAuth, setEnableFaceAuth,
    rules, setRules, batches, setBatches, existingBatchCount, totalScore, isFullyEditable, isArchived, saving, onSave,
  } = props;

  function addRule() {
    setRules([...rules, { questionType: 'SINGLE_CHOICE', count: 10, pointsPerQuestion: 2, commonRatio: 0 }]);
  }

  function removeRule(idx: number) {
    setRules(rules.filter((_, i) => i !== idx));
  }

  function updateRule(idx: number, field: keyof QuestionRule, value: string | number) {
    setRules(rules.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  const canDragRules = !shuffleQuestions && rules.length > 1 && !isArchived;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIndex(idx);
    dragNodeRef.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => {
      if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.5';
    });
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && idx !== dragIndex) {
      setDragOverIndex(idx);
    }
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) {
      const updated = [...rules];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(idx, 0, moved);
      setRules(updated);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '1';
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div className={`space-y-6 ${isArchived ? 'pointer-events-none opacity-75' : ''}`}>
      <Card title="基本信息">
        <div className="space-y-4">
          <Input label="考试标题" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">考试描述</label>
            <textarea
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input label="时长(分钟)" type="number" value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(Number(e.target.value))} min={1} />
            <Input label="线上理论及格分" type="number" value={passScore} onChange={(e) => setPassScore(Number(e.target.value))} min={0} />
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">总分</label>
              <div className="flex h-[38px] items-center rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold">{totalScore}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="权重与配比">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Input label="理论权重(%)" type="number" value={theoryWeight} onChange={(e) => { const v = Number(e.target.value); setTheoryWeight(v); setPracticalWeight(100 - v); }} min={0} max={100} />
          <Input label="实操权重(%)" type="number" value={practicalWeight} onChange={(e) => { const v = Number(e.target.value); setPracticalWeight(v); setTheoryWeight(100 - v); }} min={0} max={100} />
          <Input label="综合合格分" type="number" value={compositePassScore} onChange={(e) => setCompositePassScore(Number(e.target.value))} min={0} />
          <Input label="基本题比例(%)" type="number" value={basicQuestionRatio} onChange={(e) => setBasicQuestionRatio(Number(e.target.value))} min={0} max={100} />
        </div>
      </Card>

      <Card title="时间设置">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="考试开放时间" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
          <Input label="考试截止时间" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
          <Input label="成绩开放时间" type="datetime-local" value={resultQueryOpenAt} onChange={(e) => setResultQueryOpenAt(e.target.value)} />
          <Input label="成绩截止时间" type="datetime-local" value={resultQueryCloseAt} onChange={(e) => setResultQueryCloseAt(e.target.value)} />
        </div>
      </Card>

      <Card title="梯次设置（可选）">
        <p className="text-xs text-stone-500 mb-3">
          将考试分为多个时段，每个梯次只在指定时间窗口内允许开考。不设梯次则使用上方的考试开放/截止时间。
        </p>
        {batches.length > 0 && openAt && closeAt && (
          <p className="text-xs text-amber-600 mb-3">
            梯次时间必须在考试开放时间（{new Date(openAt).toLocaleString('zh-CN')}）至截止时间（{new Date(closeAt).toLocaleString('zh-CN')}）之间
          </p>
        )}
        {!isFullyEditable && !isArchived && (
          <p className="text-xs text-amber-600 mb-3">
            考试进行中，已开始的梯次不可修改，未开始的梯次仍可编辑。
          </p>
        )}
        <div className="space-y-3">
          {batches.map((batch, idx) => {
            const isExisting = idx < existingBatchCount;
            // Use string comparison to avoid timezone ambiguity with datetime-local values
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
            const batchStarted = isExisting && batch.openAt && batch.openAt <= nowStr;
            const locked = isExisting && !isFullyEditable && !!batchStarted;
            // For active exams, only enforce closeAt as max (don't restrict min)
            const batchMin = isFullyEditable ? (openAt || undefined) : undefined;
            const batchMax = closeAt || undefined;
            return (
              <div key={idx} className={`grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_40px] items-end ${locked ? 'pointer-events-none opacity-60' : ''}`}>
                <Input
                  label={idx === 0 ? '梯次名称' : undefined}
                  value={batch.name}
                  onChange={(e) => {
                    const updated = [...batches];
                    updated[idx] = { ...batch, name: e.target.value };
                    setBatches(updated);
                  }}
                  placeholder={`第${idx + 1}梯次`}
                />
                <Input
                  label={idx === 0 ? '开始时间' : undefined}
                  type="datetime-local"
                  value={batch.openAt}
                  min={batchMin}
                  max={batchMax}
                  onChange={(e) => {
                    const updated = [...batches];
                    updated[idx] = { ...batch, openAt: e.target.value };
                    setBatches(updated);
                  }}
                />
                <Input
                  label={idx === 0 ? '结束时间' : undefined}
                  type="datetime-local"
                  value={batch.closeAt}
                  min={batchMin}
                  max={batchMax}
                  onChange={(e) => {
                    const updated = [...batches];
                    updated[idx] = { ...batch, closeAt: e.target.value };
                    setBatches(updated);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setBatches(batches.filter((_, i) => i !== idx))}
                  className="flex h-[38px] items-center justify-center rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          {!isArchived && (
            <button
              type="button"
              onClick={() => setBatches([...batches, { name: `第${batches.length + 1}梯次`, openAt: '', closeAt: '' }])}
              className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              <Plus className="h-4 w-4" />
              添加梯次
            </button>
          )}
        </div>
      </Card>

      <Card title="考试设置">
        <div className="space-y-4">
          <ToggleRow label="随机出题" description="题目顺序随机打乱" checked={shuffleQuestions} onChange={setShuffleQuestions} />
          <ToggleRow label="随机选项" description="选项 A/B/C/D 顺序随机" checked={shuffleOptions} onChange={setShuffleOptions} />
          <ToggleRow label="显示正确答案" description="提交后展示正确答案" checked={showCorrectAnswers} onChange={setShowCorrectAnswers} />
          <ToggleRow label="练习模式" description="不限作答次数" checked={isPracticeMode} onChange={setIsPracticeMode} />
          {/* 人脸验证功能已隐藏 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-700">切屏限制</p>
              <p className="text-xs text-stone-500">最大切屏次数，0 = 不限制</p>
            </div>
            <input type="number" className="w-20 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-center focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500" value={tabSwitchLimit} onChange={(e) => setTabSwitchLimit(Number(e.target.value))} min={0} />
          </div>
        </div>
      </Card>

      <Card title={isFullyEditable ? '题目规则' : '题目规则（已锁定）'} className="overflow-visible">
        <div className="space-y-3">
          {canDragRules && (
            <p className="text-xs text-amber-600">
              {isFullyEditable ? '未开启随机出题，规则顺序即为出题顺序，可拖拽调整。' : '未开启随机出题，可拖拽调整出题顺序（仅影响新考生）。'}
            </p>
          )}
          {rules.map((rule, idx) => (
            <div
              key={idx}
              draggable={canDragRules}
              onDragStart={canDragRules ? (e) => handleDragStart(e, idx) : undefined}
              onDragOver={canDragRules ? (e) => handleDragOver(e, idx) : undefined}
              onDrop={canDragRules ? (e) => handleDrop(e, idx) : undefined}
              onDragEnd={canDragRules ? handleDragEnd : undefined}
              className={`flex items-center gap-2 rounded-lg border p-2 transition-colors ${
                dragOverIndex === idx && dragIndex !== idx
                  ? 'border-teal-400 bg-teal-50/50'
                  : 'border-stone-100 bg-stone-50/30'
              }`}
            >
              {canDragRules && (
                <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-700">{idx + 1}</span>
                  <GripVertical className="h-4 w-4 text-stone-300" />
                </div>
              )}
              <div className={`flex-1 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_80px_80px_40px] ${!isFullyEditable ? 'pointer-events-none opacity-60' : ''}`}>
                <div className="col-span-2 sm:col-span-1">
                  <CustomSelect options={QUESTION_TYPE_OPTIONS} value={rule.questionType} onChange={(v) => updateRule(idx, 'questionType', v as QuestionType)} />
                </div>
                <Input type="number" value={rule.count} onChange={(e) => updateRule(idx, 'count', Number(e.target.value))} min={1} />
                <Input type="number" value={rule.pointsPerQuestion} onChange={(e) => updateRule(idx, 'pointsPerQuestion', Number(e.target.value))} min={1} />
                <button type="button" onClick={() => removeRule(idx)} className="flex h-[38px] items-center justify-center rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">✕</button>
              </div>
            </div>
          ))}
          {isFullyEditable && (
            <button type="button" onClick={addRule} className="text-sm font-medium text-teal-600 hover:text-teal-700">+ 添加规则</button>
          )}
          <div className="text-sm text-stone-500">总分：<span className="font-semibold text-stone-800">{totalScore}</span> 分</div>
        </div>
      </Card>

      {!isArchived && (
        <div className="flex justify-end pb-6">
          <Button onClick={onSave} loading={saving}>保存修改</Button>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-stone-700">{label}</p>
        <p className="text-xs text-stone-500">{description}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-teal-600' : 'bg-stone-200'}`}>
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
