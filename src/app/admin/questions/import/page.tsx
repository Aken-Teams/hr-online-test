'use client';

import { useState, useRef, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, FileSpreadsheet, CheckCircle, XCircle, Loader2, Upload, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { FileClassificationDialog } from '@/components/shared/FileClassificationDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = 'BASIC' | 'PROFESSIONAL';

interface FileResult {
  status: 'pending' | 'uploading' | 'done' | 'error';
  created?: number;
  duplicates?: number;
  skipped?: number;
  totalRows?: number;
  imagesAttached?: number;
  error?: string;
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

  const [files, setFiles] = useState<File[]>([]);
  const [fileCategories, setFileCategories] = useState<Map<string, Category>>(new Map());
  const [fileResults, setFileResults] = useState<Map<string, FileResult>>(new Map());
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Classification dialog
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleNewFiles(newFiles: FileList | File[]) {
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
    if (validFiles.length > 0) {
      setPendingFiles(validFiles);
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
    if (files.length === 0) return;
    setImporting(true);

    let totalCreated = 0;
    let totalDuplicates = 0;

    for (const file of files) {
      const existing = fileResults.get(file.name);
      if (existing?.status === 'done') continue;

      setFileResults((prev) => new Map(prev).set(file.name, { status: 'uploading' }));

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', fileCategories.get(file.name) || 'PROFESSIONAL');

        const res = await fetch('/api/admin/questions/import', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '导入失败');

        const result: FileResult = {
          status: 'done',
          created: json.data?.created ?? 0,
          duplicates: json.data?.duplicates ?? 0,
          skipped: json.data?.skipped ?? 0,
          totalRows: json.data?.totalRows ?? 0,
          imagesAttached: json.data?.imagesAttached ?? 0,
        };
        setFileResults((prev) => new Map(prev).set(file.name, result));
        totalCreated += result.created!;
        totalDuplicates += result.duplicates!;
      } catch (err) {
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
    if (totalDuplicates > 0) parts.push(`${totalDuplicates} 题重复已跳过`);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="导入题库"
        description="从 Excel 文件批量导入题目"
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/questions')}>
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Button>
        }
      />

      {/* Upload zone */}
      <Card>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-teal-400 bg-teal-50/50'
              : 'border-stone-300 bg-stone-50/30 hover:border-gray-400'
          }`}
        >
          <Upload className="h-10 w-10 text-stone-400 mb-3" />
          <p className="text-sm font-medium text-stone-700">
            拖拽文件到此处，或点击选择文件
          </p>
          <p className="mt-1 text-xs text-stone-500">支持 .xls 和 .xlsx 格式，可同时选择多个文件</p>
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
                    <p className="text-xs text-stone-400">
                      {(f.size / 1024).toFixed(1)} KB
                      {result?.status === 'done' && (
                        <span className="ml-2 text-green-600">
                          {result.totalRows} 题解析，{result.created} 题导入
                          {(result.duplicates ?? 0) > 0 && `，${result.duplicates} 题重复`}
                          {(result.skipped ?? 0) > 0 && `，${result.skipped} 题跳过`}
                        </span>
                      )}
                      {result?.status === 'error' && (
                        <span className="ml-2 text-red-600">{result.error}</span>
                      )}
                    </p>
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
              disabled={pendingCount === 0}
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
