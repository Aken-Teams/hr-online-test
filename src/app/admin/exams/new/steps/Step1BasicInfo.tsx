'use client';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface Step1Data {
  title: string;
  description: string;
  timeLimitMinutes: number;
  passScore: number;
  theoryWeight: number;
  practicalWeight: number;
  compositePassScore: number;
  basicQuestionRatio: number;
  openAt: string;
  closeAt: string;
  resultQueryOpenAt: string;
  resultQueryCloseAt: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: boolean;
  isPracticeMode: boolean;
  tabSwitchLimit: number;
  enableFaceAuth: boolean;
}

export const DEFAULT_STEP1: Step1Data = {
  title: '',
  description: '',
  timeLimitMinutes: 60,
  passScore: 60,
  theoryWeight: 40,
  practicalWeight: 60,
  compositePassScore: 90,
  basicQuestionRatio: 10,
  openAt: '',
  closeAt: '',
  resultQueryOpenAt: '',
  resultQueryCloseAt: '',
  shuffleQuestions: true,
  shuffleOptions: true,
  showCorrectAnswers: false,
  isPracticeMode: false,
  tabSwitchLimit: 3,
  enableFaceAuth: false,
};

interface Props {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
}

export default function Step1BasicInfo({ data, onChange }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function set<K extends keyof Step1Data>(key: K, value: Step1Data[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="space-y-6">
      <Card title="基本信息">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Input
                label="考试标题"
                required
                value={data.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="例如：2026年4月技能考核"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="时长(分钟)"
                required
                type="number"
                value={data.timeLimitMinutes}
                onChange={(e) => set('timeLimitMinutes', Number(e.target.value))}
                min={1}
              />
              <Input
                label="线上理论及格分"
                required
                type="number"
                value={data.passScore}
                onChange={(e) => set('passScore', Number(e.target.value))}
                min={0}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">考试描述</label>
            <textarea
              className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-0"
              rows={2}
              value={data.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="考试说明（可选）"
            />
          </div>
        </div>
      </Card>

      <Card title="权重与配比">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Input
            label="理论权重(%)"
            required
            type="number"
            value={data.theoryWeight}
            onChange={(e) => {
              const val = Number(e.target.value);
              set('theoryWeight', val);
              set('practicalWeight', 100 - val);
            }}
            min={0}
            max={100}
          />
          <Input
            label="实操权重(%)"
            required
            type="number"
            value={data.practicalWeight}
            onChange={(e) => {
              const val = Number(e.target.value);
              set('practicalWeight', val);
              set('theoryWeight', 100 - val);
            }}
            min={0}
            max={100}
          />
          <Input
            label="综合合格分"
            required
            type="number"
            value={data.compositePassScore}
            onChange={(e) => set('compositePassScore', Number(e.target.value))}
            min={0}
          />
          <Input
            label="基本题比例(%)"
            required
            type="number"
            value={data.basicQuestionRatio}
            onChange={(e) => set('basicQuestionRatio', Number(e.target.value))}
            min={0}
            max={100}
          />
        </div>
        <p className="mt-2 text-xs text-stone-500">
          综合成绩 = 线上分 × {data.theoryWeight}% + 实操分 × {data.practicalWeight}%，每题 {data.basicQuestionRatio}% 基本题 + {100 - data.basicQuestionRatio}% 专业题
        </p>
      </Card>

      <Card title="时间设置">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="考试开放时间"
            required
            type="datetime-local"
            value={data.openAt}
            onChange={(e) => set('openAt', e.target.value)}
          />
          <Input
            label="考试截止时间"
            required
            type="datetime-local"
            value={data.closeAt}
            onChange={(e) => set('closeAt', e.target.value)}
          />
          <Input
            label="成绩开放时间"
            type="datetime-local"
            value={data.resultQueryOpenAt}
            onChange={(e) => set('resultQueryOpenAt', e.target.value)}
          />
          <Input
            label="成绩截止时间"
            type="datetime-local"
            value={data.resultQueryCloseAt}
            onChange={(e) => set('resultQueryCloseAt', e.target.value)}
          />
        </div>
      </Card>

      {/* Advanced settings */}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ToggleRow label="随机出题" description="题目顺序随机打乱" checked={data.shuffleQuestions} onChange={(v) => set('shuffleQuestions', v)} />
              <ToggleRow label="随机选项" description="选项 A/B/C/D 顺序随机" checked={data.shuffleOptions} onChange={(v) => set('shuffleOptions', v)} />
              <ToggleRow label="显示正确答案" description="提交后展示正确答案" checked={data.showCorrectAnswers} onChange={(v) => set('showCorrectAnswers', v)} />
              <ToggleRow label="练习模式" description="不限作答次数" checked={data.isPracticeMode} onChange={(v) => set('isPracticeMode', v)} />
              {/* 人脸验证功能已隐藏 */}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-stone-700">切屏限制</p>
                <p className="text-xs text-stone-500">最大切屏次数，0 = 不限制</p>
              </div>
              <input
                type="number"
                className="w-20 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-center focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={data.tabSwitchLimit}
                onChange={(e) => set('tabSwitchLimit', Number(e.target.value))}
                min={0}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
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
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-teal-600' : 'bg-stone-200'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
