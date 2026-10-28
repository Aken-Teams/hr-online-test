'use client';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

export interface BatchInput {
  name: string;
  openAt: string;
  closeAt: string;
}

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
  showResultImmediately: boolean;
  isPracticeMode: boolean;
  tabSwitchLimit: number;
  forceSubmitOnTabSwitch: boolean;
  enableFaceAuth: boolean;
  batches: BatchInput[];
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
  showResultImmediately: true,
  isPracticeMode: false,
  tabSwitchLimit: 3,
  forceSubmitOnTabSwitch: true,
  enableFaceAuth: false,
  batches: [],
};

interface Props {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
}

/** 當前本地時間，格式 "YYYY-MM-DDTHH:mm"，供 datetime-local 的 min 與卡控使用 */
function nowLocalString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Step1BasicInfo({ data, onChange }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  function set<K extends keyof Step1Data>(key: K, value: Step1Data[K]) {
    onChange({ ...data, [key]: value });
  }

  /**
   * 時間卡控（含時分）：設定時間欄位後，依序強制
   *   考試開放 ≤ 考試截止 ≤ 成績開放 ≤ 成績截止
   * datetime-local 值格式 "YYYY-MM-DDTHH:mm" 可直接字串比較。
   * 選到比下限早的時間會自動吸附到下限，改前面的時間也會連動往後推。
   */
  function setTime(key: 'openAt' | 'closeAt' | 'resultQueryOpenAt' | 'resultQueryCloseAt', value: string) {
    const floor = nowLocalString();
    const m = { ...data, [key]: value };

    // 1) 不允許過去時間：任一時間早於當前時間都吸附到「現在」
    (['openAt', 'closeAt', 'resultQueryOpenAt', 'resultQueryCloseAt'] as const).forEach((k) => {
      if (m[k] && m[k] < floor) m[k] = floor;
    });

    // 2) 順序卡控：開放 ≤ 截止 ≤ 成績開放 ≤ 成績截止
    if (m.openAt && m.closeAt && m.closeAt < m.openAt) m.closeAt = m.openAt;
    const examEnd = m.closeAt || m.openAt;
    if (examEnd && m.resultQueryOpenAt && m.resultQueryOpenAt < examEnd) m.resultQueryOpenAt = examEnd;
    const resultStart = m.resultQueryOpenAt || examEnd;
    if (resultStart && m.resultQueryCloseAt && m.resultQueryCloseAt < resultStart) m.resultQueryCloseAt = resultStart;

    // 若使用者選到的時間被吸附修正，跳提示說明原因
    if (value && m[key] !== value) {
      if (value < floor) {
        toast('不能设定过去的时间，已调整为当前时间', 'warning');
      } else {
        const hint: Record<typeof key, string> = {
          openAt: '考试开放时间',
          closeAt: '考试截止时间不能早于开放时间',
          resultQueryOpenAt: '成绩开放时间不能早于考试截止时间',
          resultQueryCloseAt: '成绩截止时间不能早于成绩开放时间',
        };
        toast(`${hint[key]}，已自动调整`, 'warning');
      }
    }
    onChange(m);
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

      <Card title="时间设置">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="考试开放时间"
            required
            type="datetime-local"
            value={data.openAt}
            min={nowLocalString()}
            onChange={(e) => setTime('openAt', e.target.value)}
          />
          <Input
            label="考试截止时间"
            required
            type="datetime-local"
            value={data.closeAt}
            min={data.openAt || undefined}
            onChange={(e) => setTime('closeAt', e.target.value)}
          />
          <Input
            label="解析开放时间"
            type="datetime-local"
            value={data.resultQueryOpenAt}
            min={data.closeAt || data.openAt || undefined}
            onChange={(e) => setTime('resultQueryOpenAt', e.target.value)}
          />
          <Input
            label="解析截止时间"
            type="datetime-local"
            value={data.resultQueryCloseAt}
            min={data.resultQueryOpenAt || data.closeAt || data.openAt || undefined}
            onChange={(e) => setTime('resultQueryCloseAt', e.target.value)}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          <strong>总分</strong>由「高级设置 → 立即出分」控制，与下方时间无关。此处「解析开放时间」为选填，
          <strong>只管控</strong>错题解析、正确答案与个人报告（用时、正确率）：<strong>不设</strong>则默认不开放（考生只看得到总分）；
          <strong>设定后</strong>解析与报告仅在此时间窗口内开放查看。
        </p>
      </Card>

      <Card title="梯次设置（可选）">
        <p className="text-xs text-stone-500 mb-3">
          将考试分为多个时段，每个梯次只在指定时间窗口内允许开考。不设梯次则使用上方的考试开放/截止时间。
        </p>
        {data.batches.length > 0 && data.openAt && data.closeAt && (
          <p className="text-xs text-amber-600 mb-3">
            梯次时间必须在考试开放时间（{new Date(data.openAt).toLocaleString('zh-CN')}）至截止时间（{new Date(data.closeAt).toLocaleString('zh-CN')}）之间
          </p>
        )}
        <div className="space-y-3">
          {data.batches.map((batch, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_40px] items-end">
              <Input
                label={idx === 0 ? '梯次名称' : undefined}
                value={batch.name}
                onChange={(e) => {
                  const updated = [...data.batches];
                  updated[idx] = { ...batch, name: e.target.value };
                  set('batches', updated);
                }}
                placeholder={`第${idx + 1}梯次`}
              />
              <Input
                label={idx === 0 ? '开始时间' : undefined}
                type="datetime-local"
                value={batch.openAt}
                min={data.openAt || undefined}
                max={data.closeAt || undefined}
                onChange={(e) => {
                  const updated = [...data.batches];
                  updated[idx] = { ...batch, openAt: e.target.value };
                  set('batches', updated);
                }}
              />
              <Input
                label={idx === 0 ? '结束时间' : undefined}
                type="datetime-local"
                value={batch.closeAt}
                min={data.openAt || undefined}
                max={data.closeAt || undefined}
                onChange={(e) => {
                  const updated = [...data.batches];
                  updated[idx] = { ...batch, closeAt: e.target.value };
                  set('batches', updated);
                }}
              />
              <button
                type="button"
                onClick={() => set('batches', data.batches.filter((_, i) => i !== idx))}
                className="flex h-[38px] items-center justify-center rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set('batches', [...data.batches, { name: `第${data.batches.length + 1}梯次`, openAt: '', closeAt: '' }])}
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            <Plus className="h-4 w-4" />
            添加梯次
          </button>
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
              <ToggleRow label="立即出分" description="交卷后立即公布总分（客观题即时、简答题评分后更新）；关闭则总分等解析开放时才一并公布" checked={data.showResultImmediately} onChange={(v) => set('showResultImmediately', v)} />
              <ToggleRow label="显示正确答案" description="提交后展示正确答案" checked={data.showCorrectAnswers} onChange={(v) => set('showCorrectAnswers', v)} />
              <ToggleRow label="练习模式" description="不限作答次数" checked={data.isPracticeMode} onChange={(v) => set('isPracticeMode', v)} />
              {/* 人脸验证功能已隐藏 */}
            </div>
            <ToggleRow
              label="达上限强制交卷"
              description="关闭时仅提醒与记录，由人资依稽核纪录人工判定（手机黑屏不会被强制交卷）"
              checked={data.forceSubmitOnTabSwitch}
              onChange={(v) => set('forceSubmitOnTabSwitch', v)}
            />
            <div className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-stone-700">{data.forceSubmitOnTabSwitch ? '切屏限制' : '离开画面提醒门槛'}</p>
                <p className="text-xs text-stone-500">{data.forceSubmitOnTabSwitch ? '最大切屏次数，0 = 不限制' : '仅用于稽核统计，不会强制交卷'}</p>
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
