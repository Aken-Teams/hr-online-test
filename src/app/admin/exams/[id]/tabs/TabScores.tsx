'use client';

import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, Download, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

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
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-6">
      <Card title="成绩管理">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleImport} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload className="h-4 w-4" />
            导入实操分
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4" />
            下载模板
          </Button>
          {uploading && <span className="flex items-center gap-1 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />导入中...</span>}
        </div>

        {loading ? (
          <p className="text-sm text-stone-400 text-center py-8">加载中...</p>
        ) : scores.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">暂无成绩数据</p>
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
                {scores.map((s) => (
                  <tr key={s.sessionId} className="border-b border-stone-50">
                    <td className="py-2 pr-3">{s.employeeNo}</td>
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
          </div>
        )}
      </Card>
    </div>
  );
}
