'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface FileResult {
  filename: string;
  parsed: { department: string; process: string; level: string } | null;
  rows: number;
  created: number;
  duplicates: number;
  error?: string;
}

interface Props {
  examId: string | null;
  results: FileResult[];
  onResults: (results: FileResult[]) => void;
}

export default function Step3ImportQuestions({ examId, results, onResults }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !examId) return;

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

      onResults([...results, ...(json.data.fileResults || [])]);
      toast(`成功导入 ${json.data.created} 题`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <Card title="导入题库">
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            上传题库 Excel 文件，文件名格式：<code className="text-xs bg-stone-100 px-1 py-0.5 rounded">部门工序级别.xls</code>
            <span className="text-stone-400 mx-1">例：</span>
            <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">工务部SAWⅡ级.xls</code>
          </p>
          <p className="text-xs text-stone-500">
            系统会自动从文件名解析部门、工序、级别。文件名含「基本」或「基础」关键字则标记为基本题，否则为专业题。
          </p>

          {!examId ? (
            <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-4 text-center">
              <p className="text-sm text-amber-700">请先完成步骤 1-2 并保存草稿后再导入题库</p>
            </div>
          ) : (
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
          )}
        </div>
      </Card>

      {results.length > 0 && (
        <Card title="导入结果">
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
