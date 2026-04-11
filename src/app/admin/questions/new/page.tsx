'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { DEPARTMENTS, QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { QuestionType } from '@/types/exam';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const QUESTION_TYPE_OPTIONS = Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));

const LEVEL_OPTIONS = [
  { value: '一级题库', label: '一级题库' },
  { value: '二级题库', label: '二级题库' },
  { value: '三级题库', label: '三级题库' },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function CreateQuestionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Common fields
  const [questionType, setQuestionType] = useState<QuestionType>('SINGLE_CHOICE');
  const [content, setContent] = useState('');
  const [department, setDepartment] = useState<string>(DEPARTMENTS[0]);
  const [level, setLevel] = useState('一级题库');
  const [role, setRole] = useState('');
  const [points, setPoints] = useState(2);

  // MC options
  const [options, setOptions] = useState([
    { label: 'A', content: '' },
    { label: 'B', content: '' },
    { label: 'C', content: '' },
    { label: 'D', content: '' },
  ]);
  const [correctOptions, setCorrectOptions] = useState<Set<string>>(new Set());

  // TF
  const [tfAnswer, setTfAnswer] = useState<'true' | 'false'>('true');

  // SA / CASE / PRACTICAL
  const [referenceAnswer, setReferenceAnswer] = useState('');
  const [gradingRubric, setGradingRubric] = useState('');

  // FILL
  const [fillAnswer, setFillAnswer] = useState('');

  function addOption() {
    if (options.length >= 6) return;
    const nextLabel = OPTION_LABELS[options.length];
    setOptions((prev) => [...prev, { label: nextLabel, content: '' }]);
  }

  function removeOption(index: number) {
    if (options.length <= 2) return;
    const removed = options[index];
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setCorrectOptions((prev) => {
      const next = new Set(prev);
      next.delete(removed.label);
      return next;
    });
  }

  function updateOption(index: number, value: string) {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, content: value } : opt))
    );
  }

  function toggleCorrect(label: string) {
    setCorrectOptions((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function buildCorrectAnswer(): string | null {
    switch (questionType) {
      case 'SINGLE_CHOICE':
      case 'MULTI_CHOICE':
        return Array.from(correctOptions).sort().join(',') || null;
      case 'TRUE_FALSE':
        return tfAnswer === 'true' ? '是' : '否';
      case 'FILL_BLANK':
        return fillAnswer || null;
      default:
        return null;
    }
  }

  async function handleSave() {
    if (!content.trim()) {
      toast('请输入题目内容', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: questionType,
        content: content.trim(),
        department,
        level,
        role: role.trim(),
        points,
        difficulty: 1,
        correctAnswer: buildCorrectAnswer(),
        isMultiSelect: questionType === 'MULTI_CHOICE',
        referenceAnswer:
          ['SHORT_ANSWER', 'CASE_ANALYSIS', 'PRACTICAL'].includes(questionType)
            ? referenceAnswer.trim() || null
            : null,
        gradingRubric:
          ['SHORT_ANSWER', 'CASE_ANALYSIS', 'PRACTICAL'].includes(questionType)
            ? gradingRubric.trim() || null
            : null,
        options:
          questionType === 'SINGLE_CHOICE' || questionType === 'MULTI_CHOICE'
            ? options.map((opt, idx) => ({
                label: opt.label,
                content: opt.content,
                sortOrder: idx,
              }))
            : [],
      };

      const res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      toast('题目已创建', 'success');
      router.push('/admin/questions');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  const isMC = questionType === 'SINGLE_CHOICE' || questionType === 'MULTI_CHOICE';
  const isTF = questionType === 'TRUE_FALSE';
  const isSA = ['SHORT_ANSWER', 'CASE_ANALYSIS', 'PRACTICAL'].includes(questionType);
  const isFill = questionType === 'FILL_BLANK';

  return (
    <div className="space-y-6">
      <PageHeader
        title="新建题目"
        actions={
          <Button variant="ghost" onClick={() => router.push('/admin/questions')}>
            返回列表
          </Button>
        }
      />

      {/* Common fields */}
      <Card title="基本信息">
        <div className="space-y-4">
          <Select
            label="题型"
            options={QUESTION_TYPE_OPTIONS}
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as QuestionType)}
          />

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">题目内容</label>
            <textarea
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入题目内容"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Select
              label="部门"
              options={DEPARTMENT_OPTIONS}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
            <Select
              label="级别"
              options={LEVEL_OPTIONS}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
            <Input
              label="角色"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="例如：仓管员"
            />
            <Input
              label="分值"
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              min={1}
            />
          </div>
        </div>
      </Card>

      {/* MC options */}
      {isMC && (
        <Card title="选项">
          <div className="space-y-3">
            {options.map((opt, idx) => (
              <div key={opt.label} className="flex items-center gap-3">
                <label className="flex items-center gap-2 shrink-0">
                  <input
                    type={questionType === 'MULTI_CHOICE' ? 'checkbox' : 'radio'}
                    name="correct-option"
                    checked={correctOptions.has(opt.label)}
                    onChange={() => {
                      if (questionType === 'SINGLE_CHOICE') {
                        setCorrectOptions(new Set([opt.label]));
                      } else {
                        toggleCorrect(opt.label);
                      }
                    }}
                    className="h-4 w-4 text-teal-600 border-stone-300"
                  />
                  <span className="text-sm font-medium text-stone-700 w-4">{opt.label}</span>
                </label>
                <Input
                  value={opt.content}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`选项 ${opt.label} 内容`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="text-sm text-red-500 hover:text-red-700 shrink-0"
                  >
                    删除
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button variant="secondary" size="sm" onClick={addOption}>
                添加选项
              </Button>
            )}
            <p className="text-xs text-stone-500">
              {questionType === 'SINGLE_CHOICE'
                ? '选择一个正确答案'
                : '可选择多个正确答案'}
            </p>
          </div>
        </Card>
      )}

      {/* TF answer */}
      {isTF && (
        <Card title="正确答案">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="tf-answer"
                value="true"
                checked={tfAnswer === 'true'}
                onChange={() => setTfAnswer('true')}
                className="h-4 w-4 text-teal-600 border-stone-300"
              />
              <span className="text-sm text-stone-700">是（正确）</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="tf-answer"
                value="false"
                checked={tfAnswer === 'false'}
                onChange={() => setTfAnswer('false')}
                className="h-4 w-4 text-teal-600 border-stone-300"
              />
              <span className="text-sm text-stone-700">否（错误）</span>
            </label>
          </div>
        </Card>
      )}

      {/* SA / CASE / PRACTICAL */}
      {isSA && (
        <Card title="参考答案与评分标准">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">参考答案</label>
              <textarea
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
                rows={4}
                value={referenceAnswer}
                onChange={(e) => setReferenceAnswer(e.target.value)}
                placeholder="输入参考答案"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">评分标准</label>
              <textarea
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
                rows={3}
                value={gradingRubric}
                onChange={(e) => setGradingRubric(e.target.value)}
                placeholder="输入评分标准"
              />
            </div>
          </div>
        </Card>
      )}

      {/* FILL */}
      {isFill && (
        <Card title="正确答案">
          <Input
            label="填空答案"
            value={fillAnswer}
            onChange={(e) => setFillAnswer(e.target.value)}
            placeholder="输入正确答案"
          />
        </Card>
      )}

      {/* Save */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <Button variant="secondary" onClick={() => router.push('/admin/questions')}>
          取消
        </Button>
        <Button onClick={handleSave} loading={saving}>
          保存题目
        </Button>
      </div>
    </div>
  );
}
