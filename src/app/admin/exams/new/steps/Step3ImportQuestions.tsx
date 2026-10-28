'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { FileClassificationDialog } from '@/components/shared/FileClassificationDialog';
import { PoolQuestionsDialog } from '@/components/shared/PoolQuestionsDialog';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { partitionFilesByClassification } from '@/lib/excel-client';
import { QUESTION_TYPE_LABELS } from '@/lib/constants';

type Category = 'BASIC' | 'PROFESSIONAL';

interface FileResult {
  filename: string;
  parsed: { department: string; process: string; level: string } | null;
  rows: number;
  created: number;
  existed?: number;
  replaced: number;
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

  // 抽题池预览（扫描这场会从哪些题里抽、够不够）
  interface PoolRule { type: string; needed: number; profAvail: number; basicAvail: number; available: number; sufficient: boolean }
  interface PoolCombo { process: string | null; level: string | null; rules: PoolRule[] }
  const [poolCombos, setPoolCombos] = useState<PoolCombo[] | null>(null);
  const [poolHasParticipants, setPoolHasParticipants] = useState(true);
  const [poolHasUpload, setPoolHasUpload] = useState(false);
  const [loadingPool, setLoadingPool] = useState(false);
  const [viewPool, setViewPool] = useState<{ process: string | null; level: string | null; type: string } | null>(null);
  const [fProcess, setFProcess] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fType, setFType] = useState('');

  async function loadPoolPreview() {
    if (!examId) return;
    setLoadingPool(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/question-pool-preview`);
      const json = await res.json();
      if (json.success) {
        setPoolCombos(json.data.combos);
        setPoolHasParticipants(json.data.hasParticipants);
        setPoolHasUpload(json.data.hasUpload);
      } else {
        toast(json.error || '预览失败', 'error');
      }
    } catch {
      toast('预览抽题池失败', 'error');
    } finally {
      setLoadingPool(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
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
    if (!examId) return;

    setUploading(true);
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

      onResults([...results, ...(json.data.fileResults || [])]);
      toast(`本场新增 ${json.data.created} 题（独有）${json.data.existed > 0 ? `，关联复用中央题库 ${json.data.existed} 题` : ''}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      setPendingFiles([]);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="导入题库（可选）">
        <div className="space-y-4">
          {/* 重点说明：本步骤可跳过，系统会用现有题库自动抽题 */}
          <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3">
            <p className="text-sm leading-relaxed text-teal-800">
              <strong>不上传</strong> → 从中央题库按工序/级别自动抽题；<strong>上传 Excel</strong> → 已有的自动复用、新题归本场（不产生重复）。
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-stone-600">
                上传题库 Excel 文件，系统会自动解析题目内容。
              </p>
              <p className="mt-1 text-xs text-stone-500">
                支持原始题库文件和导出文件格式。导出文件自动识别分类，无需手动分类。
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

      {/* 抽题池预览：扫描这场各工序/级别会从哪些题抽、够不够 */}
      <Card
        title="抽题池预览"
        actions={examId && (
          <Button variant="secondary" size="sm" onClick={loadPoolPreview} loading={loadingPool}>
            {poolCombos ? '重新扫描' : '扫描抽题池'}
          </Button>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-stone-600">
            按<strong>每位考生的工序 + 级别</strong>、依<strong>考试规则的题型</strong>扫描「需要 vs 可用」题数，<strong>点题型可查看会抽哪些题目</strong>。
            {poolCombos != null && (
              poolHasUpload
                ? <span className="ml-1 text-teal-700">（本场已上传题库，抽题来源 = 本场独有题 + 关联的中央题）</span>
                : <span className="ml-1 text-teal-700">（本场未上传，抽题来源 = 中央题库）</span>
            )}
          </p>
          {!examId && <p className="text-xs text-amber-600">请先保存草稿</p>}

          {poolCombos && !poolHasParticipants && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
              尚未指派应考人员，无法扫描。请先回「指派人员」添加考生（抽题依考生的工序/级别）。
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
                        {r.rows} 题解析，本场新增 {r.created} 题（独有）{r.existed ? `，关联复用中央题库 ${r.existed} 题` : ''}
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
