'use client';

import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Trash2, Search, Download } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { FileClassificationDialog } from '@/components/shared/FileClassificationDialog';
import { QUESTION_TYPE_LABELS, QUESTION_CATEGORY_LABELS } from '@/lib/constants';

type Category = 'BASIC' | 'PROFESSIONAL';

// A file entry in the imported-files list (loaded from API or added after upload)
interface ImportedFile {
  sourceFile: string;
  count: number;
  category: string;
  byType: Record<string, number>;
  importedAt: string;
}

// Upload status for a file currently being uploaded
interface UploadStatus {
  status: 'uploading' | 'done' | 'error';
  created?: number;
  duplicates?: number;
  rows?: number;
  byType?: Record<string, number>;
  error?: string;
}

interface Props {
  examId: string;
}

export default function TabQuestions({ examId }: Props) {
  const { toast } = useToast();
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<Map<string, UploadStatus>>(new Map());
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'BASIC' | 'PROFESSIONAL'>('ALL');
  const fileRef = useRef<HTMLInputElement>(null);

  // Classification dialog state
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchImportedFiles();
  }, [examId]);

  async function fetchImportedFiles() {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/questions`);
      if (res.ok) {
        const json = await res.json();
        setImportedFiles(json.data?.byFile ?? []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingFiles(false);
    }
  }

  const totalCount = importedFiles.reduce((sum, f) => sum + f.count, 0);
  const totalByType: Record<string, number> = {};
  for (const f of importedFiles) {
    for (const [type, count] of Object.entries(f.byType)) {
      totalByType[type] = (totalByType[type] || 0) + count;
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

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
    setUploading(true);

    // Mark all files as uploading
    setUploadStatuses((prev) => {
      const next = new Map(prev);
      for (const file of pendingFiles) {
        next.set(file.name, { status: 'uploading' });
      }
      return next;
    });

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

      // Update upload statuses per file
      const fileResults = json.data?.fileResults || [];
      setUploadStatuses((prev) => {
        const next = new Map(prev);
        for (const r of fileResults) {
          if (r.error) {
            next.set(r.filename, { status: 'error', error: r.error });
          } else {
            next.set(r.filename, {
              status: 'done',
              created: r.created,
              duplicates: r.duplicates,
              rows: r.rows,
              byType: r.byType,
            });
          }
        }
        return next;
      });

      toast(`成功导入 ${json.data.created} 题`, 'success');
      // Refresh imported files list from server
      fetchImportedFiles();
    } catch (err) {
      // Mark all pending as error
      setUploadStatuses((prev) => {
        const next = new Map(prev);
        for (const file of pendingFiles) {
          next.set(file.name, {
            status: 'error',
            error: err instanceof Error ? err.message : '导入失败',
          });
        }
        return next;
      });
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      setPendingFiles([]);
    }
  }

  async function handleDeleteFile(sourceFile: string) {
    if (!confirm(`确定要删除「${sourceFile}」的所有题目吗？`)) return;
    setDeletingFile(sourceFile);
    try {
      const res = await fetch(
        `/api/admin/exams/${examId}/questions?sourceFile=${encodeURIComponent(sourceFile)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('删除失败');
      const json = await res.json();
      toast(`已删除 ${json.data?.deletedCount ?? 0} 题`, 'success');
      // Remove from local state
      setImportedFiles((prev) => prev.filter((f) => f.sourceFile !== sourceFile));
      // Clear upload status for this file
      setUploadStatuses((prev) => {
        const next = new Map(prev);
        next.delete(sourceFile);
        return next;
      });
    } catch {
      toast('删除失败', 'error');
    } finally {
      setDeletingFile(null);
    }
  }

  async function handleDeleteAll() {
    if (!confirm('确定要删除该考试的所有题目吗？此操作不可恢复。')) return;
    try {
      const res = await fetch(`/api/admin/exams/${examId}/questions`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast('题目已全部删除', 'success');
      setImportedFiles([]);
      setUploadStatuses(new Map());
    } catch {
      toast('删除失败', 'error');
    }
  }

  async function handleExportQuestions() {
    try {
      const res = await fetch(`/api/admin/questions/export?examId=${examId}`);
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `题库-${new Date().toLocaleDateString('zh-CN')}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('导出成功', 'success');
    } catch {
      toast('导出失败', 'error');
    }
  }

  // Files that are being uploaded but not yet in importedFiles
  const uploadingFiles = Array.from(uploadStatuses.entries())
    .filter(([name]) => !importedFiles.some((f) => f.sourceFile === name))
    .filter(([, status]) => status.status === 'uploading' || status.status === 'error');

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".xls,.xlsx"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Uploading files progress */}
      {uploadingFiles.length > 0 && (
        <Card>
          <div className="space-y-2">
            {uploadingFiles.map(([name, status]) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-2.5"
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-stone-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{name}</p>
                  {status.status === 'uploading' && (
                    <p className="text-xs text-stone-400">上传解析中...</p>
                  )}
                  {status.status === 'error' && (
                    <p className="text-xs text-red-600">{status.error}</p>
                  )}
                </div>
                {status.status === 'uploading' && (
                  <Loader2 className="h-5 w-5 text-teal-500 animate-spin shrink-0" />
                )}
                {status.status === 'error' && (
                  <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Question summary + file list */}
      <Card title="题库概况">
        {loadingFiles ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Total stats */}
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-stone-800">
                {totalCount}
                <span className="ml-1 text-sm font-normal text-stone-500">题</span>
              </p>
              <div className="flex items-center gap-2">
                {totalCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleDeleteAll}>
                    <Trash2 className="h-3.5 w-3.5" />
                    清空题库
                  </Button>
                )}
                {totalCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleExportQuestions}>
                    <Download className="h-3.5 w-3.5" />
                    导出题库
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                >
                  <Upload className="h-3.5 w-3.5" />
                  导入文件
                </Button>
              </div>
            </div>
            {totalCount > 0 && (
              <div className="flex flex-wrap gap-3">
                {Object.entries(totalByType).map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700"
                  >
                    {type}: {count}
                  </span>
                ))}
              </div>
            )}

            {/* Per-file list */}
            {importedFiles.length > 0 && (() => {
              const filtered = importedFiles.filter((f) => {
                if (categoryFilter !== 'ALL' && f.category !== categoryFilter) return false;
                if (searchQuery && !f.sourceFile.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                return true;
              });
              const basicCount = importedFiles.filter((f) => f.category === 'BASIC').length;
              const proCount = importedFiles.filter((f) => f.category === 'PROFESSIONAL').length;

              return (
                <div className="space-y-3 border-t border-stone-100 pt-4">
                  {/* Filter bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px] max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                      <input
                        type="text"
                        placeholder="搜索文件名..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-md border border-stone-200 bg-white py-1.5 pl-8 pr-3 text-sm text-stone-700 placeholder:text-stone-400 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {([
                        ['ALL', `全部 (${importedFiles.length})`],
                        ['BASIC', `基本题 (${basicCount})`],
                        ['PROFESSIONAL', `专业题 (${proCount})`],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setCategoryFilter(value)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            categoryFilter === value
                              ? 'bg-teal-600 text-white'
                              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* File count */}
                  <p className="text-xs text-stone-400">
                    {filtered.length === importedFiles.length
                      ? `共 ${importedFiles.length} 个文件`
                      : `筛选结果 ${filtered.length} / ${importedFiles.length} 个文件`}
                  </p>

                  {/* File rows */}
                  {filtered.length === 0 ? (
                    <p className="text-sm text-stone-400 py-2">无匹配文件</p>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((f) => {
                        const uploadStatus = uploadStatuses.get(f.sourceFile);
                        return (
                          <div
                            key={f.sourceFile}
                            className="flex items-start gap-3 rounded-lg border border-stone-100 bg-stone-50/50 p-3"
                          >
                            <FileSpreadsheet className="h-5 w-5 shrink-0 text-stone-400 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-stone-800 truncate">{f.sourceFile}</p>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                    f.category === 'BASIC'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {QUESTION_CATEGORY_LABELS[f.category] || f.category}
                                </span>
                              </div>
                              <p className="text-xs text-stone-500 mt-0.5">
                                {f.count} 题
                                {uploadStatus?.status === 'done' && uploadStatus.duplicates
                                  ? `，${uploadStatus.duplicates} 题重复跳过`
                                  : ''}
                              </p>
                              {Object.keys(f.byType).length > 0 && (
                                <p className="text-xs text-stone-400 mt-0.5">
                                  {Object.entries(f.byType)
                                    .map(([type, count]) => `${type} ${count}`)
                                    .join('、')}
                                </p>
                              )}
                            </div>
                            <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                            <button
                              onClick={() => handleDeleteFile(f.sourceFile)}
                              disabled={deletingFile === f.sourceFile}
                              className="p-1 text-stone-400 hover:text-red-500 transition-colors shrink-0 disabled:opacity-50"
                              title="删除该文件的题目"
                            >
                              {deletingFile === f.sourceFile ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {importedFiles.length === 0 && totalCount === 0 && (
              <p className="text-sm text-stone-400">尚未导入任何题目</p>
            )}
          </div>
        )}
      </Card>

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
