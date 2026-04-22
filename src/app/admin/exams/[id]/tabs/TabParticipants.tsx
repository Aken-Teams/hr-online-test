'use client';

import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Upload, Users, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface Participant {
  id: string;
  userId: string | null;
  department: string | null;
  process: string | null;
  level: string | null;
  user: { employeeNo: string; name: string; department: string } | null;
  sessionStatus: string;
}

interface Props {
  examId: string;
}

export default function TabParticipants({ examId }: Props) {
  const { toast } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadParticipants();
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadParticipants() {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/participants`);
      const json = await res.json();
      if (json.success) setParticipants(json.data);
    } catch {
      toast('加载人员列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/admin/exams/${examId}/participants`, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(json.message || '导入成功', 'success');
      await loadParticipants();
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/participants/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setParticipants((prev) => prev.filter((p) => p.id !== id));
      toast('已删除', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <Card title={<div className="flex items-center gap-2"><Users className="h-4 w-4" />应考人员 <span className="text-sm font-normal text-stone-400">({participants.length}人)</span></div>}>
        <div className="flex items-center gap-3 mb-4">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleUpload} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload className="h-4 w-4" />
            导入名单
          </Button>
          {uploading && <span className="flex items-center gap-1 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />导入中...</span>}
        </div>

        {loading ? (
          <p className="text-sm text-stone-400 text-center py-8">加载中...</p>
        ) : participants.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">尚未导入应考人员</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs text-stone-500">
                  <th className="py-2 pr-3 font-medium">工号</th>
                  <th className="py-2 pr-3 font-medium">姓名</th>
                  <th className="py-2 pr-3 font-medium">部门</th>
                  <th className="py-2 pr-3 font-medium">工序</th>
                  <th className="py-2 pr-3 font-medium">等级</th>
                  <th className="py-2 pr-3 font-medium">状态</th>
                  <th className="py-2 font-medium w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="border-b border-stone-50">
                    <td className="py-2 pr-3">{p.user?.employeeNo ?? '-'}</td>
                    <td className="py-2 pr-3 font-medium">{p.user?.name ?? '-'}</td>
                    <td className="py-2 pr-3 text-stone-600">{p.user?.department ?? '-'}</td>
                    <td className="py-2 pr-3 text-stone-600">{p.process ?? '-'}</td>
                    <td className="py-2 pr-3 text-stone-600">{p.level ?? '-'}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.sessionStatus === 'NOT_STARTED' ? 'bg-stone-100 text-stone-600'
                        : (p.sessionStatus === 'COMPLETED' || p.sessionStatus === 'SUBMITTED') ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                      }`}>
                        {p.sessionStatus === 'NOT_STARTED' ? '未考' : (p.sessionStatus === 'COMPLETED' || p.sessionStatus === 'SUBMITTED') ? '已完成' : '进行中'}
                      </span>
                    </td>
                    <td className="py-2">
                      {p.sessionStatus === 'NOT_STARTED' && (
                        <button type="button" onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:text-red-700">移除</button>
                      )}
                    </td>
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
