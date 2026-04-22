'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Plus, Trash2 } from 'lucide-react';
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
}

export default function Step2QuestionRules({ rules, onChange }: Props) {
  const totalScore = useMemo(
    () => rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0),
    [rules]
  );

  function addRule() {
    onChange([...rules, { ...DEFAULT_RULE }]);
  }

  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  function updateRule(index: number, field: keyof QuestionRule, value: string | number) {
    onChange(rules.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  return (
    <Card title={<>题目规则<span className="ml-0.5 text-red-500">*</span></>} className="overflow-visible">
      <div className="space-y-3">
        <div className="hidden sm:grid sm:grid-cols-[1fr_80px_80px_40px] sm:gap-3 sm:px-1">
          <span className="text-xs font-medium text-stone-400">题型</span>
          <span className="text-xs font-medium text-stone-400">数量</span>
          <span className="text-xs font-medium text-stone-400">每题分值</span>
          <span />
        </div>
        {rules.map((rule, idx) => (
          <div key={idx} className="rounded-lg border border-stone-100 bg-stone-50/50 p-3 sm:p-0 sm:border-0 sm:bg-transparent">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_80px_80px_40px] sm:gap-3">
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
