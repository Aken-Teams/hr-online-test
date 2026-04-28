'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { Step1Data } from './Step1BasicInfo';
import type { QuestionRule } from './Step2QuestionRules';
import { AlertTriangle } from 'lucide-react';

interface FileResult {
  filename: string;
  rows: number;
  created: number;
  replaced: number;
  byType?: Record<string, number>;
  error?: string;
}

interface Participant {
  id: string;
  department: string | null;
  process: string | null;
  level: string | null;
  user: { name: string; department: string } | null;
}

interface Props {
  step1: Step1Data;
  rules: QuestionRule[];
  questionResults: FileResult[];
  participants: Participant[];
}

export default function Step5Confirm({ step1, rules, questionResults, participants }: Props) {
  const totalScore = rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0);
  const totalQuestions = rules.reduce((sum, r) => sum + r.count, 0);
  const questionImportCount = questionResults.reduce((sum, r) => sum + r.created, 0);

  const questionByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of questionResults) {
      if (!r.byType) continue;
      for (const [type, count] of Object.entries(r.byType)) {
        map[type] = (map[type] || 0) + count;
      }
    }
    return map;
  }, [questionResults]);

  const participantByDept = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of participants) {
      const dept = p.department || p.user?.department || '未知部门';
      map[dept] = (map[dept] || 0) + 1;
    }
    return map;
  }, [participants]);

  const warnings: string[] = [];
  if (!step1.title.trim()) warnings.push('考试标题未填写');
  if (rules.length === 0) warnings.push('未设置题目规则');
  if (questionImportCount === 0) warnings.push('尚未导入任何题目');
  if (participants.length === 0) warnings.push('尚未导入应考人员');
  if (!step1.openAt) warnings.push('未设置考试开放时间');
  if (!step1.closeAt) warnings.push('未设置考试截止时间');

  const fmt = (v: string) => new Date(v).toLocaleString('zh-CN');

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">请注意以下事项</h3>
          </div>
          <ul className="list-disc list-inside space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Card title="考试摘要">
        <div className="space-y-5">
          {/* Title + Duration row */}
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-lg font-bold text-stone-800 truncate">{step1.title || '(未填)'}</h3>
            <span className="shrink-0 text-sm text-stone-500">{step1.timeLimitMinutes} 分钟</span>
          </div>

          {/* Key numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBlock label="总分" value={`${totalScore}`} unit="分" />
            <StatBlock label="线上理论及格分" value={`${step1.passScore}`} unit="分" />
            <StatBlock label="综合合格分" value={`${step1.compositePassScore}`} unit="分" />
            <StatBlock label="基本题比例" value={`${step1.basicQuestionRatio}`} unit="%" />
          </div>

          {/* Weight bar */}
          <div>
            <p className="text-xs text-stone-500 mb-1.5">权重配比</p>
            <div className="flex h-7 rounded-lg overflow-hidden text-xs font-medium">
              <div className="flex items-center justify-center bg-teal-100 text-teal-700" style={{ width: `${step1.theoryWeight}%` }}>
                理论 {step1.theoryWeight}%
              </div>
              <div className="flex items-center justify-center bg-amber-100 text-amber-700" style={{ width: `${step1.practicalWeight}%` }}>
                实操 {step1.practicalWeight}%
              </div>
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-500 mb-0.5">考试时间</p>
              <p className="text-sm font-medium text-stone-800">
                {step1.openAt && step1.closeAt ? `${fmt(step1.openAt)} — ${fmt(step1.closeAt)}` : '(未设置)'}
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-500 mb-0.5">成绩查询时间</p>
              <p className="text-sm font-medium text-stone-800">
                {step1.resultQueryOpenAt
                  ? `${fmt(step1.resultQueryOpenAt)}${step1.resultQueryCloseAt ? ` — ${fmt(step1.resultQueryCloseAt)}` : ' 起'}`
                  : '(未设置)'}
              </p>
            </div>
          </div>

          {/* Batches */}
          {step1.batches.length > 0 && (
            <div className="rounded-lg bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-500 mb-1.5">梯次安排（{step1.batches.length} 个）</p>
              <div className="space-y-1">
                {step1.batches.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-stone-700">{b.name}</span>
                    <span className="text-stone-500">{b.openAt ? fmt(b.openAt) : ''} — {b.closeAt ? fmt(b.closeAt) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings tags */}
          <div className="flex flex-wrap gap-2">
            <Tag label="随机出题" active={step1.shuffleQuestions} />
            <Tag label="随机选项" active={step1.shuffleOptions} />
            <Tag label="显示正确答案" active={step1.showCorrectAnswers} />
            <Tag label="练习模式" active={step1.isPracticeMode} />
            {step1.tabSwitchLimit > 0 && (
              <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                切屏限制 {step1.tabSwitchLimit} 次
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card title={`题目规则 — 共 ${totalQuestions} 题，${totalScore} 分`}>
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-2.5">
              <span className="text-sm font-medium text-stone-700">
                {QUESTION_TYPE_LABELS[r.questionType]}
              </span>
              <span className="text-sm text-stone-600">
                {r.count} 题 × {r.pointsPerQuestion} 分 = <span className="font-semibold text-stone-800">{r.count * r.pointsPerQuestion} 分</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title={`题库 — ${questionImportCount} 题已导入`}>
          {Object.keys(questionByType).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(questionByType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm text-stone-600">{QUESTION_TYPE_LABELS[type as keyof typeof QUESTION_TYPE_LABELS] || type}</span>
                  <span className="text-sm font-semibold text-stone-800">{count} 题</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">尚未导入题目</p>
          )}
        </Card>

        <Card title={`应考人员 — ${participants.length} 人已分配`}>
          {Object.keys(participantByDept).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(participantByDept)
                .sort(([, a], [, b]) => b - a)
                .map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between">
                    <span className="text-sm text-stone-600">{dept}</span>
                    <span className="text-sm font-semibold text-stone-800">{count} 人</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">尚未导入人员</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatBlock({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2 text-center">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-stone-800">
        {value}<span className="text-sm font-normal text-stone-500 ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

function Tag({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
      active ? 'bg-teal-50 text-teal-700' : 'bg-stone-100 text-stone-400 line-through'
    }`}>
      {label}
    </span>
  );
}
