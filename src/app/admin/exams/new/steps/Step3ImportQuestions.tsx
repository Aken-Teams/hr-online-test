'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { FileClassificationDialog } from '@/components/shared/FileClassificationDialog';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';

type Category = 'BASIC' | 'PROFESSIONAL';

interface FileResult {
  filename: string;
  parsed: { department: string; process: string; level: string } | null;
  rows: number;
  created: number;
  duplicates: number;
  byType?: Record<string, number>;
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

  // Classification dialog state
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !examId) return;

    const validFiles: File[] = [];
    for (const f of Array.from(files)) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext === 'xls' || ext === 'xlsx') {
        validFiles.push(f);
      }
    }

    if (validFiles.length > 0) {
      setPendingFiles(validFiles);
      setDialogOpen(true);
    }

    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleClassificationConfirm(classifications: Map<string, Category>) {
    setDialogOpen(false);
    if (!examId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of pendingFiles) {
        formData.append('files', file);
      }
      const classObj: Record<string, string> = {};
      for (const [name, cat] of classifications) {
        classObj[name] = cat;
      }
      formData.append('classifications', JSON.stringify(classObj));

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
      setPendingFiles([]);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="导入题库">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-stone-600">
                上传题库 Excel 文件，系统会自动解析题目内容。
              </p>
              <p className="mt-1 text-xs text-stone-500">
                选择文件后需先分类（基本知识/专业知识），确认后再上传。
              </p>
            </div>

            {!examId ? (
              <p className="shrink-0 text-xs text-amber-600">请先保存草稿</p>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xls,.xlsx"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? '导入中...' : '选择文件上传'}
                </Button>
              </div>
            )}
          </div>
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
                    <div className="mt-0.5">
                      <p className="text-xs text-stone-500">
                        {r.rows} 题解析，{r.created} 题导入，{r.duplicates} 题重复跳过
                      </p>
                      {r.byType && Object.keys(r.byType).length > 0 && (
                        <p className="text-xs text-stone-400 mt-0.5">
                          {Object.entries(r.byType)
                            .map(([type, count]) => `${QUESTION_TYPE_LABELS[type as keyof typeof QUESTION_TYPE_LABELS] || type} ${count}`)
                            .join('、')}
                        </p>
                      )}
                    </div>
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

      {/* Classification dialog */}
      <FileClassificationDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setPendingFiles([]);
        }}
        files={pendingFiles}
        onConfirm={handleClassificationConfirm}
      />
    </div>
  );
}
