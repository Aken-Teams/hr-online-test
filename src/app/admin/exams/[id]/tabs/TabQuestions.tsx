'use client';

import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface FileResult {
  filename: string;
  parsed: { department: string; process: string; level: string } | null;
  rows: number;
  created: number;
  duplicates: number;
  error?: string;
}

interface QuestionSummary {
  total: number;
  byType: Record<string, number>;
}

interface Props {
  examId: string;
}

export default function TabQuestions({ examId }: Props) {
  const { toast } = useToast();
  const [results, setResults] = useState<FileResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<QuestionSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSummary();
  }, [examId]);

  async function fetchSummary() {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/questions`);
      if (res.ok) {
        const json = await res.json();
        setSummary(json.data ?? null);
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append('files', file);
      }

      const res = await fetch(`/api/admin/exams/${examId}/import-questions`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '导入失败');

      setResults((prev) => [...prev, ...(json.data.fileResults || [])]);
      toast(`成功导入 ${json.data.created} 题`, 'success');
      fetchSummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeleteAll() {
    if (!confirm('确定要删除该考试的所有题目吗？此操作不可恢复。')) return;
    try {
      const res = await fetch(`/api/admin/exams/${examId}/questions`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast('题目已全部删除', 'success');
      setSummary({ total: 0, byType: {} });
      setResults([]);
    } catch {
      toast('删除失败', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <Card title="导入题库">
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            上传题库 Excel 文件，文件名格式：
            <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">部门工序级别.xls</code>
            <span className="text-stone-400 mx-1">例：</span>
            <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">工务部SAWⅡ级.xls</code>
          </p>
          <p className="text-xs text-stone-500">
            系统会自动从文件名解析部门、工序、级别。文件名含「基本」或「基础」关键字则标记为基本题，否则为专业题。
          </p>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              loading={uploading}
            >
              <Upload className="h-4 w-4" />
              选择文件上传
            </Button>
            {uploading && (
              <span className="flex items-center gap-1 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                导入中...
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Question summary */}
      <Card title="题库概况">
        {loadingSummary ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-stone-800">
                {summary?.total ?? 0}
                <span className="ml-1 text-sm font-normal text-stone-500">题</span>
              </p>
              {(summary?.total ?? 0) > 0 && (
                <Button variant="outline" size="sm" onClick={handleDeleteAll}>
                  <Trash2 className="h-3.5 w-3.5" />
                  清空题库
                </Button>
              )}
            </div>
            {summary && summary.total > 0 && (
              <div className="flex flex-wrap gap-3">
                {Object.entries(summary.byType).map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700"
                  >
                    {type}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Import results */}
      {results.length > 0 && (
        <Card title="导入记录">
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-stone-100 bg-stone-50/50 p-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-stone-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{r.filename}</p>
                  {r.parsed && (
                    <p className="text-xs text-stone-500">
                      {r.parsed.department} / {r.parsed.process} / {r.parsed.level}
                    </p>
                  )}
                  {r.error ? (
                    <p className="text-xs text-red-600 mt-0.5">{r.error}</p>
                  ) : (
                    <p className="text-xs text-stone-500 mt-0.5">
                      {r.rows} 题解析，{r.created} 题导入，{r.duplicates} 题重复跳过
                    </p>
                  )}
                </div>
                {r.error ? (
                  <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
