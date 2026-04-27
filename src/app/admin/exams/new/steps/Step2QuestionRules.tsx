'use client';

import { useState, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/Card';
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
}

export default function Step2QuestionRules({ rules, onChange, shuffleQuestions = true }: Props) {
  const totalScore = useMemo(
    () => rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0),
    [rules]
  );

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
  );
}
