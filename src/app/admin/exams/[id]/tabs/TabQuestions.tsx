'use client';

import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Trash2, Search, Download, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { FileClassificationDialog } from '@/components/shared/FileClassificationDialog';
import { PoolQuestionsDialog } from '@/components/shared/PoolQuestionsDialog';
import { partitionFilesByClassification } from '@/lib/excel-client';
import { QUESTION_TYPE_LABELS, QUESTION_CATEGORY_LABELS } from '@/lib/constants';

type Category = 'BASIC' | 'PROFESSIONAL';

// A file entry in the imported-files list (loaded from API or added after upload)
interface ImportedFile {
  sourceFile: string;
  count: number;
  category: string;
  byCategory?: Record<string, number>;
  byType: Record<string, number>;
  importedAt: string;
}

// Upload status for a file currently being uploaded
interface UploadStatus {
  status: 'uploading' | 'done' | 'error';
  created?: number;
  existed?: number;
  replaced?: number;
  rows?: number;
  byType?: Record<string, number>;
  error?: string;
}

interface Props {
  examId: string;
  hasResults?: boolean;
  isArchived?: boolean;
}

export default function TabQuestions({ examId, hasResults = false, isArchived = false }: Props) {
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

  // 抽题池预览
  interface PoolRule { type: string; needed: number; profNeeded: number; profAvail: number; basicAvail: number; available: number; sufficient: boolean }
  interface PoolCombo { process: string | null; level: string | null; rules: PoolRule[] }
  const [poolCombos, setPoolCombos] = useState<PoolCombo[] | null>(null);
  const [poolHasParticipants, setPoolHasParticipants] = useState(true);
  const [poolHasUpload, setPoolHasUpload] = useState(false);
  const [loadingPool, setLoadingPool] = useState(false);
  const [viewPool, setViewPool] = useState<{ process: string | null; level: string | null; type: string } | null>(null);
  // 预览筛选：工序 / 级别 / 题型
  const [fProcess, setFProcess] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fType, setFType] = useState('');

  async function loadPoolPreview() {
    setLoadingPool(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/question-pool-preview`);
      const json = await res.json();
      if (json.success) {
        setPoolCombos(json.data.combos);
        setPoolHasParticipants(json.data.hasParticipants);
        setPoolHasUpload(json.data.hasUpload);
      } else {
        toast(json.error || '加载失败', 'error');
      }
    } catch {
      toast('加载抽题池失败', 'error');
    } finally {
      setLoadingPool(false);
    }
  }

  useEffect(() => {
    fetchImportedFiles();
  }, [examId]);

  // 已锁定（已归档，或已有考试记录）：自动载入抽题范围，让「下方可预览」立即有内容
  useEffect(() => {
    if ((isArchived || hasResults) && examId) loadPoolPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArchived, hasResults, examId]);

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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
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
      const { withCategory, withoutCategory } = await partitionFilesByClassification(validFiles);

      // Files with built-in classification skip the dialog and upload directly
      if (withCategory.length > 0) {
        await uploadFiles(withCategory, new Map());
      }

      // Files without built-in classification go through the dialog
      if (withoutCategory.length > 0) {
        setPendingFiles(withoutCategory);
        setDialogOpen(true);
      }
    }

    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClassificationConfirm(classifications: Map<string, Category>) {
    setDialogOpen(false);
    uploadFiles(pendingFiles, classifications);
  }

  async function uploadFiles(filesToUpload: File[], classifications: Map<string, Category>) {
    setUploading(true);

    // Mark all files as uploading
    setUploadStatuses((prev) => {
      const next = new Map(prev);
      for (const file of filesToUpload) {
        next.set(file.name, { status: 'uploading' });
      }
      return next;
    });

    try {
      const formData = new FormData();
      for (const file of filesToUpload) {
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
              existed: r.existed,
              replaced: r.replaced,
              rows: r.rows,
              byType: r.byType,
            });
          }
        }
        return next;
      });

      const msg = `本场新增 ${json.data.created} 题（独有）${json.data.existed > 0 ? `，关联复用中央题库 ${json.data.existed} 题` : ''}`;
      toast(msg, 'success');
      // Refresh imported files list from server
      fetchImportedFiles();
    } catch (err) {
      // Mark all pending as error
      setUploadStatuses((prev) => {
        const next = new Map(prev);
        for (const file of filesToUpload) {
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

      {/* 题库管理：预览 + 导入 并排工具列 */}
      <Card
        title="题库管理"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived && (
              <Button variant="secondary" size="sm" onClick={loadPoolPreview} loading={loadingPool}>
                <Eye className="h-3.5 w-3.5" />
                {poolCombos ? '重新预览' : '预览抽题池'}
              </Button>
            )}
            {totalCount > 0 && !hasResults && (
              <Button variant="outline" size="sm" onClick={handleDeleteAll}>
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </Button>
            )}
            {totalCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportQuestions}>
                <Download className="h-3.5 w-3.5" />
                导出
              </Button>
            )}
            {!hasResults && (
              <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                <Upload className="h-3.5 w-3.5" />
                导入文件
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            {isArchived
              ? <>考试已归档，以下为本场按工序/级别的抽题范围（仅供查看）。</>
              : hasResults
                ? <>题目规则已锁定，题库不可修改；下方可预览本场抽题来源。</>
                : <><strong>不上传</strong> → 中央题库自动抽题；<strong>上传</strong> → 本场专属（不重复）。</>}
            <strong> 点行可查看实际题目</strong>。
            {poolCombos != null && (
              poolHasUpload
                ? <span className="ml-1 text-teal-700">（来源 = 本场独有 + 关联中央）</span>
                : <span className="ml-1 text-teal-700">（来源 = 中央题库）</span>
            )}
          </p>

          {poolCombos && !poolHasParticipants && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
              尚未指派应考人员，无法预览。请先到「应考人员」添加考生（抽题依考生的工序/级别）。
            </p>
          )}

          {poolCombos && poolHasParticipants && (() => {
            const rows = poolCombos.flatMap((c) => c.rules.map((r) => ({ process: c.process, level: c.level, ...r })));
            const procOpts = [...new Set(rows.map((r) => r.process).filter(Boolean))] as string[];
            const lvlOpts = [...new Set(rows.map((r) => r.level).filter(Boolean))] as string[];
            const typeOpts = [...new Set(rows.map((r) => r.type))] as string[];
            const filtered = rows.filter((r) =>
              (!fProcess || r.process === fProcess) &&
              (!fLevel || r.level === fLevel) &&
              (!fType || r.type === fType)
            );
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 sm:max-w-2xl">
                  <CustomSelect label="工序" options={[{ value: '', label: '全部工序' }, ...procOpts.map((p) => ({ value: p, label: p }))]} value={fProcess} onChange={setFProcess} />
                  <CustomSelect label="级别" options={[{ value: '', label: '全部级别' }, ...lvlOpts.map((l) => ({ value: l, label: l }))]} value={fLevel} onChange={setFLevel} />
                  <CustomSelect label="题型" options={[{ value: '', label: '全部题型' }, ...typeOpts.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t as keyof typeof QUESTION_TYPE_LABELS] || t }))]} value={fType} onChange={setFType} />
                </div>
                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                        <th className="py-2 px-3 text-left font-medium">工序</th>
                        <th className="py-2 px-3 text-left font-medium">级别</th>
                        <th className="py-2 px-3 text-left font-medium">题型</th>
                        <th className="py-2 px-3 text-right font-medium">需要</th>
                        <th className="py-2 px-3 text-right font-medium">专业可用</th>
                        <th className="py-2 px-3 text-right font-medium">基本可用</th>
                        <th className="py-2 px-3 text-center font-medium">状态</th>
                        <th className="py-2 px-3 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={8} className="py-6 text-center text-sm text-stone-400">无符合条件的记录</td></tr>
                      ) : filtered.map((r, i) => (
                        <tr
                          key={i}
                          onClick={() => setViewPool({ process: r.process, level: r.level, type: r.type })}
                          className="group cursor-pointer border-b border-stone-50 last:border-0 hover:bg-teal-50/40"
                        >
                          <td className="py-1.5 px-3">{r.process || '—'}</td>
                          <td className="py-1.5 px-3">{r.level || '—'}</td>
                          <td className="py-1.5 px-3">{QUESTION_TYPE_LABELS[r.type as keyof typeof QUESTION_TYPE_LABELS] || r.type}</td>
                          <td className="py-1.5 px-3 text-right">{r.needed}</td>
                          <td className="py-1.5 px-3 text-right">{r.profAvail}</td>
                          <td className="py-1.5 px-3 text-right">{r.basicAvail}</td>
                          <td className="py-1.5 px-3 text-center">
                            {r.sufficient
                              ? <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">充足</span>
                              : <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">不足</span>}
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <span className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2 py-0.5 text-xs font-medium text-stone-500 whitespace-nowrap group-hover:border-teal-300 group-hover:text-teal-700">
                              <Eye className="h-3 w-3" /> 查看
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      </Card>

      <PoolQuestionsDialog
        examId={examId}
        open={viewPool !== null}
        onClose={() => setViewPool(null)}
        process={viewPool?.process ?? null}
        level={viewPool?.level ?? null}
        type={viewPool?.type ?? null}
      />

      {totalCount > 0 && (
      <Card title="本场专属题库">
        {loadingFiles ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : (
          <div className="space-y-4">
            {/* 操作按钮已移到上方「题库管理」工具列 */}
            <p className="text-sm text-stone-700">本场独有 <strong className="text-stone-900">{totalCount}</strong> 题</p>
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
                if (categoryFilter !== 'ALL') {
                  // Use byCategory if available, otherwise fall back to category
                  const cats = f.byCategory ? Object.keys(f.byCategory) : [f.category];
                  if (!cats.includes(categoryFilter)) return false;
                }
                if (searchQuery && !f.sourceFile.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                return true;
              });
              const basicCount = importedFiles.filter((f) => {
                const cats = f.byCategory ? Object.keys(f.byCategory) : [f.category];
                return cats.includes('BASIC');
              }).length;
              const proCount = importedFiles.filter((f) => {
                const cats = f.byCategory ? Object.keys(f.byCategory) : [f.category];
                return cats.includes('PROFESSIONAL');
              }).length;

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
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-stone-800 truncate">{f.sourceFile}</p>
                                {f.byCategory && Object.keys(f.byCategory).length > 1 ? (
                                  Object.entries(f.byCategory).map(([cat, count]) => (
                                    <span
                                      key={cat}
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                        cat === 'BASIC'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-amber-100 text-amber-700'
                                      }`}
                                    >
                                      {QUESTION_CATEGORY_LABELS[cat] || cat} {count}
                                    </span>
                                  ))
                                ) : (
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                      f.category === 'BASIC'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {QUESTION_CATEGORY_LABELS[f.category] || f.category}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-stone-500 mt-0.5">
                                {f.count} 题
                                {uploadStatus?.status === 'done' && uploadStatus.replaced
                                  ? `，已覆盖`
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
                            {!hasResults && (
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {hasResults && totalCount > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                该考试已有考试记录，题库已锁定不可修改。如需修改题库，请先在「成绩管理」中重置成绩。
              </p>
            )}

          </div>
        )}
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
