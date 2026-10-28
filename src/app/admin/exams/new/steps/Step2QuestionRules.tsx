'use client';

import { useState, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import type { Step1Data } from './Step1BasicInfo';
import { Input } from '@/components/ui/Input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { QUESTION_TYPE_LABELS, EXAM_QUESTION_TYPES } from '@/lib/constants';
import type { QuestionType } from '@/types/exam';

export interface QuestionRule {
  questionType: QuestionType;
  count: number;
  pointsPerQuestion: number;
  commonRatio: number;
}

export const DEFAULT_RULE: QuestionRule = {
  questionType: 'SINGLE_CHOICE',
  count: 10,
  pointsPerQuestion: 2,
  commonRatio: 0,
};

const QUESTION_TYPE_OPTIONS = EXAM_QUESTION_TYPES.map((type) => ({
  value: type,
  label: QUESTION_TYPE_LABELS[type],
}));

interface Props {
  rules: QuestionRule[];
  onChange: (rules: QuestionRule[]) => void;
  shuffleQuestions?: boolean;
  basicData: Step1Data;
  onBasicChange: (data: Step1Data) => void;
}

export default function Step2QuestionRules({ rules, onChange, shuffleQuestions = true, basicData, onBasicChange }: Props) {
  const setBasic = (key: keyof Step1Data, val: number) => onBasicChange({ ...basicData, [key]: val });
  const totalScore = useMemo(
    () => rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0),
    [rules]
  );
  // 客观题 / 简答题 分值拆解（简答题需人工阅卷，其余自动评分）
  const breakdown = useMemo(() => {
    let objective = 0, essay = 0;
    for (const r of rules) {
      const pts = r.count * r.pointsPerQuestion;
      if (r.questionType === 'SHORT_ANSWER') essay += pts;
      else objective += pts;
    }
    return { objective, essay };
  }, [rules]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  function addRule() {
    onChange([...rules, { ...DEFAULT_RULE }]);
  }

  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  function updateRule(index: number, field: keyof QuestionRule, value: string | number) {
    onChange(rules.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  const canDrag = !shuffleQuestions && rules.length > 1;

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIndex(idx);
    dragNodeRef.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
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
      onChange(updated);
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
    <div className="space-y-6">
    <Card title={<>题目规则<span className="ml-0.5 text-red-500">*</span></>} className="overflow-visible">
      <div className="space-y-3">
        {canDrag && (
          <p className="text-xs text-amber-600">未开启随机出题，规则顺序即为出题顺序，可拖拽调整。</p>
        )}
        <div className="hidden sm:grid sm:grid-cols-[1fr_80px_80px_40px] sm:gap-3 sm:px-1">
          <span className="text-xs font-medium text-stone-400">题型</span>
          <span className="text-xs font-medium text-stone-400">数量</span>
          <span className="text-xs font-medium text-stone-400">每题分值</span>
          <span />
        </div>
        {rules.map((rule, idx) => (
          <div
            key={idx}
            draggable={canDrag}
            onDragStart={canDrag ? (e) => handleDragStart(e, idx) : undefined}
            onDragOver={canDrag ? (e) => handleDragOver(e, idx) : undefined}
            onDrop={canDrag ? (e) => handleDrop(e, idx) : undefined}
            onDragEnd={canDrag ? handleDragEnd : undefined}
            className={`rounded-lg border bg-stone-50/50 p-3 sm:p-0 sm:bg-transparent transition-colors ${
              dragOverIndex === idx && dragIndex !== idx
                ? 'border-teal-400 bg-teal-50/50 sm:bg-teal-50/50'
                : 'border-stone-100 sm:border-0'
            }`}
          >
            <div className="flex items-center gap-2">
              {canDrag && (
                <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-700">{idx + 1}</span>
                  <GripVertical className="h-4 w-4 text-stone-300" />
                </div>
              )}
              <div className="flex-1 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_80px_80px_40px] sm:gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <CustomSelect
                    options={QUESTION_TYPE_OPTIONS}
                    value={rule.questionType}
                    onChange={(val) => updateRule(idx, 'questionType', val as QuestionType)}
                  />
                  {rule.questionType === 'SHORT_ANSWER' ? (
                    <span className="mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-700">简答题 · 需人工阅卷</span>
                  ) : (
                    <span className="mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-teal-50 text-teal-700">客观题 · 自动评分</span>
                  )}
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

    <Card title="权重与配比">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Input
          label="理论权重(%)"
          required
          type="number"
          value={basicData.theoryWeight}
          onChange={(e) => {
            const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
            onBasicChange({ ...basicData, theoryWeight: val, practicalWeight: 100 - val });
          }}
          min={0}
          max={100}
        />
        <Input
          label="实操权重(%)"
          required
          type="number"
          value={basicData.practicalWeight}
          onChange={(e) => {
            const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
            onBasicChange({ ...basicData, practicalWeight: val, theoryWeight: 100 - val });
          }}
          min={0}
          max={100}
        />
        {basicData.practicalWeight > 0 ? (
          <Input
            label="综合合格分"
            required
            type="number"
            value={basicData.compositePassScore}
            onChange={(e) => setBasic('compositePassScore', Number(e.target.value))}
            min={0}
          />
        ) : (
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-stone-400">综合合格分</label>
            <div className="flex items-center rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-400" title="本场无实操，综合合格分不适用">—</div>
          </div>
        )}
        <Input
          label="基本题比例(%)"
          required
          type="number"
          value={basicData.basicQuestionRatio}
          onChange={(e) => setBasic('basicQuestionRatio', Number(e.target.value))}
          min={0}
          max={100}
        />
      </div>
      <div className="mt-3 space-y-1 rounded-lg border border-teal-200 bg-teal-50/50 px-4 py-3.5 text-sm leading-relaxed text-stone-700">
        <p className="mb-1.5 text-[15px] font-semibold text-teal-800">本场成绩计算（依上方设定实时更新）</p>
        {/* 线上理论总分 = 客观 + 简答 */}
        <p>
          <span className="text-stone-500">① 线上理论总分 =</span>{' '}
          {breakdown.objective > 0 && <>客观题 {breakdown.objective} 分</>}
          {breakdown.objective > 0 && breakdown.essay > 0 && ' + '}
          {breakdown.essay > 0 && <>简答题 {breakdown.essay} 分（需人工阅卷）</>}
          {totalScore === 0 && <span className="text-amber-600">尚未设定题目规则</span>}
          {totalScore > 0 && <> = <strong className="text-stone-900">{totalScore} 分</strong></>}
        </p>
        {/* 基本 / 专业 */}
        <p>
          <span className="text-stone-500">② 每条规则抽题 =</span>{' '}
          {basicData.basicQuestionRatio > 0
            ? <>基本题 {basicData.basicQuestionRatio}%（全公司共用）+ 专业题 {100 - basicData.basicQuestionRatio}%（按工序/级别）</>
            : <>全部专业题（按工序/级别），<span className="text-stone-400">本场无基本题</span></>}
        </p>
        {/* 综合成绩 */}
        <p>
          <span className="text-stone-500">③ 综合成绩 =</span>{' '}
          {basicData.practicalWeight > 0
            ? <>线上 × {basicData.theoryWeight}% + 实操 × {basicData.practicalWeight}%，综合 ≥ {basicData.compositePassScore} 分合格</>
            : <>线上理论总分（<span className="text-stone-400">本场无实操</span>，理论占 100%）</>}
        </p>
        {/* 及格线 */}
        <p>
          <span className="text-stone-500">④ 合格线 =</span>{' '}
          线上理论 ≥ <strong className="text-stone-900">{basicData.passScore} 分</strong>
          <span className="text-stone-400">（在第 1 步「线上理论及格分」设定）</span>
          {basicData.practicalWeight > 0 && <>，综合 ≥ {basicData.compositePassScore} 分</>}
        </p>
        {totalScore > 0 && basicData.passScore > totalScore && (
          <p className="font-medium text-amber-600">
            注意：及格分 {basicData.passScore} 高于总分 {totalScore}，将无人能及格——请到第 1 步调低「线上理论及格分」，或增加题目分值。
          </p>
        )}
      </div>
    </Card>
    </div>
  );
}
