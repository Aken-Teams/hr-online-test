'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, Download, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface ScoreRow {
  sessionId: string;
  employeeNo: string;
  name: string;
  department: string;
  process: string | null;
  level: string | null;
  onlineScore: number;
  practicalScore: number | null;
  combinedScore: number | null;
}

interface Props {
  examId: string;
}

export default function TabScores({ examId }: Props) {
  const { toast } = useToast();
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [processFilter, setProcessFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    loadScores();
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadScores() {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/offline-scores`);
      const json = await res.json();
      if (json.success) setScores(json.data);
    } catch {
      toast('加载成绩失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  const processOptions = useMemo(() => {
    const set = new Set<string>();
    scores.forEach((s) => s.process && set.add(s.process));
    return [...set].sort();
  }, [scores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scores.filter((s) => {
      if (processFilter && (s.process ?? '') !== processFilter) return false;
      if (q) {
        const hay = [s.name, s.employeeNo, s.department, s.process ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scores, query, processFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, processFilter]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/admin/exams/${examId}/offline-scores`, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`更新 ${json.data.updated} 条成绩`, 'success');
      await loadScores();
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDownloadTemplate() {
    window.open(`/api/admin/exams/${examId}/offline-scores?action=template`, '_blank');
  }

  async function handleResetScores() {
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/reset-scores`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '重置失败');
      toast(`已清除 ${json.data.deletedSessions} 条考试记录`, 'success');
      setShowResetDialog(false);
      setScores([]);
    } catch (err) {
      toast(err instanceof Error ? err.message : '重置失败', 'error');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="成绩管理">
        {/* 查询筛选（左） + 操作按钮（右）同一列 */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          {!loading && scores.length > 0 ? (
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜寻姓名、工号或工序"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 sm:max-w-xs"
              />
              <div className="w-full sm:w-40">
                <CustomSelect
                  options={[
                    { value: '', label: '全部工序' },
                    ...processOptions.map((p) => ({ value: p, label: p })),
                  ]}
                  value={processFilter}
                  onChange={setProcessFilter}
                />
              </div>
              <span className="text-xs text-stone-400">共 {filtered.length} 人</span>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleImport} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Upload className="h-4 w-4" />
              导入实操分
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4" />
              下载模板
            </Button>
            {scores.length > 0 && (
              <Button variant="outline" onClick={() => setShowResetDialog(true)}>
                <RotateCcw className="h-4 w-4" />
                重置成绩
              </Button>
            )}
            {uploading && <span className="flex items-center gap-1 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />导入中...</span>}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-stone-400 text-center py-8">加载中...</p>
        ) : scores.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">暂无成绩数据</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">没有符合条件的成绩</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs text-stone-500">
                  <th className="py-2 pr-3 font-medium">工号</th>
                  <th className="py-2 pr-3 font-medium">姓名</th>
                  <th className="py-2 pr-3 font-medium">部门</th>
                  <th className="py-2 pr-3 font-medium">工序</th>
                  <th className="py-2 pr-3 font-medium text-right">线上分</th>
                  <th className="py-2 pr-3 font-medium text-right">实操分</th>
                  <th className="py-2 font-medium text-right">综合分</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((s) => (
                  <tr key={s.sessionId} className="border-b border-stone-50">
                    <td className="py-2 pr-3">{s.employeeNo?.startsWith('AUTO_') ? '-' : s.employeeNo}</td>
                    <td className="py-2 pr-3 font-medium">{s.name}</td>
                    <td className="py-2 pr-3 text-stone-600">{s.department}</td>
                    <td className="py-2 pr-3 text-stone-600">{s.process ?? '-'}</td>
                    <td className="py-2 pr-3 text-right">{s.onlineScore}</td>
                    <td className="py-2 pr-3 text-right">{s.practicalScore ?? <span className="text-stone-300">—</span>}</td>
                    <td className="py-2 text-right font-semibold">{s.combinedScore ?? <span className="text-stone-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-sm">
                <span className="text-stone-500">
                  第 {pageSafe} / {totalPages} 页
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onConfirm={handleResetScores}
        title="重置成绩"
        message="此操作将删除所有考试记录、答题数据和成绩，但保留题库和应考人员配置。删除后无法恢复，确认重置？"
        confirmText="确认重置"
        variant="danger"
        loading={resetting}
      />
    </div>
  );
}
