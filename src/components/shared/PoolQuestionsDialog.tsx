'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Loader2 } from 'lucide-react';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';

interface PoolQuestion {
  id: string;
  content: string;
  category: string;
  process: string | null;
  level: string | null;
}

interface Props {
  examId: string | null;
  open: boolean;
  onClose: () => void;
  process: string | null;
  level: string | null;
  type: string | null;
}

/** 查看「某工序/级别/题型」会从哪些题里抽的实际题目列表（基本/专业分页） */
export function PoolQuestionsDialog({ examId, open, onClose, process, level, type }: Props) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<PoolQuestion[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [tab, setTab] = useState<'PROFESSIONAL' | 'BASIC'>('PROFESSIONAL');

  useEffect(() => {
    if (!open || !examId || !type) return;
    setLoading(true);
    const params = new URLSearchParams({ type });
    if (process) params.set('process', process);
    if (level) params.set('level', level);
    fetch(`/api/admin/exams/${examId}/pool-questions?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setQuestions(j.data.questions);
          setTruncated(j.data.truncated);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, examId, process, level, type]);

  const prof = useMemo(() => questions.filter((q) => q.category === 'PROFESSIONAL'), [questions]);
  const basic = useMemo(() => questions.filter((q) => q.category === 'BASIC'), [questions]);

  // 默认停在有题目的那个分页
  useEffect(() => {
    if (prof.length === 0 && basic.length > 0) setTab('BASIC');
    else setTab('PROFESSIONAL');
  }, [prof.length, basic.length]);

  const typeLabel = type ? (QUESTION_TYPE_LABELS[type as keyof typeof QUESTION_TYPE_LABELS] || type) : '';
  const list = tab === 'PROFESSIONAL' ? prof : basic;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`抽题池题目 — ${typeLabel} · ${process || '—'} / ${level || '—'}`}
    >
      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-stone-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : questions.length === 0 ? (
        <p className="py-10 text-center text-sm text-stone-400">此条件下暂无可抽题目</p>
      ) : (
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('PROFESSIONAL')}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${tab === 'PROFESSIONAL' ? 'bg-purple-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
            >
              专业题（{prof.length}）
            </button>
            <button
              type="button"
              onClick={() => setTab('BASIC')}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${tab === 'BASIC' ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
            >
              基本题（{basic.length}）
            </button>
            {truncated && <span className="ml-auto self-center text-xs text-stone-400">仅显示前 500 题</span>}
          </div>

          {list.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">此分类暂无题目</p>
          ) : (
            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
              {list.map((q, i) => (
                <div key={q.id} className="flex items-start gap-2 rounded-lg border border-stone-100 bg-stone-50/50 px-3 py-2">
                  <span className="mt-0.5 w-6 shrink-0 text-right text-xs text-stone-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-sm leading-relaxed text-stone-700">{q.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
