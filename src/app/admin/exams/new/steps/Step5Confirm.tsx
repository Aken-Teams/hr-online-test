'use client';

import { Card } from '@/components/ui/Card';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';
import type { Step1Data } from './Step1BasicInfo';
import type { QuestionRule } from './Step2QuestionRules';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  step1: Step1Data;
  rules: QuestionRule[];
  questionImportCount: number;
  participantCount: number;
}

export default function Step5Confirm({ step1, rules, questionImportCount, participantCount }: Props) {
  const totalScore = rules.reduce((sum, r) => sum + r.count * r.pointsPerQuestion, 0);
  const totalQuestions = rules.reduce((sum, r) => sum + r.count, 0);

  const warnings: string[] = [];
  if (!step1.title.trim()) warnings.push('考试标题未填写');
  if (rules.length === 0) warnings.push('未设置题目规则');
  if (questionImportCount === 0) warnings.push('尚未导入任何题目');
  if (participantCount === 0) warnings.push('尚未导入应考人员');
  if (!step1.openAt) warnings.push('未设置考试开放时间');
  if (!step1.closeAt) warnings.push('未设置考试截止时间');

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoRow label="考试标题" value={step1.title || '(未填)'} />
          <InfoRow label="考试时长" value={`${step1.timeLimitMinutes} 分钟`} />
          <InfoRow label="理论权重 / 实操权重" value={`${step1.theoryWeight}% / ${step1.practicalWeight}%`} />
          <InfoRow label="综合合格分" value={`${step1.compositePassScore} 分`} />
          <InfoRow label="基本题比例" value={`${step1.basicQuestionRatio}%`} />
          <InfoRow label="及格分(线上)" value={`${step1.passScore} 分`} />
          <InfoRow
            label="考试时间"
            value={step1.openAt && step1.closeAt
              ? `${new Date(step1.openAt).toLocaleString('zh-CN')} — ${new Date(step1.closeAt).toLocaleString('zh-CN')}`
              : '(未设置)'}
          />
          <InfoRow
            label="成绩查询时间"
            value={step1.resultQueryOpenAt
              ? `${new Date(step1.resultQueryOpenAt).toLocaleString('zh-CN')}${step1.resultQueryCloseAt ? ` — ${new Date(step1.resultQueryCloseAt).toLocaleString('zh-CN')}` : ' 起'}`
              : '(未设置)'}
          />
        </div>
      </Card>

      <Card title="题目规则">
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-2">
              <span className="text-sm font-medium text-stone-700">
                {QUESTION_TYPE_LABELS[r.questionType]}
              </span>
              <span className="text-sm text-stone-600">
                {r.count} 题 × {r.pointsPerQuestion} 分 = {r.count * r.pointsPerQuestion} 分
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-1 px-1 text-sm">
            <span className="text-stone-500">共 {totalQuestions} 题</span>
            <span className="font-semibold text-stone-800">总分 {totalScore} 分</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="题库">
          <div className="flex items-center gap-3">
            <CheckCircle2 className={`h-8 w-8 ${questionImportCount > 0 ? 'text-green-500' : 'text-stone-300'}`} />
            <div>
              <p className="text-2xl font-bold text-stone-800">{questionImportCount}</p>
              <p className="text-xs text-stone-500">题已导入</p>
            </div>
          </div>
        </Card>
        <Card title="应考人员">
          <div className="flex items-center gap-3">
            <CheckCircle2 className={`h-8 w-8 ${participantCount > 0 ? 'text-green-500' : 'text-stone-300'}`} />
            <div>
              <p className="text-2xl font-bold text-stone-800">{participantCount}</p>
              <p className="text-xs text-stone-500">人已分配</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-sm text-stone-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-stone-800 text-right">{value}</span>
    </div>
  );
}
