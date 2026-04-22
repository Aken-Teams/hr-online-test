'use client';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { QUESTION_TYPE_LABELS, EXAM_QUESTION_TYPES } from '@/lib/constants';
import type { QuestionType } from '@/types/exam';

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
  totalScore: number;
  isFullyEditable: boolean;
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
    shuffleQuestions, setShuffleQuestions, showCorrectAnswers, setShowCorrectAnswers,
    isPracticeMode, setIsPracticeMode, tabSwitchLimit, setTabSwitchLimit,
    enableFaceAuth, setEnableFaceAuth,
    rules, setRules, totalScore, isFullyEditable, saving, onSave,
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

  return (
    <div className="space-y-6">
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
            <Input label="及格分" type="number" value={passScore} onChange={(e) => setPassScore(Number(e.target.value))} min={0} />
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

      <Card title="考试设置">
        <div className="space-y-4">
          <ToggleRow label="随机出题" description="题目顺序随机打乱" checked={shuffleQuestions} onChange={setShuffleQuestions} />
          <ToggleRow label="显示正确答案" description="提交后展示正确答案" checked={showCorrectAnswers} onChange={setShowCorrectAnswers} />
          <ToggleRow label="练习模式" description="不计入正式成绩" checked={isPracticeMode} onChange={setIsPracticeMode} />
          <ToggleRow label="人脸验证" description="考前人脸识别" checked={enableFaceAuth} onChange={setEnableFaceAuth} />
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
        <div className={`space-y-3 ${!isFullyEditable ? 'pointer-events-none opacity-60' : ''}`}>
          {rules.map((rule, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_80px_80px_40px]">
              <div className="col-span-2 sm:col-span-1">
                <CustomSelect options={QUESTION_TYPE_OPTIONS} value={rule.questionType} onChange={(v) => updateRule(idx, 'questionType', v as QuestionType)} />
              </div>
              <Input type="number" value={rule.count} onChange={(e) => updateRule(idx, 'count', Number(e.target.value))} min={1} />
              <Input type="number" value={rule.pointsPerQuestion} onChange={(e) => updateRule(idx, 'pointsPerQuestion', Number(e.target.value))} min={1} />
              <button type="button" onClick={() => removeRule(idx)} className="flex h-[38px] items-center justify-center rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">✕</button>
            </div>
          ))}
          {isFullyEditable && (
            <button type="button" onClick={addRule} className="text-sm font-medium text-teal-600 hover:text-teal-700">+ 添加规则</button>
          )}
          <div className="text-sm text-stone-500">总分：<span className="font-semibold text-stone-800">{totalScore}</span> 分</div>
        </div>
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={onSave} loading={saving}>保存修改</Button>
      </div>
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
