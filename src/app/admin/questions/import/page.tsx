'use client';

import { useState, useRef, useEffect, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, FileSpreadsheet, CheckCircle, XCircle, Loader2, Upload, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Select } from '@/components/ui/Select';
import { FileClassificationDialog } from '@/components/shared/FileClassificationDialog';
import { partitionFilesByClassification } from '@/lib/excel-client';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = 'BASIC' | 'PROFESSIONAL';

interface ParsedMeta {
  department?: string | null;
  process?: string | null;
  level?: string | null;
}

interface FileResult {
  status: 'pending' | 'uploading' | 'done' | 'error';
  created?: number;
  replaced?: number;
  totalRows?: number;
  byType?: Record<string, number>;
  parsed?: ParsedMeta | null;
  error?: string;
}

interface ExamOption {
  id: string;
  title: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  BASIC: '基本知识',
  PROFESSIONAL: '专业知识',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function QuestionImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Exam selection
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');

  const [files, setFiles] = useState<File[]>([]);
  const [fileCategories, setFileCategories] = useState<Map<string, Category>>(new Map());
  const [fileResults, setFileResults] = useState<Map<string, FileResult>>(new Map());
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Classification dialog
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Load exam list
  useEffect(() => {
    async function loadExams() {
      try {
        const res = await fetch('/api/admin/exams');
        if (!res.ok) return;
        const json = await res.json();
        const items = json.data?.items ?? json.data ?? [];
        setExams(
          items.map((e: { id: string; title: string }) => ({
            id: e.id,
            title: e.title,
          }))
        );
      } catch { /* ignore */ }
    }
    loadExams();
  }, []);

  async function handleNewFiles(newFiles: FileList | File[]) {
    if (!selectedExamId) {
      toast('请先选择关联考试', 'warning');
      return;
    }
    const validFiles: File[] = [];
    for (const f of Array.from(newFiles)) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xls' && ext !== 'xlsx') {
        toast(`${f.name}: 仅支持 .xls 和 .xlsx 格式`, 'warning');
        continue;
      }
      if (files.some((existing) => existing.name === f.name)) continue;
      validFiles.push(f);
    }
    if (validFiles.length === 0) return;

    // Detect which files already have per-row classification (exported files)
    const { withCategory, withoutCategory } = await partitionFilesByClassification(validFiles);

    // Files with built-in classification skip the dialog
    if (withCategory.length > 0) {
      setFiles((prev) => [...prev, ...withCategory]);
      // No file-level classification needed; backend reads per-row 分类
      toast(
        `${withCategory.length} 个文件已包含分类信息，无需手动分类`,
        'info'
      );
    }

    // Files without built-in classification go through the dialog
    if (withoutCategory.length > 0) {
      setPendingFiles(withoutCategory);
      setDialogOpen(true);
    }
  }

  function handleClassificationConfirm(classifications: Map<string, Category>) {
    setDialogOpen(false);
    setFiles((prev) => [...prev, ...pendingFiles]);
    setFileCategories((prev) => {
      const next = new Map(prev);
      for (const [name, cat] of classifications) {
        next.set(name, cat);
      }
      return next;
    });
    setPendingFiles([]);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setFileCategories((prev) => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
    setFileResults((prev) => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }

  function clearAll() {
    setFiles([]);
    setFileCategories(new Map());
    setFileResults(new Map());
  }

  async function handleImportAll() {
    if (files.length === 0 || !selectedExamId) return;
    setImporting(true);

    let totalCreated = 0;
    let totalReplaced = 0;

    // Build classifications JSON
    const classifications: Record<string, string> = {};
    for (const [name, cat] of fileCategories) {
      classifications[name] = cat;
    }

    // Upload all pending files in one batch to the exam-specific API
    const pendingFiles = files.filter((f) => {
      const r = fileResults.get(f.name);
      return !r || r.status === 'pending' || r.status === 'error';
    });

    // Mark all as uploading
    for (const file of pendingFiles) {
      setFileResults((prev) => new Map(prev).set(file.name, { status: 'uploading' }));
    }

    try {
      const formData = new FormData();
      for (const file of pendingFiles) {
        formData.append('files', file);
      }
      formData.append('classifications', JSON.stringify(classifications));

      const res = await fetch(`/api/admin/exams/${selectedExamId}/import-questions`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '导入失败');

      const data = json.data;
      totalCreated = data.created ?? 0;
      totalReplaced = data.replaced ?? 0;

      // Update per-file results
      for (const fr of data.fileResults ?? []) {
        const result: FileResult = {
          status: fr.error ? 'error' : 'done',
          created: fr.created ?? 0,
          replaced: fr.replaced ?? 0,
          totalRows: fr.rows ?? 0,
          byType: fr.byType,
          parsed: fr.parsed,
          error: fr.error,
        };
        setFileResults((prev) => new Map(prev).set(fr.filename, result));
      }
    } catch (err) {
      // Mark all pending as error
      for (const file of pendingFiles) {
        setFileResults((prev) =>
          new Map(prev).set(file.name, {
            status: 'error',
            error: err instanceof Error ? err.message : '导入失败',
          })
        );
      }
    }

    setImporting(false);
    const parts = [`全部完成：共导入 ${totalCreated} 题`];
    if (totalReplaced > 0) parts.push(`${totalReplaced} 题已覆盖`);
    toast(parts.join('，'), totalCreated > 0 ? 'success' : 'info');
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleNewFiles(e.dataTransfer.files);
    }
  }

  const pendingCount = files.filter((f) => {
    const r = fileResults.get(f.name);
    return !r || r.status === 'pending' || r.status === 'error';
  }).length;

  const doneCount = files.filter((f) => fileResults.get(f.name)?.status === 'done').length;

  const selectedExamTitle = exams.find((e) => e.id === selectedExamId)?.title;

  return (
    <div className="space-y-6">
      <PageHeader
        title="导入题库"
        description="从 Excel 文件批量导入题目到指定考试"
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/questions')}>
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Button>
        }
      />

      {/* Exam selection */}
      <Card title="选择关联考试" className="overflow-visible" contentClassName="overflow-visible">
        <div className="max-w-md">
          <Select
            label="关联考试"
            value={selectedExamId}
            onChange={(e) => {
              setSelectedExamId(e.target.value);
              setFileResults(new Map());
            }}
            options={exams.map((exam) => ({ value: exam.id, label: exam.title }))}
            placeholder="请选择考试"
          />
          <p className="mt-1.5 text-xs text-stone-400">
            导入的题目将关联到所选考试，系统会自动根据文件名解析部门、工序、级别
          </p>
        </div>
      </Card>

      {/* Upload zone */}
      <Card>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!selectedExamId) {
              toast('请先选择关联考试', 'warning');
              return;
            }
            fileInputRef.current?.click();
          }}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors ${
            !selectedExamId
              ? 'border-stone-200 bg-stone-50/50 cursor-not-allowed opacity-60'
              : dragOver
                ? 'border-teal-400 bg-teal-50/50'
                : 'border-stone-300 bg-stone-50/30 hover:border-gray-400'
          }`}
        >
          <Upload className="h-10 w-10 text-stone-400 mb-3" />
          <p className="text-sm font-medium text-stone-700">
            {selectedExamId
              ? '拖拽文件到此处，或点击选择文件'
              : '请先选择关联考试'}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            支持 .xls 和 .xlsx 格式，可同时选择多个文件
          </p>
          {selectedExamId && selectedExamTitle && (
            <p className="mt-2 text-xs font-medium text-teal-600">
              将导入到：{selectedExamTitle}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleNewFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />
        </div>
      </Card>

      {/* File list */}
      {files.length > 0 && (
        <Card
          title={`已选文件（${files.length} 个${doneCount > 0 ? `，${doneCount} 个已完成` : ''}）`}
        >
          <div className="space-y-2">
            {files.map((f) => {
              const result = fileResults.get(f.name);
              const cat = fileCategories.get(f.name);
              return (
                <div
                  key={f.name}
                  className="flex items-center gap-3 rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-2.5"
                >
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-stone-400" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-stone-800 truncate">{f.name}</p>
                      {cat && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            cat === 'BASIC'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {CATEGORY_LABEL[cat]}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-400">
                      <p>
                        {(f.size / 1024).toFixed(1)} KB
                        {result?.status === 'done' && (
                          <span className="ml-2 text-green-600">
                            {result.totalRows} 题解析，{result.created} 题导入
                            {(result.replaced ?? 0) > 0 && `，${result.replaced} 题已覆盖`}
                          </span>
                        )}
                        {result?.status === 'error' && (
                          <span className="ml-2 text-red-600">{result.error}</span>
                        )}
                      </p>
                      {/* Parsed filename metadata */}
                      {result?.status === 'done' && result.parsed && (
                        <p className="text-teal-600 mt-0.5">
                          {[
                            result.parsed.department && `部门: ${result.parsed.department}`,
                            result.parsed.process && `工序: ${result.parsed.process}`,
                            result.parsed.level && `级别: ${result.parsed.level}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '未从文件名解析到元数据'}
                        </p>
                      )}
                      {result?.status === 'done' && result.byType && Object.keys(result.byType).length > 0 && (
                        <p className="text-stone-400 mt-0.5">
                          {Object.entries(result.byType)
                            .map(([type, count]) => `${QUESTION_TYPE_LABELS[type as keyof typeof QUESTION_TYPE_LABELS] || type} ${count}`)
                            .join('、')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status indicator */}
                  {result?.status === 'uploading' && (
                    <Loader2 className="h-5 w-5 text-teal-500 animate-spin shrink-0" />
                  )}
                  {result?.status === 'done' && (
                    <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  )}
                  {result?.status === 'error' && (
                    <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                  )}

                  {/* Remove button (only when not importing) */}
                  {!importing && result?.status !== 'uploading' && (
                    <button
                      onClick={() => removeFile(f.name)}
                      className="p-1 text-stone-400 hover:text-red-500 transition-colors shrink-0"
                      title="移除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={importing}
            >
              清空列表
            </Button>
            <Button
              onClick={handleImportAll}
              loading={importing}
              disabled={pendingCount === 0 || !selectedExamId}
            >
              {doneCount > 0 && pendingCount > 0
                ? `继续导入 (${pendingCount} 个)`
                : `导入全部 (${pendingCount} 个)`}
            </Button>
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
